# 🚀 QUICK START - Agent Setup Complete

Your ZeroClaw agent is **built and ready to use!**

## What You Have

✅ Agent binary: `/workspaces/Suite/zeroclaw-main/target/release/zeroclaw` (13MB)
✅ Analysis message: Embedded in scripts below
✅ Output folder: `/workspaces/Suite/analysis_outputs/drawing_list_analysis/`

## How to Use (Choose One)

### **Option A: Fastest (Automated Script)** ⭐ RECOMMENDED
```bash
# 1. Set your API key (do once)
export ZEROCLAW_API_KEY="your_api_key_here"

# 2. Setup agent (do once)
chmod +x /workspaces/Suite/setup_agent.sh
/workspaces/Suite/setup_agent.sh

# 3. Run analysis (you can repeat this)
chmod +x /workspaces/Suite/run_drawing_list_analysis.sh
/workspaces/Suite/run_drawing_list_analysis.sh

# 4. Check results
ls -la /workspaces/Suite/analysis_outputs/drawing_list_analysis/
```

### **Option B: Manual (Full Control)**

**Terminal 1 - Start Agent:**
```bash
export ZEROCLAW_API_KEY="your_api_key_here"
source "$HOME/.cargo/env"
cd /workspaces/Suite/zeroclaw-main

# First time setup
./target/release/zeroclaw onboard --api-key $ZEROCLAW_API_KEY --provider openrouter

# Start gateway
./target/release/zeroclaw gateway
```

**Terminal 2 - Send Analysis:**
```bash
source "$HOME/.cargo/env"  
cd /workspaces/Suite/zeroclaw-main

cat /workspaces/Suite/DRAWING_LIST_ANALYSIS_COMMANDS.md | grep -A500 "ANALYZE DRAWING LIST" | head -150 > /tmp/msg.txt

./target/release/zeroclaw agent -m "$(cat /tmp/msg.txt)"
```

## Get Your API Key

Choose ONE provider:

| Provider | Link | Cost | Speed |
|----------|------|------|-------|
| **OpenRouter** (best) | https://openrouter.ai | Pay per use | Fast |
| OpenAI | https://platform.openai.com | Pay per use | Fast |
| Anthropic | https://console.anthropic.com | Pay per use | Fast |
| Local (Ollama) | https://ollama.ai | Free | Slower |

## What Happens

1. **Agent analyzes** your drawing list folder
2. **Learns boundaries** from R3P-SPEC PDF
3. **Generates 7 files:**
   - `drawing_list_manager.py` - Main automation tool
   - `excel_to_python_bridge.py` - Excel integration
   - `smart_drawing_list_template.xlsx` - Ready-to-use template
   - `company_standards.json` - Your standards extracted
   - `README.md` - Instructions
   - `integration_guide.md` - Build into Suite
   - Full conversation log

4. **Everything goes to:**
   `/workspaces/Suite/analysis_outputs/drawing_list_analysis/`

5. **Back it up:**
   ```bash
   cd /workspaces/Suite
   git add analysis_outputs/
   git commit -m "Add drawing list analysis and generated tools"
   git push origin main
   ```

## Troubleshooting

**"ZEROCLAW_API_KEY not set"**
```bash
export ZEROCLAW_API_KEY="sk-xxx-your-actual-key"
```

**"zeroclaw: command not found"**
```bash
source "$HOME/.cargo/env"
# Try again
```

**"Agent won't connect"**
```bash
# Make sure gateway is running in Terminal 1
# Check: ps aux | grep zeroclaw
```

**"Output files not created"**
```bash
# Check folder exists
ls -la /workspaces/Suite/analysis_outputs/drawing_list_analysis/

# Check agent ran
tail -50 /tmp/zeroclaw.log
```

## Next Steps After Analysis

1. **Review Python code** - It's runnable immediately
2. **Test the tool:**
   ```bash
   cd /workspaces/Suite/analysis_outputs/drawing_list_analysis/
   python3 drawing_list_manager.py --help
   ```

3. **Use the Excel template** - Smart with auto-numbering

4. **Integrate into Suite** - Follow integration_guide.md

5. **Download files:**
   ```bash
   # Copy back to desktop when ready
   # Everything is in: analysis_outputs/drawing_list_analysis/
   ```

## File Locations

```
/workspaces/Suite/
├── setup_agent.sh                    ← Run this first
├── run_drawing_list_analysis.sh      ← Run this to analyze
├── DRAWING_LIST_ANALYSIS_COMMANDS.md ← Full reference
├── analysis_outputs/
│   └── drawing_list_analysis/        ← Results go here
└── zeroclaw-main/
    └── target/release/zeroclaw      ← The agent binary
```

---

**You're all set! Run the scripts above to get started.** 🦀✨
