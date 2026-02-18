#!/bin/bash
# Generate Detailed Analysis Report + YAML Summary + Enhanced Docstrings

set -e

source "$HOME/.cargo/env"
cd /workspaces/Suite/zeroclaw-main

# The comprehensive analysis message
read -r -d '' ANALYSIS_MESSAGE << 'AGENT_EOF'
COMPREHENSIVE DRAWING STANDARDS ANALYSIS + ENHANCED DOCUMENTATION

📁 INPUT SOURCES:
- /workspaces/Research/drawing_list/R3P-SPEC-002-0 - Root 3 Power Drafting & Design Standard.pdf
- /workspaces/Research/drawing_list/R3P-25074-E0-0001 - DRAWING INDEX.xlsx
- /workspaces/Research/transmittal_builder/ (complete Python implementation)
- /workspaces/Suite/analysis_outputs/drawing_list_analysis/drawing_list_manager.py (existing tool)

📁 OUTPUT FOLDER:
/workspaces/Suite/analysis_outputs/drawing_list_analysis/

TASK 1: DETAILED ANALYSIS REPORT
Create file: ANALYSIS_REPORT.md

Structure:
# Drawing Standards Analysis Report
Generated: [timestamp]
Agent: Koro (ZeroClaw)

## Executive Summary
[High-level overview of what was analyzed]

## Source Materials Analyzed
1. R3P-SPEC-002-0 Standard
   - Key sections reviewed
   - Important requirements identified
   
2. Drawing Index (R3P-25074-E0-0001)
   - Format analysis
   - Patterns discovered
   
3. Transmittal Builder Code
   - Architecture review
   - Key functions identified

## Key Findings

### Drawing Number Standards
- Format: [explain the format]
- Components: [project-discipline-type-sequence revision]
- Validation rules discovered
- Examples from the standard

### Discipline Codes
[List all valid codes found]

### Drawing Types
[List all valid types found]

### Revision Standards
[How revisions work]

### Transmittal Requirements
[What's needed for valid transmittals]

## Implementation Details

### What Was Implemented
1. parse_drawing_number() function
   - Purpose: [explain]
   - Source: [which section of spec/manual]
   - Validation logic: [how it works]

2. generate_drawing_number() function
   - Purpose: [explain]
   - Source: [reference to spec]
   - Auto-increment logic: [how it works]

3. validate_drawing_list() function
   - Purpose: [explain]
   - Source: [which standard sections]
   - Checks performed: [list all validations]

4. [Continue for all major functions...]

### Validation Rules Implemented
[For each validation rule:]
- Rule: [describe]
- Source: [R3P-SPEC-002-0 section X.X or transmittal_builder.py line XXX]
- Implementation: [how it's checked in code]
- Example valid: [example]
- Example invalid: [example]

### Error Messages & Handling
[Document all error conditions and their sources]

## Compliance Matrix
| Requirement | Source | Implemented | Location in Code |
|------------|--------|-------------|------------------|
| Drawing number format | R3P-SPEC Section 3.1 | ✓ | parse_drawing_number(), line XX |
| [continue...]

## References
- R3P-SPEC-002-0: Root 3 Power Drafting & Design Standard
- NEC 2023 NFPA 70
- Transmittal Builder Manual
- [Any other sources used]

## Recommendations
[Suggestions for improvements, edge cases to handle, future enhancements]


TASK 2: YAML SUMMARY
Create file: standards_summary.yaml

Format:
---
metadata:
  generated_by: "Koro (ZeroClaw AI Agent)"
  generated_at: "[timestamp]"
  source_standard: "R3P-SPEC-002-0"
  nec_reference: "NEC 2023 NFPA 70"

drawing_number_format:
  pattern: "[PROJECT]-[DISC]-[TYPE]-[SEQ] [REV]"
  component_details:
    project:
      description: "Project number"
      format: "5 digits"
      example: "12345"
    discipline:
      description: "Engineering discipline"
      valid_codes:
        - code: "E"
          name: "Electrical"
        - code: "M"
          name: "Mechanical"
        # [include all found codes]
    drawing_type:
      description: "Type of drawing"
      valid_types:
        - code: "DET"
          name: "Details"
          description: "Typical detail sheets"
        # [include all types found]
    sequence:
      description: "Drawing sequence number"
      format: "3 digits, zero-padded"
      example: "001"
    revision:
      description: "Drawing revision"
      format: "Single letter A-Z"
      initial: "A"

validation_rules:
  - rule_id: "R001"
    description: "Drawing number must match regex pattern"
    regex: "[0-9]{5}-[A-Z]-[A-Z]{3}-[0-9]{3} [A-Z]"
    source: "R3P-SPEC-002-0 Section 3.1"
    severity: "error"
  - rule_id: "R002"
    description: "Title block must be present"
    source: "R3P-SPEC-002-0 Section 4.2"
    severity: "error"
  # [continue for all rules...]

required_fields:
  - field: "Drawing Number"
    mandatory: true
    source: "R3P-SPEC Section 2.1"
  - field: "Title"
    mandatory: true
    source: "R3P-SPEC Section 2.2"
  # [continue...]

transmittal_requirements:
  required_metadata:
    - "Project Number"
    - "Date"
    - "To/From"
    # [all required fields]
  format_options:
    - "PDF"
    - "Word"
    - "JSON"

implementation_notes:
  cli_commands:
    - command: "--parse"
      description: "Validate drawing number format"
      example: "drawing_list_manager.py --parse '12345-E-DET-001 A'"
    - command: "--generate"
      description: "Generate new drawing number"
      example: "drawing_list_manager.py --generate 12345 E DET 001"
    # [all commands documented]

error_codes:
  - code: "E001"
    message: "Invalid drawing number format"
    source: "Regex validation in parse_drawing_number()"
  # [all error codes]


TASK 3: ENHANCE PYTHON DOCSTRINGS
Update file: drawing_list_manager.py

For EACH function, add comprehensive docstrings:

Example format:
def parse_drawing_number(number: str) -> DrawingNumber:
    """
    Parse and validate an electrical drawing number according to R3P-SPEC-002-0.
    
    Drawing numbers must follow the format: [PROJECT]-[DISC]-[TYPE]-[SEQ] [REV]
    Example: 12345-E-DET-001 A
    
    Components:
        - PROJECT: 5-digit project identifier (e.g., 12345)
        - DISC: Single letter discipline code (E=Electrical, M=Mechanical, etc.)
        - TYPE: 3-letter drawing type (DET=Details, SPL=Single Line, etc.)
        - SEQ: 3-digit sequence number, zero-padded (001, 002, etc.)
        - REV: Single letter revision (A-Z, starting at A)
    
    Validation Rules Implemented:
        1. Format must match regex: ^[0-9]{5}-[A-Z]-[A-Z]{3}-[0-9]{3} [A-Z]$
           Source: R3P-SPEC-002-0 Section 3.1.2
        
        2. Discipline code must be valid per company standards
           Source: R3P-SPEC-002-0 Table 2: Discipline Codes
        
        3. Drawing type must be recognized
           Source: transmittal_builder.py DRAWING_TYPES constant
        
        4. Sequence number must be numeric and 3 digits
           Source: R3P-SPEC-002-0 Section 3.1.4
    
    Args:
        number (str): Drawing number string to parse and validate
            Example: "12345-E-DET-001 A"
    
    Returns:
        DrawingNumber: Dataclass containing parsed components
            - project: str (project code)
            - discipline: str (discipline code)
            - drawing_type: str (type code)
            - sequence: str (sequence number)
            - revision: str (revision letter)
            - valid: bool (whether validation passed)
            - errors: List[str] (validation errors if any)
    
    Raises:
        ValueError: If number format is completely invalid or None
    
    Examples:
        >>> result = parse_drawing_number("12345-E-DET-001 A")
        >>> print(result.valid)
        True
        >>> print(f"{result.project}-{result.discipline}")
        12345-E
        
        >>> result = parse_drawing_number("INVALID")
        >>> print(result.valid)
        False
        >>> print(result.errors)
        ['Invalid drawing number format']
    
    Notes:
        - Validation is based on R3P-SPEC-002-0 (Root 3 Power standard)
        - Implements NEC 2023 NFPA 70 requirement traceability
        - Used by validate_drawing_list() for bulk validation
    
    See Also:
        - generate_drawing_number(): Create new valid drawing numbers
        - validate_drawing_list(): Validate entire drawing lists
        - R3P-SPEC-002-0 Section 3: Drawing Number Standards
    """
    # [existing function code]


Apply this comprehensive docstring format to ALL functions:
- parse_drawing_number()
- generate_drawing_number()
- validate_drawing_list()
- auto_increment_sequence()
- format_for_export()
- And ALL other functions

For each docstring include:
1. Brief description (1-2 sentences)
2. Detailed explanation of what it does
3. Component breakdown (if applicable)
4. Validation rules with SOURCE REFERENCES
5. Args with types and examples
6. Returns with detailed structure
7. Raises (exceptions)
8. Examples (at least 2: valid and invalid cases)
9. Notes about standards compliance
10. See Also (related functions and spec sections)

Also add:
- Module-level docstring explaining the entire tool
- Class docstrings for any dataclasses
- Inline comments for complex logic blocks
- References to specific R3P-SPEC sections in comments where logic comes from


CRITICAL REQUIREMENTS:
1. For EVERY implementation detail, cite the SOURCE
   - "Source: R3P-SPEC-002-0 Section X.X"
   - "Source: transmittal_builder.py line XXX"
   - "Source: NEC 2023 Section XXX"

2. In ANALYSIS_REPORT.md, explicitly state:
   - What problem was found
   - What was implemented to fix it
   - Where the solution approach came from (spec section/code reference)

3. YAML must be valid, parseable YAML

4. All three files go in: /workspaces/Suite/analysis_outputs/drawing_list_analysis/

5. Use clear, technical language (as per Koro's communication style)

6. Be comprehensive - this is documentation for engineers

BEGIN ANALYSIS AND GENERATION NOW.
AGENT_EOF

echo "📊 Generating comprehensive analysis documentation..."
echo ""

./target/release/zeroclaw agent -m "$ANALYSIS_MESSAGE" | tee -a /workspaces/Suite/analysis_outputs/drawing_list_analysis/agent_generation_log.txt

echo ""
echo "✅ Analysis complete. Check output folder:"
echo "   /workspaces/Suite/analysis_outputs/drawing_list_analysis/"
echo ""
echo "Generated files:"
ls -lh /workspaces/Suite/analysis_outputs/drawing_list_analysis/
