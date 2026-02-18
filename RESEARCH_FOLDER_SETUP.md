# Suite Research & Analysis Setup - Ready for Bolt

## Overview

The Suite project has been restructured to support external analysis and tool generation:

- **Main App:** `/workspaces/Suite/` (private GitHub repo)
- **Research Materials:** `/workspaces/Research/` (organized, separate from code)
- **Generated Outputs:** `/workspaces/Suite/analysis_outputs/drawing_list_analysis/`

## What's in Research Folder

Research materials are kept separate from the Suite codebase for easy sharing with external tools like Bolt:

```
/workspaces/Research/
├── transmittal_builder/       # Root 3 Power transmittal implementation
│   ├── r3p_transmittal_builder.py (161KB)
│   ├── core/                  # Core modules
│   ├── utils/                 # Utilities
│   └── Transmittal Builder User Manual v2.0.docx
├── drawing_list/              # Drawing standards & examples
│   ├── R3P-SPEC-002-0.pdf    # Company standards
│   └── R3P-25074-E0-0001.xlsx # Example drawing index
└── standards/                 # (for generated standards JSON)
```

## How This Works

### 1. Agent Analysis (ZeroClaw/Koro)
The agent reads Research materials and generates:
- `drawing_list_manager.py` - Parse, validate, generate drawing numbers
- `transmittal_generator.py` - Create transmittals from drawing lists  
- `company_standards.json` - Extracted standards in structured format
- Documentation and integration guides

### 2. Sharing with Bolt
To send Research materials to Bolt for review/updates:

```bash
# Option 1: Archive and share
cd /workspaces
tar -czf research_materials.tar.gz Research/
# Send research_materials.tar.gz to Bolt

# Option 2: Share via Git
# Create a separate repo just for research if needed
# or commit to Suite and Bolt can fork/clone

# Option 3: Zip format
zip -r research_materials.zip Research/
```

### 3. Integration Back to Suite
Generated tools are placed in:
```
/workspaces/Suite/analysis_outputs/drawing_list_analysis/
├── drawing_list_manager.py
├── transmittal_generator.py
├── excel_to_python_bridge.py
├── company_standards.json
├── smart_drawing_list_template.xlsx
└── README.md
```

These can then be:
- Imported into Suite React components via API endpoints
- Used as CLI tools for manual processing
- Integrated into backend services
- Shared in releases/distributions

## Key Differences from Before

| Before | Now |
|--------|-----|
| Analysis files mixed with Suite code | Research materials in separate `/workspaces/Research/` |
| Hard to share with external tools | Easy to archive/share Research folder |
| Source materials scattered | Organized in Research folder structure |
| Agent couldn't write files to disk | ZeroClaw config updated with write permissions |
| Single analysis script | Expanded analysis with multiple tasks |

## Next Steps

### To Run Analysis (with Koro agent):
```bash
cd /workspaces/Suite
./run_drawing_list_analysis.sh
```

### To Share with Bolt:
1. Ensure Suite is committed:
   ```bash
   cd /workspaces/Suite
   git status  # Should be clean
   ```

2. Share the GitHub repo link:
   ```
   https://github.com/Koraji95-coder/Suite
   ```

3. Optionally, also share Research materials separately:
   ```bash
   tar -czf research.tar.gz /workspaces/Research/
   # Send research.tar.gz
   ```

### After Bolt Makes Updates:
1. Pull changes into Suite
2. Review generated code in `analysis_outputs/`
3. Integrate tools into React components
4. Test and deploy

## File Structure Summary

```
/workspaces/
├── Suite/                           # Main application
│   ├── src/                         # React/TypeScript source
│   ├── analysis_outputs/
│   │   └── drawing_list_analysis/   # Generated tools
│   ├── run_drawing_list_analysis.sh # Agent analysis script
│   └── setup_agent.sh               # Agent setup
│
└── Research/                        # ← NEW: Separate research materials
    ├── transmittal_builder/         # Source to analyze
    ├── drawing_list/                # Source to analyze
    └── README.md                    # This folder's purpose
```

## Agent Configuration (Koro)

- **Provider:** OpenAI (gpt-4-turbo)
- **Memory:** SQLite with vector search (auto-save enabled)
- **Style:** Technical & detailed (code-first explanations)
- **File Permissions:** Enabled for write operations

## Security Notes

- Both Suite and suite-agent repos are **private** on GitHub
- Research folder contains company standards (keep secure)
- Agent runs locally with workspace-scoped permissions
- All generated code should be reviewed before production use

## Questions?

Refer to:
- `/workspaces/Suite/AGENT_QUICK_START.md` - Agent commands
- `/workspaces/Suite/AGENT_CAPABILITIES.md` - What agent can do
- `/workspaces/Research/README.md` - Research folder details
