# backend/worker/patient_flow_generator.py
import asyncio
import os
import random
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.hospital import PatientEncounter

CIRCADIAN_WEIGHTS = {
    (0, 6): 0.4,
    (6, 12): 1.3,
    (12, 18): 1.0,
    (18, 24): 0.7
}

def get_circadian_multiplier(dt: datetime) -> float:
    hour = dt.hour
    for (start, end), weight in CIRCADIAN_WEIGHTS.items():
        if start <= hour < end:
            return weight
    return 1.0

def arrival_rate(dt: datetime) -> float:
    hospital_type = os.getenv("HOSPITAL_TYPE", "community")
    base_rate = 7.0 if hospital_type == "trauma" else 3.5
    multiplier = get_circadian_multiplier(dt)
    target_rate = base_rate * multiplier
    noise_sigma = base_rate * 0.15
    rate = random.gauss(target_rate, noise_sigma)
    return max(0.1, rate)

def create_encounter(arrival_time: datetime) -> PatientEncounter:
    mrn = f"MRN-{uuid4().hex[:8].upper()}"
    triage_level = random.choices([1, 2, 3, 4, 5], weights=[5, 20, 35, 30, 10])[0]
    department = random.choices(["ER", "OPD", "Ward", "ICU"], weights=[50, 30, 15, 5])[0]
    
    return PatientEncounter(
        mrn=mrn,
        arrival_time=arrival_time,
        triage_level=triage_level,
        department=department,
        status="Waiting"
    )

def tick(db: Session, dt: datetime = None) -> int:
    if dt is None:
        dt = datetime.utcnow()
        
    rate = arrival_rate(dt)
    
    if random.random() < 0.05:
        rate *= 3.0
        
    count = int(rate)
    if random.random() < (rate - count):
        count += 1
        
    encounters = [create_encounter(dt) for _ in range(count)]
    if encounters:
        db.bulk_save_objects(encounters)
        db.commit()
        
    return count

async def run_live_generator():
    print("Starting continuous live patient flow generator...")
    while True:
        with SessionLocal() as db:
            count = tick(db)
            print(f"[{datetime.utcnow().isoformat()}] Generated {count} encounters")
        
        current_rate = arrival_rate(datetime.utcnow())
        sleep_time = 60.0 / current_rate if current_rate > 0 else 60.0
        await asyncio.sleep(sleep_time)

def backfill_history(hours: int = 8760):
    print(f"Starting historical backfill for {hours} hours...")
    start_time = datetime.utcnow() - timedelta(hours=hours)
    
    with SessionLocal() as db:
        encounters = []
        minutes_total = hours * 60
        
        for i in range(minutes_total):
            current_time = start_time + timedelta(minutes=i)
            rate = arrival_rate(current_time)
            
            if random.random() < 0.05:
                rate *= 3.0
                
            count = int(rate)
            if random.random() < (rate - count):
                count += 1
                
            for _ in range(count):
                encounters.append(create_encounter(current_time))
                
            if (i > 0 and i % 720 == 0) or i == minutes_total - 1:
                db.bulk_save_objects(encounters)
                db.commit()
                print(f"Backfilled {(i / minutes_total) * 100:.1f}% ({len(encounters)} records)")
                encounters.clear()
                
    print("Historical backfill complete.")

if __name__ == "__main__":
    with SessionLocal() as db:
        existing = db.query(PatientEncounter).first()
        
    if not existing:
        backfill_history(hours=8760)
        
    asyncio.run(run_live_generator())
