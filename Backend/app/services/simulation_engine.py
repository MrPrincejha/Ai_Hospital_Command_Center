# backend/app/services/simulation_engine.py
"""
AI Hospital Command Center — Discrete Event Simulation Engine
=============================================================
Implements a production-grade SimPy-based M/M/c queue simulation for:
  - OPD (Outpatient Department)
  - Emergency Room
  - ICU
  - General Wards

Mathematical foundation
-----------------------
Arrival process  : Poisson(λ)       — numpy.random.poisson
Service time     : Exponential(1/μ) — numpy.random.exponential
Queue discipline : FCFS
Servers          : c (configurable per department)

Erlang-C formula is used to derive theoretical congestion probability so
simulated metrics can be cross-validated at runtime.

All telemetry events are pushed to a Redis channel so the FastAPI
WebSocket layer can fan them out to connected dashboards.

Usage (standalone test)
-----------------------
    python -m backend.worker.tasks.sim_engine

Author : AI Hospital Command Center Team
"""

from __future__ import annotations

import json
import logging
import math
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Any, Generator

import numpy as np
import redis
import simpy

from app.core.config import settings

# ── Structured logger ──────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)

# ── Redis channel name (from config) ──────────────────────────────────────────────
# Note: Use settings.redis_telemetry_channel at runtime to allow configuration changes

# ─────────────────────────────────────────────────────────────────────────────
# Domain configuration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DepartmentConfig:
    """Runtime configuration for a single hospital department."""

    name: str
    servers: int           # c — number of parallel service channels
    arrival_rate: float    # λ — mean patients/hour
    service_rate: float    # μ — mean patients served/hour per server
    capacity: int          # maximum queue depth before overflow/diversion
    priority: int = 1      # 1=normal, 2=urgent, 3=critical (for ER/ICU)

    @property
    def rho(self) -> float:
        """Server utilisation ρ = λ / (c · μ)."""
        return self.arrival_rate / (self.servers * self.service_rate)

    @property
    def erlang_c_congestion(self) -> float:
        """
        Erlang-C formula: probability that a new arrival must wait.

        P_C = (A^c / c!) * (c·μ / (c·μ − λ))
              ──────────────────────────────────────────────
              Σ_{k=0}^{c-1} (A^k / k!) + (A^c / c!) * (c·μ / (c·μ − λ))

        where A = λ / μ (offered traffic in Erlangs).
        Returns 1.0 if system is saturated (ρ ≥ 1).
        """
        if self.rho >= 1.0:
            return 1.0

        A = self.arrival_rate / self.service_rate  # total offered traffic
        c = self.servers

        # Numerator: A^c / c! * (1 / (1 - ρ))
        numerator = (A ** c / math.factorial(c)) * (1.0 / (1.0 - self.rho))

        # Denominator: sum_{k=0}^{c-1} A^k/k! + numerator
        summation = sum((A ** k) / math.factorial(k) for k in range(c))
        denominator = summation + numerator

        return numerator / denominator if denominator > 0 else 0.0


# Default department profiles (realistic NHS/private hospital approximations)
DEFAULT_DEPARTMENTS: list[DepartmentConfig] = [
    DepartmentConfig(
        name="OPD",
        servers=8,
        arrival_rate=24.0,   # 24 patients/hour peak
        service_rate=6.0,    # 10 min avg consultation
        capacity=60,
        priority=1,
    ),
    DepartmentConfig(
        name="ER",
        servers=4,
        arrival_rate=12.0,   # 12 patients/hour
        service_rate=3.0,    # 20 min avg triage+treatment
        capacity=20,
        priority=3,
    ),
    DepartmentConfig(
        name="ICU",
        servers=10,
        arrival_rate=2.0,    # 2 admissions/hour
        service_rate=0.1,    # mean stay ~10 hours
        capacity=10,
        priority=3,
    ),
    DepartmentConfig(
        name="Ward",
        servers=30,
        arrival_rate=8.0,
        service_rate=0.5,    # mean stay ~2 hours for ward-level processing
        capacity=30,
        priority=2,
    ),
]

# ─────────────────────────────────────────────────────────────────────────────
# Telemetry snapshot
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DepartmentSnapshot:
    """Point-in-time operational snapshot for one department."""

    department: str
    sim_time: float            # simulation clock (hours)
    wall_time: float           # real epoch seconds
    queue_length: int
    patients_in_service: int
    patients_completed: int
    avg_wait_time: float       # hours
    server_utilization: float  # 0.0 – 1.0
    congestion_probability: float  # Erlang-C P_C
    overflow_events: int       # patients turned away / diverted
    throughput_per_hour: float
    alert_level: str           # "normal" | "warning" | "critical"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())


@dataclass
class HospitalTelemetryEvent:
    """Envelope pushed onto Redis pub/sub for every telemetry tick."""

    event_id: str
    event_type: str           # "telemetry_tick" | "alert" | "sim_complete"
    timestamp: float
    snapshots: list[dict[str, Any]]
    global_alert: str         # "normal" | "warning" | "critical"
    total_queue: int
    icu_occupancy_pct: float
    er_congestion_pct: float

    def to_json(self) -> str:
        return json.dumps(
            {
                "event_id": self.event_id,
                "event_type": self.event_type,
                "timestamp": self.timestamp,
                "snapshots": self.snapshots,
                "global_alert": self.global_alert,
                "total_queue": self.total_queue,
                "icu_occupancy_pct": self.icu_occupancy_pct,
                "er_congestion_pct": self.er_congestion_pct,
            }
        )


# ─────────────────────────────────────────────────────────────────────────────
# Per-department simulation process
# ─────────────────────────────────────────────────────────────────────────────

class DepartmentSimulator:
    """
    SimPy process modelling a single hospital department as an M/M/c queue.

    Stochastic mechanics
    --------------------
    - Inter-arrival times ~ Exponential(1/λ)  [Poisson process]
    - Service times       ~ Exponential(1/μ)
    - Server pool         : simpy.Resource(capacity=c)
    """

    def __init__(
        self,
        env: simpy.Environment,
        config: DepartmentConfig,
        rng: np.random.Generator,
    ) -> None:
        self.env = env
        self.cfg = config
        self.rng = rng
        self.resource = simpy.Resource(env, capacity=config.servers)

        # Running counters
        self._queue_lengths: list[int] = []
        self._wait_times: list[float] = []
        self._service_times: list[float] = []
        self._arrivals: int = 0
        self._completions: int = 0
        self._overflows: int = 0
        self._busy_area: float = 0.0   # ∫ busy_servers dt  (for utilisation)
        self._last_event_time: float = 0.0
        self._busy_at_last_event: int = 0

    # ── Arrival generator ─────────────────────────────────────────────────────

    def arrival_process(self) -> Generator:
        """
        Generates patient arrivals following a Poisson process.
        Each arrival spawns an independent service process.
        """
        while True:
            # Exponential inter-arrival: 1/λ hours
            iat = self.rng.exponential(1.0 / self.cfg.arrival_rate)
            yield self.env.timeout(iat)

            # Overflow check: if queue is already at capacity, divert
            queued = len(self.resource.queue)
            if queued >= self.cfg.capacity:
                self._overflows += 1
                logger.debug(
                    "%s overflow at t=%.2f — queue=%d capacity=%d",
                    self.cfg.name, self.env.now, queued, self.cfg.capacity,
                )
                continue

            self._arrivals += 1
            patient_id = f"{self.cfg.name}-{self._arrivals}"
            self.env.process(self._service_process(patient_id))

    # ── Service process ───────────────────────────────────────────────────────

    def _service_process(self, patient_id: str) -> Generator:
        """Models one patient's journey: queue → service → departure."""
        arrival_time = self.env.now
        self._update_busy_area()

        with self.resource.request() as req:
            yield req

            # Patient has been assigned a server
            wait = self.env.now - arrival_time
            self._wait_times.append(wait)
            self._queue_lengths.append(len(self.resource.queue))
            self._update_busy_area()

            # Service duration ~ Exp(1/μ)
            svc_time = self.rng.exponential(1.0 / self.cfg.service_rate)
            self._service_times.append(svc_time)
            yield self.env.timeout(svc_time)

        self._update_busy_area()
        self._completions += 1

    # ── Utilisation tracking ──────────────────────────────────────────────────

    def _update_busy_area(self) -> None:
        """Accumulate busy-server·time for time-average utilisation."""
        now = self.env.now
        dt = now - self._last_event_time
        self._busy_area += self._busy_at_last_event * dt
        self._last_event_time = now
        self._busy_at_last_event = self.resource.count  # servers in use now

    # ── Snapshot export ───────────────────────────────────────────────────────

    def snapshot(self) -> DepartmentSnapshot:
        """Return current operational metrics for this department."""
        self._update_busy_area()

        avg_wait = float(np.mean(self._wait_times)) if self._wait_times else 0.0
        queue_now = len(self.resource.queue)
        in_service = self.resource.count

        # Time-average server utilisation
        elapsed = self.env.now if self.env.now > 0 else 1e-9
        utilisation = min(
            self._busy_area / (self.cfg.servers * elapsed), 1.0
        )

        throughput = self._completions / elapsed if elapsed > 0 else 0.0

        # Compute dynamic congestion probability (theoretical Erlang-C)
        p_c = self.cfg.erlang_c_congestion

        # Alert thresholds
        alert = "normal"
        if utilisation > 0.85 or p_c > 0.7:
            alert = "warning"
        if utilisation > 0.95 or p_c > 0.9 or queue_now >= self.cfg.capacity * 0.9:
            alert = "critical"

        return DepartmentSnapshot(
            department=self.cfg.name,
            sim_time=round(self.env.now, 4),
            wall_time=time.time(),
            queue_length=queue_now,
            patients_in_service=in_service,
            patients_completed=self._completions,
            avg_wait_time=round(avg_wait, 4),
            server_utilization=round(utilisation, 4),
            congestion_probability=round(p_c, 4),
            overflow_events=self._overflows,
            throughput_per_hour=round(throughput, 4),
            alert_level=alert,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Hospital-level simulation orchestrator
# ─────────────────────────────────────────────────────────────────────────────

class HospitalSimulation:
    """
    Orchestrates the full multi-department discrete event simulation.

    Parameters
    ----------
    departments : list of DepartmentConfig
        One entry per simulated department.
    sim_duration_hours : float
        How many simulated hours to run.
    telemetry_interval_hours : float
        How often (sim time) to emit a telemetry snapshot.
    redis_client : redis.Redis | None
        If provided, snapshots are published to TELEMETRY_CHANNEL.
    seed : int
        Random seed for reproducibility.
    """

    def __init__(
        self,
        departments: list[DepartmentConfig] | None = None,
        sim_duration_hours: float = 24.0,
        telemetry_interval_hours: float = 0.5,
        redis_client: redis.Redis | None = None,
        seed: int = 42,
    ) -> None:
        self.departments = departments or DEFAULT_DEPARTMENTS
        self.sim_duration = sim_duration_hours
        self.telemetry_interval = telemetry_interval_hours
        self.redis = redis_client
        self.rng = np.random.default_rng(seed)

        # SimPy environment
        self.env = simpy.Environment()

        # Build per-department simulators
        self.simulators: dict[str, DepartmentSimulator] = {
            cfg.name: DepartmentSimulator(self.env, cfg, self.rng)
            for cfg in self.departments
        }

        # Telemetry history (in-memory fallback when Redis not available)
        self.telemetry_history: list[HospitalTelemetryEvent] = []

    # ── SimPy process: telemetry ticker ───────────────────────────────────────

    def _telemetry_ticker(self) -> Generator:
        """
        Fires every `telemetry_interval` sim-hours, collects snapshots from
        all departments and publishes to Redis.
        """
        while True:
            yield self.env.timeout(self.telemetry_interval)
            event = self._build_telemetry_event()
            self.telemetry_history.append(event)
            self._publish(event)
            logger.info(
                "Telemetry tick t=%.2f | total_queue=%d | global=%s",
                self.env.now,
                event.total_queue,
                event.global_alert,
            )

    # ── Build composite telemetry event ───────────────────────────────────────

    def _build_telemetry_event(self) -> HospitalTelemetryEvent:
        snapshots = [sim.snapshot() for sim in self.simulators.values()]
        snap_dicts = [s.to_dict() for s in snapshots]

        total_queue = sum(s.queue_length for s in snapshots)

        # ICU occupancy as % of server capacity
        icu_snap = next((s for s in snapshots if s.department == "ICU"), None)
        icu_cfg = next((c for c in self.departments if c.name == "ICU"), None)
        icu_occ = 0.0
        if icu_snap and icu_cfg:
            icu_occ = icu_snap.patients_in_service / max(icu_cfg.servers, 1)

        # ER congestion probability
        er_snap = next((s for s in snapshots if s.department == "ER"), None)
        er_congestion = er_snap.congestion_probability if er_snap else 0.0

        # Global alert — escalate to worst department alert
        alert_rank = {"normal": 0, "warning": 1, "critical": 2}
        global_alert = max(
            (s.alert_level for s in snapshots),
            key=lambda a: alert_rank.get(a, 0),
            default="normal",
        )

        return HospitalTelemetryEvent(
            event_id=str(uuid.uuid4()),
            event_type="telemetry_tick",
            timestamp=time.time(),
            snapshots=snap_dicts,
            global_alert=global_alert,
            total_queue=total_queue,
            icu_occupancy_pct=round(min(icu_occ, 1.0), 4),
            er_congestion_pct=round(er_congestion, 4),
        )

    # ── Redis publish ──────────────────────────────────────────────────────────

    def _publish(self, event: HospitalTelemetryEvent) -> None:
        if self.redis is None:
            return
        try:
            payload = event.to_json()

            # Realtime websocket streaming (use configured channel)
            self.redis.publish(settings.redis_telemetry_channel, payload)

            # Persist latest telemetry for REST polling
            self.redis.set(
                settings.redis_telemetry_key,
                payload,
                ex=300,
            )

            logger.debug("Published telemetry event %s", event.event_id)
        except redis.RedisError as exc:
            logger.warning("Redis publish failed: %s", exc)

    # ── Run ───────────────────────────────────────────────────────────────────

    def run(self) -> list[HospitalTelemetryEvent]:
        """
        Start all SimPy processes and run the simulation to completion.

        Returns
        -------
        list[HospitalTelemetryEvent]
            All telemetry events emitted during the run.
        """
        logger.info(
            "Starting simulation: %.1f sim-hours | %d departments | seed=%d",
            self.sim_duration,
            len(self.departments),
            self.rng.bit_generator.state["state"]["state"],
        )

        # Register arrival processes for all departments
        for sim in self.simulators.values():
            self.env.process(sim.arrival_process())

        # Register telemetry ticker
        self.env.process(self._telemetry_ticker())

        # Run simulation
        self.env.run(until=self.sim_duration)

        # Final snapshot
        final_event = self._build_telemetry_event()
        final_event.event_type = "sim_complete"
        self.telemetry_history.append(final_event)
        self._publish(final_event)

        logger.info(
            "Simulation complete. %d telemetry events emitted.",
            len(self.telemetry_history),
        )
        return self.telemetry_history


# ─────────────────────────────────────────────────────────────────────────────
# Celery task wrapper
# ─────────────────────────────────────────────────────────────────────────────

def run_hospital_simulation_task(
    sim_hours: float = 24.0,
    telemetry_interval: float = 0.5,
    redis_url: str = "redis://localhost:6379/0",
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Entry point called by Celery worker.

    Parameters
    ----------
    sim_hours : float
        Length of the simulation in simulated hours.
    telemetry_interval : float
        How often (in sim-hours) to emit telemetry ticks.
    redis_url : str
        Redis connection URL for pub/sub publishing.
    seed : int | None
        Random seed; None = random.

    Returns
    -------
    dict
        Summary statistics for the completed simulation run.
    """
    effective_seed = seed if seed is not None else int(time.time()) % 2**31

    try:
        r = redis.Redis.from_url(redis_url, decode_responses=True)
        r.ping()
        logger.info("Redis connection established: %s", redis_url)
    except redis.RedisError as exc:
        logger.warning("Redis unavailable (%s) — running without pub/sub", exc)
        r = None  # type: ignore[assignment]

    sim = HospitalSimulation(
        sim_duration_hours=sim_hours,
        telemetry_interval_hours=telemetry_interval,
        redis_client=r,
        seed=effective_seed,
    )

    events = sim.run()

    # Build summary
    final_snaps = events[-1].snapshots if events else []
    summary = {
        "sim_hours": sim_hours,
        "seed": effective_seed,
        "telemetry_ticks": len(events),
        "department_summary": {
            s["department"]: {
                "avg_wait_time_h": s["avg_wait_time"],
                "server_utilization": s["server_utilization"],
                "congestion_probability": s["congestion_probability"],
                "overflow_events": s["overflow_events"],
                "throughput_per_hour": s["throughput_per_hour"],
                "alert_level": s["alert_level"],
            }
            for s in final_snaps
        },
    }
    logger.info("Simulation summary: %s", json.dumps(summary, indent=2))
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Standalone test entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pprint

    result = run_hospital_simulation_task(
        sim_hours=8.0,
        telemetry_interval=1.0,
        redis_url="redis://localhost:6379/0",
        seed=2024,
    )
    print("\n=== Simulation Summary ===")
    pprint.pprint(result)
