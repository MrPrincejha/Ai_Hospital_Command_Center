# backend/app/services/model_registry.py
import logging
import os
import mlflow
from mlflow.tracking import MlflowClient

logger = logging.getLogger(__name__)

mlflow.set_tracking_uri(os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000"))
client = MlflowClient()

def load_latest_model():
    """
    Fetches latest 'Production' stage model from MLflow registry.
    Falls back to training a new model if registry is empty.
    """
    model_name = "HospitalForecaster"
    try:
        models = client.get_latest_versions(model_name, stages=["Production"])
        if models:
            latest_version = models[0].version
            model_uri = f"models:/{model_name}/{latest_version}"
            logger.info(f"Loading model {model_name} version {latest_version} from MLflow...")
            return mlflow.xgboost.load_model(model_uri)
    except Exception as exc:
        logger.warning(f"Could not load model from MLflow: {exc}")
        
    logger.info("No production model found in MLflow. Falling back to training new model.")
    from app.services.forecast_engine import run_forecasting_pipeline
    run_forecasting_pipeline()
    # Retry loading after training
    try:
        models = client.get_latest_versions(model_name, stages=["Production", "None"])
        if models:
            return mlflow.xgboost.load_model(f"models:/{model_name}/{models[0].version}")
    except Exception as exc:
        logger.error(f"Fallback training failed to produce model in MLflow: {exc}")
        return None

def notify_drift(mape: float):
    """
    Log WARNING with structured dict and queue a Celery task to retrain.
    """
    logger.warning({"event": "model_drift", "mape": mape})
    
    # Import inside function to avoid circular imports
    from worker.celery_app import celery_app
    try:
        celery_app.send_task("hospital.forecast.run")
        logger.info("Queued Celery task 'hospital.forecast.run' due to model drift.")
    except Exception as exc:
        logger.error(f"Failed to queue retrain task: {exc}")
