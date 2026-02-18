#!/bin/bash
# Quick Agent Setup Script

set -e

echo "🦀 ZeroClaw Agent Setup"
echo "======================="
echo ""

# Check for API key
if [ -z "$ZEROCLAW_API_KEY" ]; then
    echo "❌ ZEROCLAW_API_KEY not set!"
    echo ""
    echo "Get your API key:"
    echo "  - OpenRouter (recommended): https://openrouter.ai"
    echo "  - OpenAI: https://platform.openai.com"
    echo "  - Anthropic: https://console.anthropic.com"
    echo ""
    echo "Then run:"
    echo "  export ZEROCLAW_API_KEY='your_key_here'"
    echo "  ./setup_agent.sh"
    exit 1
fi

# Activate Rust
source "$HOME/.cargo/env"
cd /workspaces/Suite/zeroclaw-main

echo "✓ Step 1: Activating Rust..."
echo "✓ Step 2: Onboarding agent..."

# Onboard the agent
./target/release/zeroclaw onboard \
    --api-key "$ZEROCLAW_API_KEY" \
    --provider openrouter

echo ""
echo "✅ Agent configured!"
echo ""
echo "Next steps:"
echo "  1. Start gateway (Terminal 1):"
echo "     ./target/release/zeroclaw gateway"
echo ""
echo "  2. Send analysis (Terminal 2):"
echo "     ./target/release/zeroclaw agent -m \"[paste message from DRAWING_LIST_ANALYSIS_COMMANDS.md]\""
echo ""
echo "  3. Check results:"
echo "     ls -la /workspaces/Suite/analysis_outputs/drawing_list_analysis/"
echo ""
