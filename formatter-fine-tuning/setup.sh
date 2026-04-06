#!/bin/bash
# StayFree Formatter Fine-Tuning - Setup Script
# Run this from the formatter-fine-tuning/ folder on your Mac
# Requires Python 3.11+

set -e

echo "=== StayFree Formatter Fine-Tuning Setup ==="
echo ""

# ── 1. Check Python version ──────────────────────────────────────────
PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 11 ]); then
    echo "ERROR: Python 3.11+ required. Found: Python $PYTHON_VERSION"
    echo ""
    echo "Install with:  brew install python@3.12"
    exit 1
fi
echo "[1/5] Python version OK: $PYTHON_VERSION"

# ── 2. Create virtual environment ────────────────────────────────────
echo "[2/5] Creating virtual environment..."
if [ -d ".venv" ]; then
    echo "    .venv already exists, skipping creation"
else
    python3 -m venv .venv
fi
source .venv/bin/activate

# ── 3. Install Tinker SDK + Cookbook ──────────────────────────────────
echo "[3/5] Installing Tinker SDK..."
pip install --upgrade pip
pip install tinker

echo "[4/5] Installing Tinker Cookbook (editable)..."
COOKBOOK_PATH="../tinker-cookbook"
if [ -d "$COOKBOOK_PATH" ]; then
    pip install -e "$COOKBOOK_PATH[wandb]"
    echo "    Cookbook installed from: $COOKBOOK_PATH (with wandb support)"
else
    echo "    ERROR: tinker-cookbook not found at $COOKBOOK_PATH"
    echo "    Expected folder structure:"
    echo "      StayFree/"
    echo "        ├── formatter-fine-tuning/   ← you are here"
    echo "        └── tinker-cookbook/          ← should be here"
    exit 1
fi

# ── 5. Create .env template if not exists ────────────────────────────
echo "[5/5] Checking .env file..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# Tinker API Key (get from https://console.thinkingmachines.ai)
TINKER_API_KEY=your-key-here

# Optional: Weights & Biases for training monitoring
# WANDB_API_KEY=your-wandb-key-here
EOF
    echo "    Created .env template — fill in your TINKER_API_KEY"
else
    echo "    .env already exists"
fi

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env and set your TINKER_API_KEY"
echo "  2. Activate venv:  source .venv/bin/activate"
echo "  3. Load env:       export \$(cat .env | grep -v '^#' | xargs)"
echo "  4. Verify:         python verify_setup.py"
echo ""
