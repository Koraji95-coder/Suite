#!/bin/bash
# Run Drawing List + Transmittal Builder Analysis

set -e

source "$HOME/.cargo/env"
cd /workspaces/Suite/zeroclaw-main

# The analysis message
read -r -d '' ANALYSIS_MESSAGE << 'AGENT_EOF'
ANALYZE DRAWING LIST + TRANSMITTAL BUILDER + GENERATE PYTHON CODE:

📁 SOURCE FOLDERS (in /workspaces/Research/):
- /workspaces/Research/drawing_list/ (R3P standards PDF, drawing index)
- /workspaces/Research/transmittal_builder/ (transmittal Python code, docs)

📁 OUTPUT FOLDER:
/workspaces/Suite/analysis_outputs/drawing_list_analysis/

TASK 1: ANALYZE RESEARCH MATERIALS
- Read R3P-SPEC-002-0 PDF from /workspaces/Research/drawing_list/
- Review R3P-25074-E0-0001 drawing index Excel
- Analyze transmittal_builder.py and supporting Python code from /workspaces/Research/transmittal_builder/
- Review Transmittal Builder User Manual
- Extract drawing/transmittal standards, formats, and best practices

TASK 2: GENERATE COMPREHENSIVE DRAWING LIST MANAGER
Create file: drawing_list_manager.py
Functions:
  1. parse_drawing_number(number) → validates format, extracts components
  2. generate_drawing_number(project, discipline, type, sequence) → creates valid number
  3. validate_drawing_list(excel_path) → checks all drawings match standards
  4. extract_from_pdf(pdf_path) → reads drawing info from PDF titleblocks
  5. auto_increment_sequence(project, discipline, type) → finds next number
  6. format_for_export(drawing_list) → formats for different outputs
  7. generate_transmittal(drawing_list, template_path) → creates transmittal
  
Features:
  - Input: Excel spreadsheet or CSV
  - Output: validated drawing list, JSON report, formatted tables
  - Error handling: flag inconsistent numbers, missing fields
  - CLI interface with --help, --validate, --generate, --export, --transmittal
  - Logging of all operations
  - Type hints throughout
  - Docstrings for all functions
  - Error messages are clear and actionable
  - Can run standalone or import as module

TASK 3: ANALYZE TRANSMITTAL BUILDER
- Study existing transmittal_builder.py implementation
- Extract key features, document structure, email patterns
- Identify improvements for Suite integration
- Document current API and data flow

TASK 4: CREATE INTEGRATED TRANSMITTAL MODULE
Create file: transmittal_generator.py
Based on analysis, create optimized version for Suite that:
  - Generates transmittals from drawing lists
  - Exports to PDF, Word, or JSON
  - Integrates with drawing_list_manager.py
  - Supports email automation (if applicable)
  - Has clear CLI and library interfaces

TASK 5: CREATE SMART EXCEL TEMPLATE
Create file: smart_drawing_list_template.xlsx
Features:
  - Dropdowns for Discipline and Type (from R3P standards)
  - Auto-numbering (uses drawing_list_manager.py logic)
  - Transmittal integration columns
  - Data validation
  - Formatting (colors by status)
  - Instructions sheet
  - Example data
  - Ready to use immediately

TASK 6: GENERATE EXCEL INTEGRATION
Create file: excel_to_python_bridge.py
Allows:
  - Read Excel → validate with drawing_list_manager.py
  - Generate next number → populate in Excel
  - Export drawing list to transmittal
  - Export to different formats
  - Works with openpyxl (standard library)

TASK 7: CREATE COMPREHENSIVE DOCUMENTATION
Create file: README.md
Include:
  - How to use drawing_list_manager.py
  - How to use transmittal_generator.py
  - CLI examples for both tools
  - Python import examples
  - Integration with Excel templates
  - Configuration options
  - Troubleshooting

TASK 8: CREATE IMPLEMENTATION GUIDE
Create file: integration_guide.md
Include:
  - How to integrate into Suite app (React components)
  - Database schema (if needed)
  - API endpoints needed
  - Step-by-step integration
  - Links between drawing list and transmittal workflows
  - Data flow diagrams

TASK 9: EXTRACT STANDARDS
Create file: company_standards.json
Content from R3P analysis:
  {
    "company_name": "Root 3 Power",
    "spec_version": "R3P-SPEC-002-0",
    "drawing_number_format": "PROJECT-DISCIPLINE-TYPE-SEQ REV",
    "discipline_codes": {...},
    "sheet_types": {...},
    "transmittal_fields": [...],
    "required_fields": [...],
    "validation_rules": [...],
    "examples": [...]
  }


OUTPUT REQUIREMENTS:
- All Python files must be runnable immediately with python3
- Include all necessary imports from standard library
- No external dependencies except: openpyxl (for Excel), json, csv, logging
- Each file has detailed module docstring explaining purpose
- All functions have docstrings with Args, Returns, Examples
- CLI tools have --help documented
- Code is formatted and commented
- Type hints throughout (Python 3.9+)
- PEP 8 compliant
- Save ALL files to: /workspaces/Suite/analysis_outputs/drawing_list_analysis/

RESEARCH FOLDER CONTENTS:
/workspaces/Research/drawing_list/ contains:
  - R3P-SPEC-002-0 PDF (company drafting standard)
  - R3P-25074-E0-0001 drawing index Excel
  
/workspaces/Research/transmittal_builder/ contains:
  - r3p_transmittal_builder.py (existing implementation)
  - Transmittal Builder User Manual v2.0.docx
  - Config files, assets, and utilities

Analyze all of these to generate comprehensive,  production-ready tooling for Suite.

BEGIN ANALYSIS!
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
