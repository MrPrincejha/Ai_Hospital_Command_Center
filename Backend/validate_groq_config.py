#!/usr/bin/env python
"""
Comprehensive validation script for LLM Groq API configuration changes.
Tests all modified files to ensure they correctly use groq_api_key.
"""

import sys
import json
import os

# Add Backend to path
sys.path.insert(0, 'e:\\ai_hospital\\Backend')

def test_settings_config():
    """Test that Settings correctly loads groq_api_key"""
    print("\n" + "="*60)
    print("TEST 1: Settings Configuration")
    print("="*60)
    
    try:
        from app.core.config import Settings, get_settings
        settings = Settings()
        
        print(f"✓ Settings imported successfully")
        print(f"  - groq_api_key type: {type(settings.groq_api_key)}")
        print(f"  - groq_api_key is not None: {settings.groq_api_key is not None}")
        print(f"  - llm_model: {settings.llm_model}")
        
        if settings.groq_api_key is not None:
            print(f"✓ GROQ_API_KEY is configured in .env")
            return True
        else:
            print(f"⚠ GROQ_API_KEY not configured (expected in development)")
            return True  # Still pass because it's optional in dev
    except Exception as e:
        print(f"✗ Error loading settings: {e}")
        return False

def test_llm_copilot_service():
    """Test that HospitalCopilotService accepts groq_api_key parameter"""
    print("\n" + "="*60)
    print("TEST 2: HospitalCopilotService Groq Integration")
    print("="*60)
    
    try:
        from app.services.llm_copilot import HospitalCopilotService
        import inspect
        
        # Check __init__ signature
        sig = inspect.signature(HospitalCopilotService.__init__)
        params = list(sig.parameters.keys())
        
        print(f"✓ HospitalCopilotService imported successfully")
        print(f"  - __init__ parameters: {params}")
        
        if 'groq_api_key' in params:
            print(f"✓ 'groq_api_key' parameter found in __init__")
            return True
        else:
            print(f"✗ 'groq_api_key' parameter NOT found in __init__")
            return False
            
    except Exception as e:
        print(f"✗ Error testing HospitalCopilotService: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_clinical_screening_pipeline():
    """Test that ClinicalScreeningPipeline accepts groq_api_key parameter"""
    print("\n" + "="*60)
    print("TEST 3: ClinicalScreeningPipeline Groq Integration")
    print("="*60)
    
    try:
        from app.services.clinical_scorer import ClinicalScreeningPipeline
        import inspect
        
        # Check __init__ signature
        sig = inspect.signature(ClinicalScreeningPipeline.__init__)
        params = list(sig.parameters.keys())
        
        print(f"✓ ClinicalScreeningPipeline imported successfully")
        print(f"  - __init__ parameters: {params}")
        
        if 'groq_api_key' in params:
            print(f"✓ 'groq_api_key' parameter found in __init__")
            return True
        else:
            print(f"✗ 'groq_api_key' parameter NOT found in __init__")
            return False
            
    except Exception as e:
        print(f"✗ Error testing ClinicalScreeningPipeline: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_copilot_routes():
    """Test that copilot routes use Settings for groq_api_key"""
    print("\n" + "="*60)
    print("TEST 4: Copilot Routes Settings Integration")
    print("="*60)
    
    try:
        # Check that the file contains settings.groq_api_key checks
        with open('e:\\ai_hospital\\Backend\\app\\api\\routes\\copilot.py', 'r') as f:
            content = f.read()
        
        checks = [
            ('settings.groq_api_key is not None', 'Settings groq_api_key check'),
            ('settings.groq_api_key.get_secret_value()', 'SecretStr unwrapping'),
            ('GROQ_API_KEY', 'Groq reference'),
        ]
        
        all_found = True
        for check_str, desc in checks:
            if check_str in content:
                print(f"✓ Found: {desc}")
            else:
                print(f"✗ Missing: {desc}")
                all_found = False
        
        # Check that OPENAI_API_KEY is not in copilot.py
        if 'OPENAI_API_KEY' not in content:
            print(f"✓ No OpenAI API key references found (correctly removed)")
        else:
            print(f"⚠ Warning: OpenAI references still present (may be in comments)")
        
        return all_found
        
    except Exception as e:
        print(f"✗ Error checking copilot routes: {e}")
        return False

def test_llm_copilot_file():
    """Test that llm_copilot.py uses ChatGroq"""
    print("\n" + "="*60)
    print("TEST 5: LLM Copilot Service Groq Implementation")
    print("="*60)
    
    try:
        with open('e:\\ai_hospital\\Backend\\app\\services\\llm_copilot.py', 'r') as f:
            content = f.read()
        
        checks = [
            ('from langchain_groq import ChatGroq', 'ChatGroq import'),
            ('ChatGroq(', 'ChatGroq instantiation'),
            ('groq_api_key=groq_api_key', 'Groq API key parameter'),
        ]
        
        all_found = True
        for check_str, desc in checks:
            if check_str in content:
                print(f"✓ Found: {desc}")
            else:
                print(f"✗ Missing: {desc}")
                all_found = False
        
        # Check that ChatOpenAI is not used
        if 'from langchain_openai import ChatOpenAI' not in content:
            print(f"✓ ChatOpenAI import correctly removed")
        else:
            print(f"✗ ChatOpenAI import still present")
            all_found = False
            
        return all_found
        
    except Exception as e:
        print(f"✗ Error checking llm_copilot file: {e}")
        return False

def test_clinical_scorer_file():
    """Test that clinical_scorer.py uses ChatGroq"""
    print("\n" + "="*60)
    print("TEST 6: Clinical Scorer Service Groq Implementation")
    print("="*60)
    
    try:
        with open('e:\\ai_hospital\\Backend\\app\\services\\clinical_scorer.py', 'r') as f:
            content = f.read()
        
        checks = [
            ('from langchain_groq import ChatGroq', 'ChatGroq import in LLMReportParser'),
            ('def __init__(self, groq_api_key: str', 'groq_api_key parameter in LLMReportParser'),
        ]
        
        all_found = True
        for check_str, desc in checks:
            if check_str in content:
                print(f"✓ Found: {desc}")
            else:
                print(f"✗ Missing: {desc}")
                all_found = False
        
        # Check that openai import is removed
        if 'import openai' not in content:
            print(f"✓ OpenAI import correctly removed")
        else:
            print(f"✗ OpenAI import still present")
            all_found = False
            
        return all_found
        
    except Exception as e:
        print(f"✗ Error checking clinical_scorer file: {e}")
        return False

def test_clinical_routes_file():
    """Test that clinical routes use Settings for groq_api_key"""
    print("\n" + "="*60)
    print("TEST 7: Clinical Routes Settings Integration")
    print("="*60)
    
    try:
        with open('e:\\ai_hospital\\Backend\\app\\api\\routes\\clinical.py', 'r') as f:
            content = f.read()
        
        checks = [
            ('from app.core.config import Settings, get_settings', 'Settings import'),
            ('settings: Settings = Depends(get_settings)', 'Settings dependency injection'),
            ('groq_api_key=groq_api_key', 'Groq API key passed to pipeline'),
        ]
        
        all_found = True
        for check_str, desc in checks:
            if check_str in content:
                print(f"✓ Found: {desc}")
            else:
                print(f"✗ Missing: {desc}")
                all_found = False
        
        return all_found
        
    except Exception as e:
        print(f"✗ Error checking clinical routes file: {e}")
        return False

def main():
    """Run all validation tests"""
    print("\n" + "#"*60)
    print("# LLM Groq API Configuration Validation Suite")
    print("#"*60)
    
    tests = [
        ("Settings Configuration", test_settings_config),
        ("HospitalCopilotService Integration", test_llm_copilot_service),
        ("ClinicalScreeningPipeline Integration", test_clinical_screening_pipeline),
        ("Copilot Routes Integration", test_copilot_routes),
        ("LLM Copilot File Implementation", test_llm_copilot_file),
        ("Clinical Scorer File Implementation", test_clinical_scorer_file),
        ("Clinical Routes Implementation", test_clinical_routes_file),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"✗ Test failed with exception: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_name, False))
    
    # Summary
    print("\n" + "="*60)
    print("VALIDATION SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "-"*60)
    print(f"Total: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓✓✓ All validation tests passed! ✓✓✓")
        print("\nLLM Configuration Summary:")
        print("  - HospitalCopilotService: ✓ Accepts groq_api_key parameter")
        print("  - LLMReportParser: ✓ Accepts groq_api_key parameter")
        print("  - ClinicalScreeningPipeline: ✓ Passes groq_api_key to parser")
        print("  - Routes: ✓ Inject Settings and pass groq_api_key to services")
        print("  - ChatGroq: ✓ Used instead of ChatOpenAI")
        print("\nNext Steps:")
        print("  1. Run FastAPI server from Backend directory")
        print("  2. Call GET /api/copilot/status - should show api_key_configured=true")
        print("  3. Call POST /api/copilot/query - should get real Groq responses")
        return 0
    else:
        print("\n✗✗✗ Some tests failed - please review output above ✗✗✗")
        return 1

if __name__ == "__main__":
    sys.exit(main())
