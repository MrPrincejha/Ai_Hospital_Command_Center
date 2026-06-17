
# AI Hospital Command Center

This is the README for the AI Hospital Command Center, a full-stack application designed to simulate and manage hospital operations using AI-powered forecasting and simulation.

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Project Structure](#project-structure)
  - [Backend Structure](#backend-structure)
  - [Frontend Structure](#frontend-structure)
- [Core Logic and Mathematical Models](#core-logic-and-mathematical-models)
  - [Discrete Event Simulation & Queueing Theory](#discrete-event-simulation--queueing-theory)
  - [Forecasting Engine](#forecasting-engine)
  - [Clinical Urgency Scoring](#clinical-urgency-scoring)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [WebSocket Events](#websocket-events)

## Project Overview

The AI Hospital Command Center is a comprehensive dashboard that provides real-time monitoring, simulation, and forecasting for hospital operations. It helps in optimizing resource allocation, managing patient flow, and predicting future demands. The application is built with a FastAPI backend and a Next.js frontend, using WebSockets for real-time data updates.

## Tech Stack

### Backend

- **Framework:** FastAPI
- **Language:** Python 3.11
- **Asynchronous Server:** Uvicorn with `uvloop` and `httptools` for high performance.
- **Task Queue:** Celery with Redis as the message broker.
- **Database:** PostgreSQL for persistent data storage.
- **Caching and Pub/Sub:** Redis
- **Data Validation:** Pydantic
- **ORM:** SQLAlchemy (for potential database interactions, though not explicitly used in the provided files)
- **Containerization:** Docker

### Frontend

- **Framework:** Next.js 16+
- **Language:** TypeScript
- **Styling:** Tailwind CSS with PostCSS
- **State Management:** Zustand
- **Charting:** Recharts
- **UI Components:** Lucide React for icons, Framer Motion for animations.
- **WebSocket Client:** `socket.io-client`

## Project Structure

### Backend Structure

```
Backend/
├── app/
│   ├── api/
│   │   └── routes/
│   ├── core/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── websocket/
├── tests/
└── worker/
    ├── tasks/
```

- **`app/`**: The main FastAPI application directory.
  - **`api/routes/`**: Contains the API endpoint definitions for different modules like clinical, copilot, forecast, and simulation.
  - **`core/`**: Includes core functionalities like application settings (`config.py`) and the Redis client.
  - **`models/`**: Defines the data models for the application.
  - **`schemas/`**: Contains Pydantic schemas for request/response data validation.
  - **`services/`**: Implements the business logic for various features.
  - **`websocket/`**: Manages WebSocket connections and the pub/sub bridge.
- **`tests/`**: Contains unit and integration tests for the backend.
- **`worker/`**: Holds the Celery worker setup and task definitions.
  - **`tasks/`**: Defines the background tasks for forecasting, simulation, etc.

### Frontend Structure

```
frontend/
├── app/
├── components/
├── hooks/
├── lib/
├── services/
├── store/
└── types/
```

- **`app/`**: The main application directory for the Next.js app, following the App Router structure.
- **`components/`**: Reusable React components used throughout the application.
- **`hooks/`**: Custom React hooks for managing side effects and stateful logic.
- **`lib/`**: Utility functions and libraries.
- **`services/`**: Modules for interacting with the backend API and WebSockets.
- **`store/`**: Zustand store for global state management.
- **`types/`**: TypeScript type definitions.

## Core Logic and Mathematical Models

The AI Hospital Command Center leverages several sophisticated models to simulate, forecast, and analyze hospital operations.

### Discrete Event Simulation & Queueing Theory

The simulation engine (`services/simulation_engine.py`) models the hospital as a system of interconnected queues, using a Discrete Event Simulation (DES) framework powered by **SimPy**.

-   **Model:** Each hospital department (ER, ICU, OPD, Ward) is modeled as an **M/M/c queue**:
    -   **M (Arrival Process):** Patient arrivals follow a **Poisson process**, meaning the time between consecutive arrivals is exponentially distributed. The arrival rate (λ) is configurable for each department.
    -   **M (Service Process):** The time taken to serve a patient is also **exponentially distributed**. The service rate (μ) represents the average number of patients a single server (e.g., doctor, bed) can handle per hour.
    -   **c (Servers):** Each department has `c` parallel servers, representing the number of available staff or beds.

-   **Queue Discipline:** The system uses a First-Come, First-Served (FCFS) queue discipline.

-   **Key Metrics Calculated:**
    -   **Server Utilization (ρ):** The proportion of time servers are busy, calculated as `ρ = λ / (c * μ)`.
    -   **Average Wait Time:** The average time a patient spends in the queue before being served.
    -   **Queue Length:** The number of patients waiting for service.
    -   **Throughput:** The rate at which patients are served.

-   **Erlang-C Formula:** The engine uses the **Erlang-C formula** to calculate the theoretical probability that a patient will have to wait in a queue. This provides a mathematical baseline to validate the simulation results. The formula is:
    $$ P_C = \frac{\frac{A^c}{c!} \frac{c\mu}{c\mu - \lambda}}{\sum_{k=0}^{c-1} \frac{A^k}{k!} + \frac{A^c}{c!} \frac{c\mu}{c\mu - \lambda}} $$
    where `A = λ / μ` is the offered traffic in Erlangs.

### Forecasting Engine

The forecasting engine (`services/forecast_engine.py`) uses machine learning to predict key hospital metrics 12 hours into the future.

-   **Input Modelling:** A synthetic data generator (`MockTelemetryGenerator`) creates a realistic historical dataset for model training. This generator models:
    -   **Circadian Rhythms:** Daily peaks and troughs in patient load.
    -   **Weekly Seasonality:** Differences in activity between weekdays and weekends.
    -   **Stochastic Noise and Surges:** Random variations and occasional surge events to mimic real-world unpredictability.

-   **Feature Engineering:** Raw time-series data is transformed into a rich feature set for the ML models:
    -   **Lag Features:** Values of key metrics from previous time steps (t-1, t-2, t-24, etc.).
    -   **Rolling Statistics:** Rolling means and standard deviations over various time windows (e.g., 4-hour, 24-hour).
    -   **Cyclical Time Features:** Time-based features like hour-of-day and day-of-week are encoded into sine and cosine components to capture their cyclical nature.
    -   **Interaction Features:** Combinations of features to capture complex relationships (e.g., `er_utilization * icu_occupancy_pct`).

-   **Machine Learning Models:**
    -   **XGBoost (Extreme Gradient Boosting):** Used for regression tasks to predict ICU occupancy and ER congestion probability.
    -   **Random Forest Regressor:** Used to predict the total patient inflow, as it is robust for count-based data.

### Clinical Urgency Scoring

The clinical scoring engine (`services/clinical_scorer.py`) uses a hybrid AI approach to analyze clinical reports and assign a triage urgency score.

-   **LLM-based Anomaly Extraction:**
    -   A Large Language Model (LLM), such as Groq's Llama, is used to parse unstructured, free-text clinical and lab reports.
    -   The LLM's sole task is to extract structured data about biomarkers, including their values, units, and reference ranges, into a JSON format. This separates the non-deterministic language processing from the deterministic scoring logic.

-   **Deterministic Rule-Based Scoring:**
    -   A rule engine (`AnomalyRuleEngine`) scores each extracted anomaly based on a predefined set of clinical rules (`BIOMARKER_RULES`).
    -   Each biomarker has defined thresholds for normal, mild, moderate, and severe deviations, as well as critical-low and critical-high values.
    -   A severity score is assigned based on the percentage deviation from the normal range or if a critical threshold is breached.

-   **Urgency Score Calculation:**
    -   The scores from all anomalies are summed to produce a total urgency score (capped at 100).
    -   This score is then mapped to a **Triage Tier** (Non-Urgent, Semi-Urgent, Urgent, Immediate), which is aligned with standard clinical triage frameworks like MTS/ESI. This provides a clear, actionable recommendation for clinicians.

This hybrid approach ensures that the system is both powerful in its ability to understand unstructured text and safe, auditable, and reproducible in its clinical decision support.

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js and npm (or yarn)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-folder>
    ```

2.  **Backend Setup:**
    - Navigate to the `Backend` directory.
    - Create a `.env` file based on the configuration in `app/core/config.py`. You will need to provide credentials for Redis and PostgreSQL.

3.  **Frontend Setup:**
    - Navigate to the `frontend` directory.
    - Install the Node.js dependencies:
      ```bash
      npm install
      ```

### Running the Application

The application is designed to be run with Docker Compose, which will start the backend, frontend, Redis, and PostgreSQL containers.

1.  **Start the application:**
    - From the root of the project, run:
      ```bash
      docker-compose up --build
      ```

2.  **Access the application:**
    - **Frontend:** Open your browser and navigate to `http://localhost:3000`.
    - **Backend API:** The API will be available at `http://localhost:8000`. You can access the API documentation at `http://localhost:8000/docs`.

## API Endpoints

The main API endpoints are defined in the `Backend/app/api/routes/` directory. Some of the key endpoints include:

- `/health`: Health check endpoint.
- `/ws`: WebSocket connection endpoint.
- `/api/v1/simulation/`: Endpoints for managing simulations.
- `/api/v1/forecast/`: Endpoints for retrieving forecasts.
- `/api/v1/clinical/`: Endpoints for clinical data.
- `/api/v1/copilot/`: Endpoints for the AI copilot.

For a full list of endpoints and their specifications, please refer to the auto-generated OpenAPI documentation at `http://localhost:8000/docs` when the backend is running.

## WebSocket Events

The backend emits various WebSocket events to update the frontend in real-time. These events are typically JSON-encoded messages with a `type` and `payload`. Some of the key events include:

- `telemetry_update`: Provides real-time updates on hospital metrics.
- `simulation_update`: Sends updates on the progress and results of a simulation.
- `forecast_update`: Delivers new forecast data.

The frontend listens for these events and updates the UI accordingly.
