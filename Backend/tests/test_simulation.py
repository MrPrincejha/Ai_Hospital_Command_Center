# backend/tests/test_simulation.py
from worker.tasks.simulation_tasks import run_simulation
from unittest.mock import patch, MagicMock

def test_run_simulation_completes():
    # Mock redis and database interactions
    with patch("app.core.redis_client.sync_set_json") as mock_redis, \
         patch("worker.tasks.simulation_tasks.SyncSessionLocal") as mock_db:
         
        # Mock the celery task request context
        class MockTask:
            request = MagicMock()
            request.id = "test-task-123"
            
        task = MockTask()
        config = {"simulation_hours": 1, "num_beds": 5, "num_nurses": 2}
        
        result = run_simulation(task, config_dict=config)
        
        assert "task_id" in result
        assert result["task_id"] == "test-task-123"
        assert "total_patients" in result
        assert "avg_wait_min" in result
        assert "patients_by_acuity" in result
