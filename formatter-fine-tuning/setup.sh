#!/bin/bash
# StayFree Formatter Fine-Tuning - Setup Script
# Run this on your Mac (requires Python 3.11+)

set -e

echo "=== StayFree Formatter Fine-Tuning Setup ==="
echo ""

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 11 ]); then
    echo "ERROR: Python 3.11+ required. Found: Python $PYTHON_VERSION"
    echo ""
    echo "Install Python 3.11+ with:"
    echo "  brew install python@3.12"
    echo "  # or"
    echo "  brew install python@3.11"
    exit 1
fi

echo "[1/5] Python version OK: $PYTHON_VERSION"

# Create virtual environment
echo "[2/5] Creating virtual environment..."
python3 -m venv .venv
source .venv/bin/activate

# Install Tinker SDK
echo "[3/5] Installing Tinker SDK..."
pip install tinker

# Install Tinker Cookbook (editable, from sibling folder)
echo "[4/5] Installing Tinker Cookbook (editable)..."
COOKBOOK_PATH="../tinker-cookbook"
if [ -d "$COOKBOOK_PATH" ]; then
    pip install -e "$COOKBOOK_PATH"
    echo "    Cookbook installed from: $COOKBOOK_PATH"
else
    echo "    WARNING: tinker-cookbook not found at $COOKBOOK_PATH"
    echo "    Please clone it: git clone https://github.com/thinking-machines-lab/tinker-cookbook.git ../tinker-cookbook"
    echo "    Then run: pip install -e ../tinker-cookbook"
fi

# Install optional deps (wandb for monitoring)
echo "[5/5] Installing optional dependencies..."
pip install wandb

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Next steps:"
echo "  1. Set your API key:  export TINKER_API_KEY='your-key-here'"
echo "  2. Activate venv:     source .venv/bin/activate"
echo "  3. Verify:            python verify_setup.py"
echo ""
