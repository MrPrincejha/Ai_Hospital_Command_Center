# backend/tests/test_emr_ingestion.py
from app.services.emr_ingestion import parse_adt_message

def test_parse_adt_message():
    sample_hl7 = (
        "MSH|^~\&|EPIC|HOSP|CC|HOSP|20240101120000||ADT^A01|MSG00001|P|2.3\r"
        "EVN|A01|20240101120000\r"
        "PID|1||MRN123456^^^HOSP^MR||SMITH^JOHN||19800101|M\r"
        "PV1|1|E|ER^1^1|||||||||||||||||||||||||||||||||||||||||20240101120000\r"
        "OBX|1|NM|TRIAGE||2||||||F"
    )
    
    result = parse_adt_message(sample_hl7)
    
    assert result["mrn"] == "MRN123456"
    assert result["status"] == "Waiting"
    assert result["department"] == "ER"
    assert result["triage_level"] == 2
    assert result["arrival_time"].year == 2024
