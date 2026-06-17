#!/usr/bin/env python3
"""
Test with actual hospital.simulation.run task to verify it gets loaded.
"""

import logging
import time
from worker.celery_app import celery_app, get_simulation_task

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    print("\n" + "="*80)
    print("TEST ACTUAL HOSPITAL TASK EXECUTION")
    print("="*80)
    
    print(f"\n[1] Checking registered tasks...")
    hospital_tasks = [t for t in celery_app.tasks.keys() if 'hospital' in t]
    print(f"    Hospital tasks in main process: {hospital_tasks}")
    
    print(f"\n[2] Queueing hospital.simulation.run task...")
    try:
        sim_task = get_simulation_task()
        task = sim_task.apply_async(
            kwargs={"sim_hours": 1.0, "telemetry_interval": 0.5, "seed": 42},
            queue="simulation",
        )
        print(f"    Task ID: {task.id}")
        print(f"    Initial state: {task.state}")
    except Exception as e:
        print(f"    ERROR: {e}")
        exit(1)
    
    print(f"\n[3] Waiting for worker to execute...")
    for i in range(10):
        time.sleep(1)
        state = task.state
        print(f"    Check {i+1}/10: State = {state}")
        
        if state != "PENDING":
            break
    
    print(f"\n[4] RESULT:")
    print(f"    Final state: {task.state}")
    
    if task.state == "SUCCESS":
        result = task.get()
        print(f"    ✓ Task executed successfully!")
        print(f"    Result keys: {list(result.keys())[:5]}...")
    elif task.state == "FAILURE":
        print(f"    ✗ Task failed: {task.info}")
    elif task.state == "PENDING":
        print(f"    ✗ Task never picked up by worker")
    
    print("\n" + "="*80 + "\n")
