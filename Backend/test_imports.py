import sys
import importlib.util
import traceback

# List of key modules to import
modules_to_test = [
    "app.main",
    "app.core.config",
    "app.core.redis_client",
    "app.services.simulation_engine",
    "app.services.forecast_engine",
    "app.services.llm_copilot",
    "app.services.clinical_scorer",
    "worker.celery_app",
    "worker.tasks.simulation_tasks",
    "worker.tasks.forecast_tasks",
    "worker.tasks.telemetry_tasks",
]

print("IMPORT VALIDATION TEST:\n")
import_errors = []
success_count = 0

for module_name in modules_to_test:
    try:
        spec = importlib.util.find_spec(module_name)
        if spec is None:
            print(f"[NOTFOUND] {module_name}")
            import_errors.append((module_name, "Module not found"))
        else:
            module = importlib.import_module(module_name)
            print(f"[OK]       {module_name}")
            success_count += 1
    except Exception as e:
        print(f"[ERROR]    {module_name}")
        print(f"           {str(e)[:80]}")
        import_errors.append((module_name, str(e)))

print(f"\n\nSUMMARY: {success_count}/{len(modules_to_test)} modules imported successfully")

if import_errors:
    print(f"\n⚠ {len(import_errors)} import issues found:")
    for mod, err in import_errors:
        print(f"\n  {mod}:")
        lines = err.split('\n')
        for line in lines[:3]:
            print(f"    {line[:100]}")
else:
    print("\n✓ No import errors found!")
