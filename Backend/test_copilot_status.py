#!/usr/bin/env python
"""Quick test script to check copilot status endpoint"""
import asyncio
import time
import urllib.request
import json

def test_copilot_endpoint():
    """Test the copilot status endpoint"""
    time.sleep(2)  # Wait for server to start
    try:
        response = urllib.request.urlopen('http://127.0.0.1:8000/api/copilot/status', timeout=5)
        data = json.loads(response.read().decode())
        print(json.dumps(data, indent=2))
        return data
    except Exception as e:
        print(f"Error calling endpoint: {e}")
        return None

if __name__ == "__main__":
    result = test_copilot_endpoint()
    if result:
        print("\n✓ API is responding!")
        print(f"✓ API Key Configured: {result.get('api_key_configured')}")
        print(f"✓ Mode: {result.get('mode')}")
    else:
        print("✗ API not responding or error occurred")
