# AI Hospital Command Center — Setup Guide

## Quick Start with Docker Compose

### Prerequisites
- Docker Desktop (includes Docker and Docker Compose)
- Git

### Installation & Running

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd ai_hospital
   ```

2. **Configure environment variables:**
   ```bash
   cd Backend
   cp .env.example .env
   ```
   
   Edit `Backend/.env` and set your values:
   - `GROQ_API_KEY`: Get from https://console.groq.com/keys
   - Keep other defaults for local development

3. **Start all services:**
   ```bash
   docker-compose up --build
   ```

   This will start:
   - PostgreSQL (port 5432)
   - Redis (port 6379)
   - MongoDB (port 27017)
   - FastAPI Backend (port 8000)
   - Celery Worker
   - Next.js Frontend (port 3000)

4. **Access the application:**
   - **Frontend:** http://localhost:3000
   - **API Docs:** http://localhost:8000/docs
   - **Backend Health:** http://localhost:8000/health

### Stop the Application
```bash
docker-compose down
```

---

## Development Setup (Without Docker)

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- MongoDB 6+ (optional)

### Backend Setup

1. **Create virtual environment:**
   ```bash
   cd Backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Start the backend:**
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. **In another terminal, start Celery worker:**
   ```bash
   python start_celery_worker.py
   ```

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Access at:** http://localhost:3000

---

## Environment Variables

See `Backend/.env.example` for all available configuration options.

### Critical Variables
- `GROQ_API_KEY`: LLM API key (required for copilot features)
- `REDIS_URL`: Redis connection string
- `POSTGRES_URL`: PostgreSQL connection string

---

## Troubleshooting

### Backend won't start
- Check PostgreSQL and Redis are running
- Verify `.env` file exists and has correct values
- Check port 8000 is not in use: `lsof -i :8000`

### Frontend won't connect to backend
- Ensure backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in docker-compose or .env

### Celery tasks not running
- Restart Celery worker: `python start_celery_worker.py`
- Check worker logs for errors
- Verify Redis connection

### Database connection errors
- PostgreSQL: `psql -U hospital -h localhost -d hospital_db`
- Redis: `redis-cli ping`
- MongoDB: `mongosh`

---

## Testing

### Run backend tests
```bash
cd Backend
pytest
```

### Run linting
```bash
cd Backend
flake8 .
```

### Frontend type checking
```bash
cd frontend
npm run type-check
```

---

## API Documentation

Once the backend is running, visit:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

## Support

For issues, check:
1. Backend logs: `docker-compose logs backend`
2. Worker logs: `docker-compose logs celery_worker`
3. Frontend console: Browser DevTools
