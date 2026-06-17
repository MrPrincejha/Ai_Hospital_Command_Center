#!/usr/bin/env python3
"""Check broker queue status."""

import redis
import json

r = redis.from_url("redis://localhost:6379/1", decode_responses=True)

# Look for actual task data in the "simulation" queue
print("\n[REDIS BROKER QUEUE STATUS]")
print("\nKey types in broker:")
for key in sorted(r.keys("*")):
    key_type = r.type(key)
    if key_type == "list":
        length = r.llen(key)
        print(f"  {key}: LIST ({length} items)")
        if length > 0:
            # Show first item
            item = r.lpop(key)
            print(f"    → Sample: {item[:100]}...")
            # Put it back
            r.rpush(key, item)
    elif key_type == "hash":
        print(f"  {key}: HASH")
    elif key_type == "string":
        print(f"  {key}: STRING")
    elif key_type == "set":
        print(f"  {key}: SET")
    else:
        print(f"  {key}: {key_type}")
