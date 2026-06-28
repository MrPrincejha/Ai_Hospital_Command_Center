from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# 1. Pull the connection strings directly from your existing config
ASYNC_DATABASE_URL = settings.postgres_url  # Already has postgresql+asyncpg://
SYNC_DATABASE_URL = settings.postgres_url.replace("postgresql+asyncpg://", "postgresql://")

# 2. Async setup for FastAPI Web Server
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

# 3. Sync setup for Celery Background Workers
sync_engine = create_engine(SYNC_DATABASE_URL, echo=False, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(bind=sync_engine, autocommit=False, autoflush=False)

# 4. Declarative base for mapping models to tables
Base = declarative_base()

# FastAPI dependency injection utility
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()