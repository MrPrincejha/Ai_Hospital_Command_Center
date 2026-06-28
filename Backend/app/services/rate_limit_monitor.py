# backend/app/services/rate_limit_monitor.py
import time
from typing import Any
from slowapi import Limiter
from slowapi.util import get_remote_address

def get_user_id_from_request(request):
    """Key function to extract user ID from authenticated request."""
    user = getattr(request.state, "user", None)
    if user:
        return str(user.id)
    # Fallback to IP if not authenticated yet, but shouldn't happen for protected routes
    return get_remote_address(request)

# Singleton limiter instance to be imported by main.py and routes
limiter = Limiter(key_func=get_user_id_from_request)

def get_user_usage(user_id: str, limit_string: str = "50/hour") -> dict[str, Any]:
    """
    Query the Redis storage directly or use Limiter to get current usage and reset time.
    SlowAPI uses limits package under the hood.
    """
    from limits import parse
    limit = parse(limit_string)
    
    # Storage is configured in main.py, so we access it via limiter
    if limiter._storage:
        # Get the current window usage. The key format depends on the storage backend.
        # This is a general approximation as direct querying requires knowing the exact key.
        window_stats = limiter._storage.get(f"LIMITER/{user_id}/{limit_string}")
        
        # The return format expects count and reset time
        return {
            "user_id": user_id,
            "limit": limit_string,
            "current_count": window_stats[0] if window_stats else 0,
            "reset_time_unix": window_stats[1] if window_stats else int(time.time() + 3600)
        }
    
    return {"error": "Storage not configured"}
