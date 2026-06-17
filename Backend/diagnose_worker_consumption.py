#!/usr/bin/env python3
"""
Diagnose why Celery worker is not consuming tasks.
"""

import redis
import json
from worker.celery_app import celery_app
from app.core.config import settings

print("\n" + "="*80)
print("CELERY WORKER CONSUMPTION DIAGNOSIS")
print("="*80)

# 1. Check broker connectivity
print("\n[1] BROKER CONNECTIVITY")
try:
    broker_redis = redis.from_url(settings.celery_broker_url, decode_responses=True)
    broker_redis.ping()
    print(f"✓ Broker Redis connected: {settings.celery_broker_url}")
except Exception as e:
    print(f"✗ Broker error: {e}")
    exit(1)

# 2. Check result backend connectivity
print("\n[2] RESULT BACKEND CONNECTIVITY")
try:
    result_redis = redis.from_url(settings.celery_result_backend, decode_responses=True)
    result_redis.ping()
    print(f"✓ Result backend Redis connected: {settings.celery_result_backend}")
except Exception as e:
    print(f"✗ Result backend error: {e}")
    exit(1)

# 3. Check worker active status
print("\n[3] WORKER STATUS")
try:
    inspect = celery_app.control.inspect()
    active = inspect.active()
    if active:
        print(f"✓ Active workers: {list(active.keys())}")
        for worker_name, tasks in active.items():
            print(f"  {worker_name}: {len(tasks)} tasks executing")
    else:
        print(f"⚠ NO ACTIVE WORKERS (tasks will stay PENDING)")
        print(f"  → Worker needs to be restarted")
        
    stats = inspect.stats()
    if stats:
        print(f"\n✓ Worker stats:")
        for worker_name, worker_stats in stats.items():
            pool = worker_stats.get('pool', {})
            print(f"  {worker_name}:")
            print(f"    - Implementation: {pool.get('implementation', 'unknown')}")
            print(f"    - Max concurrency: {pool.get('max-concurrency', 'unknown')}")
            print(f"    - Processes: {pool.get('processes', [])}")
except Exception as e:
    print(f"⚠ Could not inspect workers: {e}")

# 4. Check queued tasks
print("\n[4] QUEUED TASKS")
try:
    reserved = inspect.reserved()
    if reserved:
        print(f"✓ Reserved (executing) tasks:")
        for worker_name, tasks in reserved.items():
            print(f"  {worker_name}: {len(tasks)} reserved")
            for task in tasks[:3]:
                print(f"    - {task.get('name', '?')}")
    else:
        print(f"  No reserved tasks")
    
    # Check broker queues
    queue_keys = [k for k in broker_redis.keys("*") if broker_redis.type(k) == "list"]
    print(f"\n✓ Queue status:")
    for key in sorted(queue_keys):
        length = broker_redis.llen(key)
        if length > 0:
            print(f"  {key}: {length} pending")
            
except Exception as e:
    print(f"✗ Error: {e}")

# 5. Check result backend
print("\n[5] RESULT BACKEND STATUS")
result_keys = result_redis.keys("*")
print(f"  Total keys: {len(result_keys)}")
if result_keys:
    for key in result_keys[:5]:
        data = result_redis.get(key)
        try:
            parsed = json.loads(data)
            status = parsed.get('status', '?')
            print(f"  {key}: {status}")
        except:
            print(f"  {key}: (unparseable)")

print("\n" + "="*80)
print("LIKELY ISSUES:")
print("  If worker is NOT active: worker process not running or crashed")
print("  If queues have pending: worker is not consuming from broker")  
print("  If result backend empty: tasks never completed execution")
print("="*80 + "\n")
