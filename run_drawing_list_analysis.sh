#!/bin/bash
# Run Drawing List Analysis

set -e

source "$HOME/.cargo/env"
cd /workspaces/Suite/zeroclaw-main

# The analysis message
read -r -d '' ANALYSIS_MESSAGE << 'AGENT_EOF'
ANALYZE DRAWING LIST + GENERATE PYTHON CODE:

📁 SOURCE FOLDERS:
- /workspaces/Suite/src/components/apps/drawinglist/
- /workspaces/Suite/src/components/apps/drawinglist/R3P-SPEC-002-0 - Root 3 Power Drafting & Design Standard.pdf

📁 OUTPUT FOLDER:
/workspaces/Suite/analysis_outputs/drawing_list_analysis/

TASK 1: UNDERSTAND CURRENT SYSTEM
- Read all files in drawinglist folder
- Understand current code structure
- Extract drawing number format from R3P-SPEC PDF
- Document company standards found

TASK 2: GENERATE PYTHON TOOL
Create file: drawing_list_manager.py
This tool should:
  
  Functions:
  1. parse_drawing_number(number) → validates format, extracts components
  2. generate_drawing_number(project, discipline, type, sequence) → creates valid number
  3. validate_drawing_list(excel_path) → checks all drawings match standards
  4. extract_from_pdf(pdf_path) → reads drawing info from PDF titleblocks
  5. generate_transmittal(drawing_list, template_path) → creates transmittal
  6. auto_increment_sequence(project, discipline, type) → finds next number
  7. format_for_export(drawing_list) → formats for different outputs
  
  Features:
  - Input: Excel spreadsheet or CSV
  - Output: validated drawing list, JSON report, formatted tables
  - Error handling: flag inconsistent numbers, missing fields
  - CLI interface with --help, --validate, --generate, --export
  - Logging of all operations
  
  Code quality:
  - Type hints throughout
  - Docstrings for all functions
  - Error messages are clear and actionable
  - Can run standalone or import as module

TASK 3: CREATE SMART EXCEL TEMPLATE
Create file: smart_drawing_list_template.xlsx
Features:
  - Dropdowns for Discipline and Type
  - Auto-numbering (uses drawing_list_manager.py logic)
  - Data validation
  - Formatting (colors by status)
  - Instructions sheet
  - Example data
  - Ready to use immediately

TASK 4: GENERATE EXCEL INTEGRATION
Create file: excel_to_python_bridge.py
Allows:
  - Read Excel → validate with drawing_list_manager.py
  - Generate next number → populate in Excel
  - Export to different formats
  - Works with openpyxl (standard library)

TASK 5: CREATE DOCUMENTATION
Create file: README.md
Include:
  - How to use drawing_list_manager.py
  - CLI examples
  - Python import examples
  - Configuration options
  - Troubleshooting

TASK 6: CREATE IMPLEMENTATION GUIDE
Create file: integration_guide.md
Include:
  - How to integrate into Suite app
  - Database schema (if needed)
  - React component patterns
  - API endpoints needed
  - Step-by-step implementation

TASK 7: EXTRACT STANDARDS
Create file: company_standards.json
Content:
  {
    "drawing_number_format": "...",
    "discipline_codes": {...},
    "sheet_types": {...},
    "required_fields": [...],
    "validation_rules": [...],
    "examples": [...]
  }

OUTPUT REQUIREMENTS:
- All Python files must be runnable immediately
- Include all necessary imports
- No external dependencies except standard library + openpyxl
- Each file has docstring explaining purpose
- CLI tools have --help documented
- Code is formatted and commented
- Save ALL files to: /workspaces/Suite/analysis_outputs/drawing_list_analysis/

FORMAT: Python 3.9+, type hints, PEP 8 compliant

GO!
AGENT_EOF

echo "🔍 Sending Drawing List Analysis to Agent..."
echo ""

./target/release/zeroclaw agent -m "$ANALYSIS_MESSAGE"

echo ""
echo "✅ Analysis complete!"
echo ""
echo "📁 Check results:"
echo "   ls -la /workspaces/Suite/analysis_outputs/drawing_list_analysis/"
echo ""
