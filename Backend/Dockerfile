# backend/Dockerfile
# AI Hospital Command Center — Backend Dockerfile
# ================================================
# Multi-stage build:
#   Stage 1 (builder) — install Python dependencies
#   Stage 2 (runtime) — lean production image
#
# Build:
#   docker build -t hospital-backend:latest .
#
# Run (standalone):
#   docker run -p 8000:8000 --env-file .env hospital-backend:latest
#
# Run via docker-compose (recommended):
#   docker-compose up

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps for building Python packages (numpy, psycopg2, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python requirements
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

LABEL maintainer="AI Hospital Command Center Team"
LABEL description="FastAPI backend for AI Hospital Command Center"

# Create non-root user for security
RUN groupadd -r hospital && useradd -r -g hospital hospital

WORKDIR /app

# Runtime system deps only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# Create model artefact directory (writable by app user)
RUN mkdir -p /tmp/hospital_models && chown hospital:hospital /tmp/hospital_models

# Switch to non-root user
USER hospital

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# ── Ports ────────────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Default command: FastAPI via uvicorn ─────────────────────────────────────
# Override CMD in docker-compose for Celery workers
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--loop", "uvloop", \
     "--http", "httptools", \
     "--log-level", "info"]