#!/usr/bin/env python3
"""
Get detailed info about task failure from Redis result backend.
"""

import redis
import json
from app.core.config import settings

result_redis = redis.from_url(settings.celery_result_backend, decode_responses=True)

# Check the last failed task
keys = result_redis.keys("*")
print(f"Total keys in result backend: {len(keys)}")
print(f"Keys: {keys}")

for key in keys:
    value = result_redis.get(key)
    print(f"\nKey: {key}")
    try:
        data = json.loads(value)
        print(json.dumps(data, indent=2))
    except:
        print(f"Value: {value[:200]}")
