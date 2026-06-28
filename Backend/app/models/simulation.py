import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON
from app.core.database import Base

class SimulationResultModel(Base):
    __tablename__ = "simulation_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(String(255), unique=True, index=True, nullable=False)
    sim_hours = Column(Float, nullable=False)
    seed = Column(Integer, nullable=False)
    department_summary = Column(JSON, nullable=False)  # Stores the full metrics object
    completed_at = Column(DateTime, default=datetime.datetime.utcnow)