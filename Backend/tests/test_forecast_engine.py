# backend/tests/test_forecast_engine.py
import pytest
import pandas as pd
from datetime import datetime, timedelta
from app.services.forecast_engine import DatabaseTelemetryFetcher

def test_database_telemetry_fetcher_raises_value_error_on_empty_db():
    fetcher = DatabaseTelemetryFetcher()
    with pytest.raises(ValueError, match="Insufficient historical data"):
        # Assuming test DB is empty
        fetcher.fetch_hourly_features(lookback_hours=168)
