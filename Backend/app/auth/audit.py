# backend/app/auth/audit.py
import logging
import json
from datetime import datetime
from uuid import UUID

logger = logging.getLogger("audit_logger")
logger.setLevel(logging.INFO)

# Optional: write audit logs to a specific file in production
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(message)s"))
logger.addHandler(handler)

def log_action(user_id: UUID | str, action: str, detail: dict = None):
    """
    Writes structured JSON to the audit logger.
    Actions: 'copilot_query', 'simulation_run', 'forecast_run', 'login', 'logout'
    """
    if detail is None:
        detail = {}
        
    audit_record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user_id": str(user_id),
        "action": action,
        "detail": detail
    }
    
    logger.info(json.dumps(audit_record))
