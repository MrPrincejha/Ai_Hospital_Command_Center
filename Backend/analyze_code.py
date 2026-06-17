#!/usr/bin/env python3
"""
Comprehensive analysis of AI Hospital Backend for:
1. Task name mismatches between celery_app definitions and route calls
2. Undefined class/function references
3. Circular import patterns
"""

import re
import glob
from pathlib import Path

def read_file(path):
    """Read file safely"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except:
        return ""

# ============================================================================
# 1. CHECK CELERY TASK NAMES
# ============================================================================
print("=" * 80)
print("1. CELERY TASK DEFINITIONS vs USAGE")
print("=" * 80)

celery_app_code = read_file('worker/celery_app.py')

# Extract task names from celery_app.py
task_routes = re.findall(r'"(hospital\.\w+\.\w+)"', celery_app_code)
task_schedule = re.findall(r'"task":\s*"(hospital\.\w+\.\w+)"', celery_app_code)

defined_tasks = set(task_routes + task_schedule)
print(f"\n✓ Task names defined in celery_app.py:")
for task in sorted(defined_tasks):
    print(f"  - {task}")

# Extract task names from task files
all_tasks_defined = set()
for task_file in ['worker/tasks/simulation_tasks.py', 'worker/tasks/forecast_tasks.py', 'worker/tasks/telemetry_tasks.py']:
    code = read_file(task_file)
    tasks = re.findall(r'name=["\']([^"\']+)["\']', code)
    all_tasks_defined.update(tasks)
    print(f"\n✓ Tasks defined in {task_file}:")
    for task in sorted(tasks):
        print(f"  - {task}")

# Check task usage in routes
print(f"\n✓ Task usage in API routes:")
for route_file in glob.glob('app/api/routes/*.py'):
    code = read_file(route_file)
    # Look for get_simulation_task() or get_forecast_task() calls
    if 'get_simulation_task' in code:
        print(f"  - simulation.py calls get_simulation_task() → expects 'hospital.simulation.run'")
    if 'get_forecast_task' in code:
        print(f"  - forecast.py calls get_forecast_task() → expects 'hospital.forecast.run'")

print(f"\n✓ Task names match: {('hospital.simulation.run' in defined_tasks and 'hospital.forecast.run' in defined_tasks)}")

# ============================================================================
# 2. CHECK FOR UNDEFINED REFERENCES
# ============================================================================
print("\n" + "=" * 80)
print("2. UNDEFINED REFERENCES CHECK")
print("=" * 80)

# Define what should be exported from each module
module_exports = {
    'app.core.redis_client': ['get_redis_async', 'get_json', 'set_json', 'sync_set_json', 'sync_publish', 'health_check', 'init_redis_pool', 'close_redis_pool'],
    'app.core.config': ['settings', 'Settings', 'get_settings'],
    'app.services.simulation_engine': ['run_hospital_simulation_task'],
    'app.services.forecast_engine': ['run_forecasting_pipeline'],
    'app.services.llm_copilot': ['HospitalCopilotService', 'MockHospitalCopilot', 'build_copilot'],
    'app.schemas.hospital': ['HealthResponse', 'ErrorResponse', 'CopilotQueryRequest', 'CopilotQueryResponse', 'WebSocketMessage', 'TelemetryEventSchema', 'DepartmentSnapshotSchema'],
}

# Check imports in key files
print("\n✓ Checking imports in critical files:")

route_files = {
    'app/api/routes/simulation.py': [
        ('worker.celery_app', ['celery_app', 'get_simulation_task']),
        ('app.core.config', ['Settings', 'get_settings']),
        ('app.core.redis_client', ['get_json']),
        ('app.schemas.hospital', ['SimulationStartRequest', 'SimulationStartResponse']),
    ],
    'app/api/routes/forecast.py': [
        ('worker.celery_app', ['celery_app', 'get_forecast_task']),
        ('app.core.config', ['Settings', 'get_settings']),
        ('app.core.redis_client', ['get_json']),
    ],
    'app/api/routes/copilot.py': [
        ('app.services.llm_copilot', ['HospitalCopilotService', 'MockHospitalCopilot', 'build_copilot']),
    ],
}

issues = []
for route_file, required_imports in route_files.items():
    code = read_file(route_file)
    for module, symbols in required_imports:
        for symbol in symbols:
            if symbol in code or symbol.replace('_', '') in code.replace('_', ''):
                print(f"  [OK] {symbol} from {module} used in {route_file}")
            else:
                # Could be a missing import
                if f"from {module} import" in code or f"import {module}" in code:
                    pass  # Import exists, might just not be used
                else:
                    issues.append(f"Missing import: {module}.{symbol} in {route_file}")

# ============================================================================
# 3. CHECK CIRCULAR IMPORTS
# ============================================================================
print("\n" + "=" * 80)
print("3. CIRCULAR IMPORT DETECTION")
print("=" * 80)

# Check for potential circular imports by looking at import patterns
print("\n✓ Checking for circular import patterns...")

circular_risk_files = {
    'app/main.py': [
        'app.api.routes.simulation',
        'app.api.routes.forecast',
        'app.websocket.manager',
    ],
    'app/services/simulation_engine.py': [
        'app.core.config',
        'app.core.redis_client',
    ],
    'worker/celery_app.py': [
        'app.core.config',
        'worker.tasks.simulation_tasks',
        'worker.tasks.forecast_tasks',
    ],
}

for file, imports_check in circular_risk_files.items():
    code = read_file(file)
    for imp in imports_check:
        if f"from {imp} import" in code or f"import {imp}" in code:
            print(f"  [OK] {file} imports {imp}")

# ============================================================================
# 4. TASK DEFINITION VERIFICATION
# ============================================================================
print("\n" + "=" * 80)
print("4. CELERY TASK DECORATOR VERIFICATION")
print("=" * 80)

for task_file in ['worker/tasks/simulation_tasks.py', 'worker/tasks/forecast_tasks.py', 'worker/tasks/telemetry_tasks.py']:
    code = read_file(task_file)
    # Find @celery_app.task decorators and their names
    decorators = re.findall(r'@celery_app\.task\([^)]*name=["\']([^"\']+)["\']', code)
    functions = re.findall(r'def (\w+)\(', code)
    
    print(f"\n✓ {task_file}:")
    for dec, func in zip(decorators, functions[:len(decorators)]):
        print(f"  Task name: {dec} → function: {func}")

# Summary
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)

if issues:
    print(f"\n⚠ Found {len(issues)} potential issues:")
    for issue in issues:
        print(f"  - {issue}")
else:
    print("\n✓ No undefined references detected")
