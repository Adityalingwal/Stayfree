"""
MRMUR Formatter Fine-Tuning - Setup Verification
Run after setup.sh to verify everything is installed correctly.

Usage:
  source .venv/bin/activate
  export $(cat .env | grep -v '^#' | xargs)
  python verify_setup.py
"""

import sys
import os

print("=" * 55)
print("MRMUR Formatter Fine-Tuning - Setup Verification")
print("=" * 55)
print()

errors = []
warnings = []

# 1. Python version
print(f"[1/7] Python version: {sys.version.split()[0]}")
if sys.version_info < (3, 11):
    errors.append("Python 3.11+ required")
    print("  FAIL")
else:
    print("  OK")

# 2. Tinker SDK
print("\n[2/7] Tinker SDK...")
try:
    import tinker
    ver = getattr(tinker, "__version__", "installed")
    print(f"  OK — tinker {ver}")
except ImportError as e:
    errors.append(f"tinker not installed: {e}")
    print(f"  FAIL: {e}")

# 3. Tinker Cookbook
print("\n[3/7] Tinker Cookbook...")
try:
    from tinker_cookbook import renderers, model_info
    from tinker_cookbook.supervised.data import FromConversationFileBuilder
    from tinker_cookbook.supervised.data import conversation_to_datum
    print("  OK — renderers, model_info, FromConversationFileBuilder available")
except ImportError as e:
    errors.append(f"tinker_cookbook not installed: {e}")
    print(f"  FAIL: {e}")

# 4. PyTorch
print("\n[4/7] PyTorch...")
try:
    import torch
    print(f"  OK — torch {torch.__version__}")
except ImportError as e:
    errors.append(f"torch not installed: {e}")
    print(f"  FAIL: {e}")

# 5. Transformers
print("\n[5/7] Transformers...")
try:
    import transformers
    print(f"  OK — transformers {transformers.__version__}")
except ImportError as e:
    errors.append(f"transformers not installed: {e}")
    print(f"  FAIL: {e}")

# 6. TINKER_API_KEY
print("\n[6/7] TINKER_API_KEY...")
api_key = os.environ.get("TINKER_API_KEY")
if api_key and api_key != "your-key-here":
    print(f"  OK — Key set ({api_key[:8]}...)")
else:
    warnings.append("TINKER_API_KEY not set or still placeholder")
    print("  WARNING: Set your API key in .env")

# 7. Data files
print("\n[7/7] Training data...")
import json
from pathlib import Path

splits_dir = Path(__file__).parent / "data" / "splits"
all_ok = True
for split in ["train.jsonl", "val.jsonl", "test.jsonl"]:
    fpath = splits_dir / split
    if fpath.exists():
        count = sum(1 for _ in open(fpath))
        # Verify format
        with open(fpath) as f:
            row = json.loads(f.readline())
            has_messages = "messages" in row
            roles = [m["role"] for m in row["messages"]]
            format_ok = roles == ["system", "user", "assistant"]
        status = "OK" if (has_messages and format_ok) else "BAD FORMAT"
        print(f"  {split}: {count} examples — {status}")
        if not format_ok:
            errors.append(f"{split} has wrong message format: {roles}")
    else:
        errors.append(f"{split} not found")
        print(f"  {split}: NOT FOUND")
        all_ok = False

# Summary
print("\n" + "=" * 55)
if errors:
    print(f"FAIL — {len(errors)} error(s):")
    for err in errors:
        print(f"  - {err}")
elif warnings:
    print(f"OK with {len(warnings)} warning(s):")
    for w in warnings:
        print(f"  - {w}")
    print("\nFix warnings, then you're ready for training!")
else:
    print("ALL CHECKS PASSED — Ready for fine-tuning!")
print("=" * 55)

sys.exit(1 if errors else 0)
