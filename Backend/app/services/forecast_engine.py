# backend/worker/tasks/ml_forecaster.py
"""
AI Hospital Command Center — ML Forecasting Engine
===================================================
Implements a production-grade time-series forecasting pipeline for:
  - ICU occupancy (t+12 h horizon)
  - ER congestion probability (t+12 h horizon)
  - Patient inflow volume (t+12 h horizon)

Architecture
------------
1. MockTelemetryGenerator  — Generates realistic synthetic telemetry history
2. FeatureEngineer         — Builds lag features, rolling stats, time features
3. HospitalForecaster      — Wraps XGBoost with train / predict lifecycle
4. ForecastingPipeline     — End-to-end orchestrator called by Celery

All heavy training/inference is designed to run inside a Celery worker.
Trained models are persisted to disk via joblib so inference is fast.

Usage (standalone test)
-----------------------
    python -m backend.worker.tasks.ml_forecaster

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

# ── Structured logger ──────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)

# ── Model artefact directory ───────────────────────────────────────────────────
MODEL_DIR = Path(os.getenv("MODEL_DIR", "/tmp/hospital_models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ── Forecast horizon ──────────────────────────────────────────────────────────
FORECAST_HORIZON_STEPS = 12   # number of 1-hour steps ahead to predict

# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class TelemetryRecord:
    """Single hourly observation of hospital operational state."""

    timestamp: datetime
    hour_of_day: int
    day_of_week: int          # 0=Mon … 6=Sun
    is_weekend: bool

    # OPD
    opd_queue: int
    opd_utilization: float

    # ER
    er_queue: int
    er_utilization: float
    er_congestion_prob: float

    # ICU
    icu_occupied: int
    icu_capacity: int
    icu_occupancy_pct: float

    # Ward
    ward_queue: int
    ward_utilization: float

    # Aggregates
    total_patients_in_hospital: int
    avg_wait_time_hours: float

    # Targets (what we want to predict)
    icu_occupancy_pct_t12: float = 0.0    # ICU occupancy 12h later
    er_congestion_t12: float = 0.0        # ER congestion prob 12h later
    patient_inflow_t12: int = 0           # total new arrivals in next 12h

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat()
        return d


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic telemetry generator
# ─────────────────────────────────────────────────────────────────────────────

class DatabaseTelemetryFetcher:
    """
    Fetches actual patient flow telemetry from PostgreSQL for model training.
    """
    
    def fetch_hourly_features(self, lookback_hours: int = 168) -> pd.DataFrame:
        """
        Aggregates PatientEncounter records by hour.
        """
        from sqlalchemy import text
        from app.core.database import SessionLocal
        
        logger.info(f"Fetching {lookback_hours} hours of historical telemetry from database...")
        
        query = text("""
            WITH hourly_stats AS (
                SELECT 
                    date_trunc('hour', arrival_time) AS hour,
                    COUNT(*) AS patient_inflow,
                    SUM(CASE WHEN department = 'ER' AND status = 'Waiting' THEN 1 ELSE 0 END) AS er_queue,
                    SUM(CASE WHEN department = 'ICU' AND status IN ('Waiting', 'InTreatment') THEN 1 ELSE 0 END) AS icu_occupied,
                    SUM(CASE WHEN department = 'Ward' AND status IN ('Waiting', 'InTreatment') THEN 1 ELSE 0 END) AS ward_occupied,
                    AVG(triage_level) AS avg_acuity
                FROM patient_encounters
                WHERE arrival_time >= NOW() - INTERVAL '1 hour' * :lookback
                GROUP BY 1
            )
            SELECT 
                hour AS timestamp,
                EXTRACT(hour FROM hour) AS hour_of_day,
                EXTRACT(dow FROM hour) AS day_of_week,
                CASE WHEN EXTRACT(dow FROM hour) IN (0, 6) THEN 1 ELSE 0 END AS is_weekend,
                patient_inflow,
                er_queue,
                (icu_occupied::float / 10.0) AS icu_occupancy_pct,
                (ward_occupied::float / 30.0) AS ward_occupancy_pct,
                COALESCE(avg_acuity, 3.0) AS avg_acuity
            FROM hourly_stats
            ORDER BY timestamp ASC;
        """)
        
        with SessionLocal() as db:
            result = db.execute(query, {"lookback": lookback_hours})
            rows = result.fetchall()
            
        if len(rows) < 48:
            raise ValueError(f"Insufficient historical data for forecasting. Found {len(rows)} rows, minimum 48 required.")
            
        df = pd.DataFrame([dict(r._mapping) for r in rows])
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        
        horizon = FORECAST_HORIZON_STEPS
        df["icu_occupancy_pct_t12"] = df["icu_occupancy_pct"].shift(-horizon).ffill()
        df["er_congestion_t12"] = df["er_queue"].shift(-horizon).ffill() / 50.0  # Proxy
        df["patient_inflow_t12"] = df["patient_inflow"].shift(-horizon).ffill().astype(int)

        df = df.iloc[:-horizon].reset_index(drop=True)
        return df


# ─────────────────────────────────────────────────────────────────────────────
# Feature engineering
# ─────────────────────────────────────────────────────────────────────────────

class FeatureEngineer:
    """
    Transforms raw telemetry DataFrame into ML-ready feature matrix.

    Features
    --------
    - Lag features  : t-1, t-2, t-4, t-8, t-24 for key metrics
    - Rolling stats : 4h and 24h rolling mean/std
    - Cyclical time : sin/cos encoding of hour-of-day, day-of-week
    - Interaction   : er_util × icu_pct, opd_queue × hour_load
    """

    LAG_COLS = [
        "er_utilization", "er_congestion_prob", "er_queue",
        "icu_occupancy_pct", "icu_occupied",
        "opd_utilization", "total_patients_in_hospital",
        "avg_wait_time_hours",
    ]
    LAG_STEPS = [1, 2, 4, 8, 24]
    ROLLING_WINDOWS = [4, 24]

    def fit_transform(self, df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
        """Build features; returns (feature_df, feature_names)."""
        df = df.copy().sort_values("timestamp").reset_index(drop=True)

        # ── Cyclical time encoding ──────────────────────────────────────────
        df["hour_sin"] = np.sin(2 * np.pi * df["hour_of_day"] / 24)
        df["hour_cos"] = np.cos(2 * np.pi * df["hour_of_day"] / 24)
        df["dow_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7)
        df["dow_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7)

        # ── Lag features ───────────────────────────────────────────────────
        for col in self.LAG_COLS:
            for lag in self.LAG_STEPS:
                df[f"{col}_lag{lag}"] = df[col].shift(lag)

        # ── Rolling statistics ─────────────────────────────────────────────
        for col in ["er_utilization", "icu_occupancy_pct", "er_queue"]:
            for win in self.ROLLING_WINDOWS:
                df[f"{col}_roll{win}_mean"] = (
                    df[col].rolling(win, min_periods=1).mean()
                )
                df[f"{col}_roll{win}_std"] = (
                    df[col].rolling(win, min_periods=1).std().fillna(0)
                )

        # ── Interaction features ───────────────────────────────────────────
        df["er_icu_pressure"] = df["er_utilization"] * df["icu_occupancy_pct"]
        df["opd_hour_load"] = df["opd_queue"] * df["hour_sin"].abs()

        # Drop rows that have NaN from lagging
        max_lag = max(self.LAG_STEPS)
        df = df.iloc[max_lag:].reset_index(drop=True)

        # Identify feature columns (exclude targets + identifiers)
        exclude = {
            "timestamp", "icu_occupancy_pct_t12",
            "er_congestion_t12", "patient_inflow_t12",
        }
        feature_cols = [c for c in df.columns if c not in exclude]
        return df, feature_cols

    def transform(self, df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
        """Apply same transformations for inference (no target columns required)."""
        df, _ = self.fit_transform(df)
        present = [c for c in feature_cols if c in df.columns]
        missing = [c for c in feature_cols if c not in df.columns]
        for m in missing:
            df[m] = 0.0
        return df[present + missing]


# ─────────────────────────────────────────────────────────────────────────────
# Forecasting model
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ForecastResult:
    """Output from a single forecast call."""

    forecast_horizon_hours: int
    generated_at: str
    icu_occupancy_t12: float        # 0.0–1.0
    er_congestion_t12: float        # 0.0–1.0
    patient_inflow_t12: int
    risk_level: str                 # "low" | "medium" | "high" | "critical"
    model_mae_icu: float
    model_mae_er: float
    feature_importances: dict[str, float]


class HospitalForecaster:
    """
    Trains and serves XGBoost forecasting models for hospital operations.

    Three separate models:
    1. ICU occupancy (regression)
    2. ER congestion probability (regression)
    3. Patient inflow count (regression → rounded int)
    """

    MODEL_NAMES = ["icu_occ", "er_cong", "inflow"]

    def __init__(self) -> None:
        self.models: dict[str, XGBRegressor | RandomForestRegressor] = {}
        self.scaler = StandardScaler()
        self.feature_cols: list[str] = []
        self.mae_scores: dict[str, float] = {}
        self.feature_engineer = FeatureEngineer()

    # ── Training ──────────────────────────────────────────────────────────────

    def train(self, df: pd.DataFrame) -> dict[str, float]:
        import mlflow
        import mlflow.xgboost
        from datetime import datetime
        from app.services.model_registry import notify_drift
        
        logger.info("Starting model training on %d samples…", len(df))
        
        self.feature_cols = [
            "hour_of_day", "day_of_week", "is_weekend", 
            "er_queue", "icu_occupancy_pct", "avg_acuity"
        ]
        
        for col in self.feature_cols:
            if col not in df.columns:
                df[col] = 0.0
                
        feat_df = df.copy()

        X = feat_df[self.feature_cols].values
        y_icu = feat_df["icu_occupancy_pct_t12"].values
        y_er = feat_df["er_congestion_t12"].values
        y_inflow = feat_df["patient_inflow_t12"].values

        X_scaled = self.scaler.fit_transform(X)

        )
        _, _, y_in_tr, y_in_te = train_test_split(
            X_scaled, y_inflow, test_size=0.2, shuffle=False
        )

        xgb_params = dict(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            tree_method="hist",
            verbosity=0,
        )

        # ICU model — XGBoost
        logger.info("Training ICU occupancy model…")
        self.models["icu_occ"] = XGBRegressor(**xgb_params)
        self.models["icu_occ"].fit(X_tr, y_icu_tr)
        icu_preds = self.models["icu_occ"].predict(X_te)
        self.mae_scores["icu_occ"] = float(mean_absolute_error(y_icu_te, icu_preds))
        logger.info("ICU MAE: %.4f", self.mae_scores["icu_occ"])

        # ER congestion model — XGBoost
        logger.info("Training ER congestion model…")
        self.models["er_cong"] = XGBRegressor(**xgb_params)
        self.models["er_cong"].fit(X_tr, y_er_tr)
        er_preds = self.models["er_cong"].predict(X_te)
        self.mae_scores["er_cong"] = float(mean_absolute_error(y_er_te, er_preds))
        logger.info("ER congestion MAE: %.4f", self.mae_scores["er_cong"])

        # Patient inflow model — RandomForest (more robust for counts)
        logger.info("Training patient inflow model…")
        self.models["inflow"] = RandomForestRegressor(
            n_estimators=150, max_depth=8, random_state=42, n_jobs=-1
        )
        self.models["inflow"].fit(X_tr, y_in_tr)
        in_preds = self.models["inflow"].predict(X_te)
        self.mae_scores["inflow"] = float(mean_absolute_error(y_in_te, in_preds))
        logger.info("Inflow MAE: %.4f", self.mae_scores["inflow"])

        self._persist_models()
        return self.mae_scores

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict(self, recent_df: pd.DataFrame) -> ForecastResult:
        """
        Generate 12-hour ahead forecasts from recent telemetry.

        Parameters
        ----------
        recent_df : pd.DataFrame
            At least 24 rows of recent telemetry (so lag features are valid).

        Returns
        -------
        ForecastResult
        """
        if not self.models:
            self._load_models()

        feat_df = self.feature_engineer.transform(recent_df, self.feature_cols)
        X = self.scaler.transform(feat_df[self.feature_cols].values)

        # Use last row as the "current state" to predict from
        X_last = X[-1:, :]

        icu_pred = float(np.clip(self.models["icu_occ"].predict(X_last)[0], 0, 1))
        er_pred = float(np.clip(self.models["er_cong"].predict(X_last)[0], 0, 1))
        in_pred = int(max(0, round(self.models["inflow"].predict(X_last)[0])))

        # Risk classification
        risk_level = self._classify_risk(icu_pred, er_pred)

        # Feature importance from XGBoost (top-10)
        importances = {}
        try:
            raw_imp = self.models["icu_occ"].feature_importances_
            top_idx = np.argsort(raw_imp)[::-1][:10]
            importances = {
                self.feature_cols[i]: round(float(raw_imp[i]), 5)
                for i in top_idx
                if i < len(self.feature_cols)
            }
        except Exception:  # noqa: BLE001
            pass

        return ForecastResult(
            forecast_horizon_hours=FORECAST_HORIZON_STEPS,
            generated_at=datetime.utcnow().isoformat(),
            icu_occupancy_t12=round(icu_pred, 4),
            er_congestion_t12=round(er_pred, 4),
            patient_inflow_t12=in_pred,
            risk_level=risk_level,
            model_mae_icu=self.mae_scores.get("icu_occ", -1.0),
            model_mae_er=self.mae_scores.get("er_cong", -1.0),
            feature_importances=importances,
        )

    # ── Risk classification ────────────────────────────────────────────────────

    @staticmethod
    def _classify_risk(icu_occ: float, er_cong: float) -> str:
        score = 0.6 * icu_occ + 0.4 * er_cong
        if score < 0.4:
            return "low"
        if score < 0.65:
            return "medium"
        if score < 0.85:
            return "high"
        return "critical"

    # ── Persistence ────────────────────────────────────────────────────────────

    def _persist_models(self) -> None:
        for name, model in self.models.items():
            path = MODEL_DIR / f"{name}.joblib"
            joblib.dump(model, path)
            logger.info("Saved model → %s", path)
        joblib.dump(self.scaler, MODEL_DIR / "scaler.joblib")
        joblib.dump(self.feature_cols, MODEL_DIR / "feature_cols.joblib")
        logger.info("Model artefacts persisted to %s", MODEL_DIR)

    def _load_models(self) -> None:
        for name in self.MODEL_NAMES:
            path = MODEL_DIR / f"{name}.joblib"
            if path.exists():
                self.models[name] = joblib.load(path)
                logger.info("Loaded model ← %s", path)
            else:
                raise FileNotFoundError(
                    f"Model artefact not found: {path}. Run training first."
                )
        scaler_path = MODEL_DIR / "scaler.joblib"
        if scaler_path.exists():
            self.scaler = joblib.load(scaler_path)
        fcol_path = MODEL_DIR / "feature_cols.joblib"
        if fcol_path.exists():
            self.feature_cols = joblib.load(fcol_path)


# ─────────────────────────────────────────────────────────────────────────────
# End-to-end pipeline (Celery task entry point)
# ─────────────────────────────────────────────────────────────────────────────

def run_forecasting_pipeline(
    n_training_hours: int = 8760,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Full train → predict cycle.  Called by the Celery forecasting task.

    Parameters
    ----------
    n_training_hours : int
        Hours of synthetic history to generate for training.
    seed : int
        RNG seed.

    Returns
    -------
    dict
        Serialisable forecast result + training metrics.
    """
    logger.info("=== Forecasting Pipeline START ===")
    t0 = time.time()

    # 1. Generate training data
    gen = MockTelemetryGenerator(seed=seed)
    df = gen.generate(n_hours=n_training_hours)

    # 2. Train
    forecaster = HospitalForecaster()
    mae_scores = forecaster.train(df)

    # 3. Predict using last 48 rows as "recent telemetry"
    recent = df.tail(48).copy()
    result = forecaster.predict(recent)

    elapsed = round(time.time() - t0, 2)
    logger.info("Pipeline complete in %.2fs", elapsed)

    output = {
        "pipeline_duration_s": elapsed,
        "training_samples": len(df),
        "mae_scores": mae_scores,
        "forecast": {
            "forecast_horizon_hours": result.forecast_horizon_hours,
            "generated_at": result.generated_at,
            "icu_occupancy_t12": result.icu_occupancy_t12,
            "er_congestion_t12": result.er_congestion_t12,
            "patient_inflow_t12": result.patient_inflow_t12,
            "risk_level": result.risk_level,
            "model_mae_icu": result.model_mae_icu,
            "model_mae_er": result.model_mae_er,
            "top_features": result.feature_importances,
        },
    }
    logger.info("Forecast output:\n%s", json.dumps(output["forecast"], indent=2))
    return output


# ─────────────────────────────────────────────────────────────────────────────
# Standalone test entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pprint

    result = run_forecasting_pipeline(n_training_hours=2160, seed=2024)
    print("\n=== Forecasting Pipeline Result ===")
    pprint.pprint(result)
