# backend/worker/tasks/emr_tasks.py
import asyncio
import logging
from datetime import datetime, timedelta

from worker.celery_app import celery_app
from app.services.emr_ingestion import ingest_fhir_batch, parse_adt_message
from app.core.redis_client import sync_redis
from app.core.database import SessionLocal
from app.models.hospital import PatientEncounter

logger = logging.getLogger(__name__)

@celery_app.task(name="hospital.emr.fhir_sync")
def fhir_sync():
    """
    Runs every 5 minutes via Celery Beat.
    Pulls FHIR encounters since the last sync time.
    """
    try:
        # Use sync redis client since Celery tasks are synchronous
        last_sync = sync_redis.get("emr:last_fhir_sync")
        if last_sync:
            since_datetime = last_sync.decode("utf-8")
        else:
            # Default to 1 hour ago if no previous sync
            since_datetime = (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z"
            
        logger.info(f"Starting FHIR sync since {since_datetime}")
        
        # Call the async function using asyncio
        count = asyncio.run(ingest_fhir_batch(since_datetime))
        
        # Update last sync time
        sync_redis.set("emr:last_fhir_sync", datetime.utcnow().isoformat() + "Z")
        logger.info(f"FHIR sync complete. Upserted {count} encounters.")
        
        return {"status": "success", "upserted": count}
    except Exception as exc:
        logger.error(f"FHIR sync failed: {exc}")
        return {"status": "error", "message": str(exc)}

@celery_app.task(name="hospital.emr.hl7_process")
def hl7_process(raw_message: str):
    """
    Processes a raw HL7 ADT message string.
    Typically called directly by an HL7 MLLP receiver service.
    """
    logger.info("Processing HL7 message")
    parsed_data = parse_adt_message(raw_message)
    
    if not parsed_data or "mrn" not in parsed_data:
        logger.warning("Could not extract valid data from HL7 message")
        return {"status": "error", "message": "Invalid message"}
        
    with SessionLocal() as db:
        try:
            # Check if encounter for this MRN exists (naive implementation, 
            # real life might use MRN + Visit Number to uniquely identify)
            encounter = db.query(PatientEncounter).filter_by(mrn=parsed_data["mrn"]).first()
            if encounter:
                encounter.status = parsed_data["status"]
                encounter.department = parsed_data["department"]
                # Update other fields if necessary
                logger.info(f"Updated existing encounter for {parsed_data['mrn']}")
            else:
                encounter = PatientEncounter(**parsed_data)
                db.add(encounter)
                logger.info(f"Created new encounter for {parsed_data['mrn']}")
                
            db.commit()
            return {"status": "success", "mrn": parsed_data["mrn"]}
        except Exception as exc:
            db.rollback()
            logger.error(f"Database error processing HL7: {exc}")
            return {"status": "error", "message": str(exc)}
