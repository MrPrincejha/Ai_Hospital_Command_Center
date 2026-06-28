# backend/app/auth/models.py
from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "user"
    
    # role values: "admin", "clinician", "observer"
    role: Mapped[str] = mapped_column(String(20), default="observer", nullable=False)
