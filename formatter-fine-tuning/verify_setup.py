"""
StayFree Formatter Fine-Tuning - Setup Verification
Run after setup.sh to verify everything is installed correctly.
"""

import sys
import os

print("=" * 50)
print("StayFree Formatter Fine-Tuning - Setup Verification")
print("=" * 50)
print()

errors = []

# 1. Python version check
print(f"[1/6] Python version: {sys.version}")
if sys.version_info < (3, 11):
    errors.append("Python 3.11+ required")
    print("  ❌ FAIL: Need Python 3.11+")
else:
    print("  ✓ OK")

# 2. Tinker SDK
print("\n[2/6] Tinker SDK...")
try:
    import tinker
    print(f"  ✓ OK - tinker version: {tinker.__version__ if hasattr(tinker, '__version__') else 'installed'}")
except ImportError as e:
    errors.append(f"tinker not installed: {e}")
    print(f"  ❌ FAIL: {e}")

# 3. Tinker Cookbook
print("\n[3/6] Tinker Cookbook...")
try:
    from tinker_cookbook import renderers, tokenizer_utils
    from tinker_cookbook.hyperparam_utils import get_lr
    print("  ✓ OK - renderers, tokenizer_utils, get_lr all available")
except ImportError as e:
    errors.append(f"tinker_cookbook not installed: {e}")
    print(f"  ❌ FAIL: {e}")

# 4. Torch
print("\n[4/6] PyTorch...")
try:
    import torch
    print(f"  ✓ OK - torch version: {torch.__version__}")
except ImportError as e:
    errors.append(f"torch not installed: {e}")
    print(f"  ❌ FAIL: {e}")

# 5. TINKER_API_KEY
print("\n[5/6] TINKER_API_KEY...")
api_key = os.environ.get("TINKER_API_KEY")
if api_key:
    print(f"  ✓ OK - Key set ({api_key[:8]}...)")
else:
    errors.append("TINKER_API_KEY not set")
    print("  ⚠ WARNING: TINKER_API_KEY not set")
    print("  Set it with: export TINKER_API_KEY='your-key-here'")

# 6. Tinker connection test (only if API key is set)
print("\n[6/6] Tinker Service Connection...")
if api_key:
    try:
        service_client = tinker.ServiceClient()
        # Try to check available models
        print("  ✓ OK - ServiceClient created")
        print("  (Full connection test requires API call - will test during training)")
    except Exception as e:
        errors.append(f"ServiceClient failed: {e}")
        print(f"  ❌ FAIL: {e}")
else:
    print("  ⏭ SKIPPED (no API key)")

# Summary
print("\n" + "=" * 50)
if errors:
    print(f"❌ {len(errors)} issue(s) found:")
    for err in errors:
        print(f"  - {err}")
else:
    print("✓ All checks passed! Ready for fine-tuning.")
print("=" * 50)

sys.exit(1 if errors else 0)
