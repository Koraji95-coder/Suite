#!/bin/bash
# Quick setup script for drawing list analysis

echo "🚀 Drawing List Analysis - Quick Setup"
echo "======================================"
echo ""

# Step 1: Verify folders exist
echo "✓ Step 1: Checking folder structure..."
mkdir -p /workspaces/Suite/analysis_outputs/{drawing_list_analysis,standards_learnings,automation_suggestions,generated_tools}
mkdir -p /workspaces/Suite/agent_work/my_projects
echo "  Folders ready!"
echo ""

# Step 2: Show what we're analyzing
echo "✓ Step 2: Files to analyze..."
echo "  Source folder: /workspaces/Suite/src/components/apps/drawinglist/"
echo "  Files found:"
find /workspaces/Suite/src/components/apps/drawinglist -type f -name "*.tsx" -o -name "*.ts" -o -name "*.pdf" | sed 's/^/    - /'
echo ""

# Step 3: Show output location
echo "✓ Step 3: Output will be saved to..."
echo "  /workspaces/Suite/analysis_outputs/drawing_list_analysis/"
echo ""

# Step 4: Instructions
echo "✓ Step 4: NEXT STEPS"
echo "  1. Copy the AGENT MESSAGE from DRAWING_LIST_ANALYSIS_COMMANDS.md"
echo "  2. Send it to the agent (via agentService.sendMessage)"
echo "  3. Agent will generate Python code + Excel template + docs"
echo "  4. Files appear in: /workspaces/Suite/analysis_outputs/drawing_list_analysis/"
echo "  5. Run: python3 analysis_outputs/drawing_list_analysis/drawing_list_manager.py --help"
echo ""

echo "📁 Folder structure ready! Run the agent message now..."
