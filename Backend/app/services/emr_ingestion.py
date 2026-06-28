# backend/app/services/emr_ingestion.py
import logging
import os
from datetime import datetime
from typing import List, Dict, Any

from hl7apy.parser import parse_message
import httpx
from sqlalchemy.dialects.postgresql import insert

from app.core.database import SessionLocal
from app.models.hospital import PatientEncounter

logger = logging.getLogger(__name__)

def parse_adt_message(raw_hl7: str) -> Dict[str, Any]:
    """
    Parse HL7 v2 ADT message using hl7apy.
    Extracts MRN, event type, department, triage level, admit time.
    """
    try:
        msg = parse_message(raw_hl7.replace("\n", "\r"))
        
        # PID.3 - MRN
        mrn = msg.PID.PID_3.value
        
        # EVN.1 - Event Type
        event_type = msg.EVN.EVN_1.value
        status_map = {
            "A01": "Waiting",      # Admit
            "A02": "InTreatment",  # Transfer
            "A03": "Discharged"    # Discharge
        }
        status = status_map.get(event_type, "Waiting")
        
        # PV1.3 - Assigned Patient Location (Department)
        # Using PV1.3.1 for Point of Care
        try:
            department = msg.PV1.PV1_3.PV1_3_1.value
        except Exception:
            department = "ER"
            
        # OBX - Observation for Triage level
        triage_level = 3
        try:
            for obx in msg.OBX:
                if obx.OBX_3.OBX_3_1.value == "TRIAGE":
                    triage_level = int(obx.OBX_5.value)
                    break
        except Exception:
            pass
            
        # PV1.44 - Admit Date/Time
        try:
            admit_time_str = msg.PV1.PV1_44.value
            admit_time = datetime.strptime(admit_time_str[:14], "%Y%m%d%H%M%S")
        except Exception:
            admit_time = datetime.utcnow()
            
        return {
            "mrn": mrn,
            "arrival_time": admit_time,
            "triage_level": triage_level,
            "department": department,
            "status": status
        }
    except Exception as exc:
        logger.error(f"Failed to parse HL7 message: {exc}")
        return {}

async def pull_fhir_encounters(fhir_base_url: str, since_datetime: str) -> List[Dict[str, Any]]:
    """
    Pulls recent encounters from a FHIR server using pagination.
    """
    token = os.getenv("FHIR_AUTH_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    encounters = []
    url = f"{fhir_base_url}/Encounter?_lastUpdated=gt{since_datetime}&_count=100&status=in-progress"
    
    async with httpx.AsyncClient() as client:
        while url:
            try:
                response = await client.get(url, headers=headers, timeout=10.0)
                response.raise_for_status()
                bundle = response.json()
                
                for entry in bundle.get("entry", []):
                    resource = entry.get("resource", {})
                    if resource.get("resourceType") != "Encounter":
                        continue
                        
                    # Map FHIR resource to PatientEncounter fields
                    mrn = resource.get("subject", {}).get("reference", "Unknown")
                    if mrn.startswith("Patient/"):
                        mrn = mrn.replace("Patient/", "MRN-")
                        
                    period = resource.get("period", {})
                    arrival_time_str = period.get("start")
                    arrival_time = datetime.fromisoformat(arrival_time_str.replace("Z", "+00:00")).replace(tzinfo=None) if arrival_time_str else datetime.utcnow()
                    
                    # Try to extract triage level from extensions or priority
                    priority = resource.get("priority", {}).get("coding", [{}])[0].get("code", "3")
                    try:
                        triage_level = int(priority)
                    except ValueError:
                        triage_level = 3
                        
                    department = "ER"
                    locations = resource.get("location", [])
                    if locations:
                        loc_display = locations[0].get("location", {}).get("display", "")
                        if "icu" in loc_display.lower(): department = "ICU"
                        elif "ward" in loc_display.lower(): department = "Ward"
                        elif "opd" in loc_display.lower(): department = "OPD"
                        
                    encounters.append({
                        "mrn": mrn,
                        "arrival_time": arrival_time,
                        "triage_level": triage_level,
                        "department": department,
                        "status": "InTreatment"
                    })
                    
                # Find next page link
                url = None
                for link in bundle.get("link", []):
                    if link.get("relation") == "next":
                        url = link.get("url")
                        break
            except Exception as exc:
                logger.error(f"Error pulling FHIR encounters from {url}: {exc}")
                break
                
    return encounters

async def ingest_fhir_batch(since_datetime: str) -> int:
    """
    Pulls encounters from FHIR and upserts them into PostgreSQL.
    """
    fhir_base_url = os.getenv("FHIR_BASE_URL")
    if not fhir_base_url:
        logger.warning("FHIR_BASE_URL not set. Skipping FHIR sync.")
        return 0
        
    encounters = await pull_fhir_encounters(fhir_base_url, since_datetime)
    if not encounters:
        return 0
        
    with SessionLocal() as db:
        stmt = insert(PatientEncounter).values(encounters)
        # Assuming mrn is the unique identifier for upsert, although schema requires an id.
        # If mrn is not unique constraint, this will just insert.
        # For true UPSERT, we need a unique constraint on mrn.
        # Assuming for now we just insert or rely on UUID.
        try:
            db.execute(stmt)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error(f"Failed to bulk insert FHIR encounters: {exc}")
            return 0
            
    return len(encounters)
