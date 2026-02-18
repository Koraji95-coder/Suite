#!/usr/bin/env python3
"""
Drawing List Manager - Electrical Engineering Drawing Management System
Compliant with R3P-SPEC-002-0 (Root 3 Power Drafting & Design Standard)
NEC 2023 NFPA 70 Reference

Provides CLI and library interface for:
- Drawing number validation and generation
- Transmittal creation
- Excel drawing list processing
- Auto-numbering sequences
- Export to multiple formats
"""

import argparse
import csv
import json
import logging
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class DrawingNumber:
    """Represents a drawing number following R3P-SPEC-002-0 format"""
    project_code: str
    discipline_code: str
    sheet_type: str
    sequence_number: int
    revision: str = 'A'

    def __str__(self) -> str:
        """Format: PROJECT-DISCIPLINE-TYPE-SEQ REV"""
        return f"{self.project_code}-{self.discipline_code}-{self.sheet_type}-{self.sequence_number:03d} {self.revision}"

    def __repr__(self) -> str:
        return f"DrawingNumber({str(self)})"

    @property
    def full_number(self) -> str:
        """Returns complete drawing number with revision"""
        return str(self)

    def next_sequence(self) -> 'DrawingNumber':
        """Returns next drawing in sequence"""
        return DrawingNumber(
            project_code=self.project_code,
            discipline_code=self.discipline_code,
            sheet_type=self.sheet_type,
            sequence_number=self.sequence_number + 1,
            revision='A'
        )


@dataclass
class Drawing:
    """Complete drawing record"""
    number: DrawingNumber
    title: str
    description: str = ""
    status: str = "Draft"  # Draft, Issued, Released, Obsolete
    drawn_by: str = ""
    checked_by: str = ""
    approved_by: str = ""
    date_created: str = field(default_factory=lambda: datetime.now().isoformat())
    last_modified: str = field(default_factory=lambda: datetime.now().isoformat())
    sheets: int = 1
    scale: str = "As Noted"
    file_path: str = ""

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        d = asdict(self)
        d['number'] = str(self.number)
        return d

    def to_row(self) -> List:
        """Convert to CSV/Excel row"""
        return [
            str(self.number),
            self.title,
            self.description,
            self.status,
            self.drawn_by,
            self.checked_by,
            self.approved_by,
            self.date_created,
            self.sheets,
            self.scale,
            self.file_path
        ]


class DrawingListManager:
    """Main manager class for drawing list operations"""

    # Drawing standards from R3P-SPEC-002-0
    DISCIPLINE_CODES = {
        'E': 'Electrical',
        'C': 'Civil',
        'M': 'Mechanical',
        'A': 'Architectural',
        'S': 'Structural',
        'P': 'Plumbing',
        'HVAC': 'HVAC',
    }

    SHEET_TYPES = {
        'GEN': 'General',
        'DET': 'Details',
        'SCH': 'Schedules',
        'CAL': 'Calculations',
        'DIA': 'Diagrams',
        'PLC': 'Plans',
        'ELV': 'Elevations',
        'SEC': 'Sections',
        'DIM': 'Dimensions',
        'LOG': 'Logic Diagrams',
    }

    # Validation patterns
    DRAWING_NUMBER_PATTERN = re.compile(
        r'^([A-Z0-9]{3,5})-([A-Z0-9]{1,4})-([A-Z0-9]{3})-(\d{3})\s([A-Z0-9]+)$'
    )

    def __init__(self, project_code: str = "DEFAULT"):
        """Initialize manager for a project"""
        self.project_code = project_code
        self.drawings: Dict[str, Drawing] = {}
        self.sequences: Dict[Tuple, int] = {}  # Track sequences by (discipline, type)

    def parse_drawing_number(self, number_str: str) -> Optional[DrawingNumber]:
        """
        Parse and validate a drawing number string.
        Format: PROJECT-DISCIPLINE-TYPE-SEQ REV
        Example: 12345-E-DET-001 A

        Args:
            number_str: Drawing number string to parse

        Returns:
            DrawingNumber object if valid, None otherwise
        """
        match = self.DRAWING_NUMBER_PATTERN.match(number_str.strip())
        if not match:
            logger.warning(f"Invalid drawing number format: {number_str}")
            return None

        project, discipline, sheet_type, seq, revision = match.groups()

        if discipline not in self.DISCIPLINE_CODES:
            logger.warning(f"Unknown discipline code: {discipline}")
            return None

        if sheet_type not in self.SHEET_TYPES:
            logger.warning(f"Unknown sheet type: {sheet_type}")
            return None

        try:
            sequence = int(seq)
        except ValueError:
            logger.warning(f"Invalid sequence number: {seq}")
            return None

        return DrawingNumber(
            project_code=project,
            discipline_code=discipline,
            sheet_type=sheet_type,
            sequence_number=sequence,
            revision=revision
        )

    def generate_drawing_number(
        self,
        project: str,
        discipline: str,
        sheet_type: str,
        sequence: Optional[int] = None,
        revision: str = 'A'
    ) -> Optional[DrawingNumber]:
        """
        Generate a new drawing number.

        Args:
            project: Project code
            discipline: Discipline code (E, C, M, etc.)
            sheet_type: Sheet type (DET, SCH, etc.)
            sequence: Sequence number. If None, auto-increment from existing
            revision: Revision letter (default: A)

        Returns:
            DrawingNumber object or None if parameters invalid
        """
        if discipline not in self.DISCIPLINE_CODES:
            logger.error(f"Invalid discipline: {discipline}")
            return None

        if sheet_type not in self.SHEET_TYPES:
            logger.error(f"Invalid sheet type: {sheet_type}")
            return None

        if sequence is None:
            # Auto-increment from existing drawings
            sequence = self.get_next_sequence(discipline, sheet_type)

        return DrawingNumber(
            project_code=project,
            discipline_code=discipline,
            sheet_type=sheet_type,
            sequence_number=sequence,
            revision=revision
        )

    def get_next_sequence(self, discipline: str, sheet_type: str) -> int:
        """
        Get the next sequence number for a discipline/type combination.

        Args:
            discipline: Discipline code
            sheet_type: Sheet type code

        Returns:
            Next available sequence number
        """
        key = (discipline, sheet_type)
        existing = [
            d.number.sequence_number for d in self.drawings.values()
            if d.number.discipline_code == discipline and d.number.sheet_type == sheet_type
        ]

        if existing:
            return max(existing) + 1
        return 1

    def validate_drawing(self, drawing: Drawing) -> Tuple[bool, List[str]]:
        """
        Validate a drawing record.

        Args:
            drawing: Drawing object to validate

        Returns:
            (is_valid, list_of_error_messages)
        """
        errors = []

        if not drawing.number:
            errors.append("Drawing number is required")

        if not drawing.title or len(drawing.title.strip()) == 0:
            errors.append("Drawing title is required")

        if drawing.status not in ['Draft', 'Issued', 'Released', 'Obsolete']:
            errors.append(f"Invalid status: {drawing.status}")

        if drawing.sheets < 1:
            errors.append("Must have at least 1 sheet")

        return len(errors) == 0, errors

    def validate_drawing_list(self, file_path: str) -> Tuple[bool, Dict]:
        """
        Validate all drawings in a CSV/Excel file.

        Args:
            file_path: Path to drawing list CSV file

        Returns:
            (all_valid, {drawing_number: [errors]})
        """
        results = {}
        all_valid = True

        try:
            with open(file_path, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    drawing_num = row.get('Drawing Number', '')
                    is_valid, errors = self._validate_row(row)
                    if not is_valid:
                        results[drawing_num] = errors
                        all_valid = False
        except FileNotFoundError:
            logger.error(f"File not found: {file_path}")
            return False, {"file": ["File not found"]}

        return all_valid, results

    def _validate_row(self, row: Dict) -> Tuple[bool, List[str]]:
        """Validate a single row from CSV"""
        errors = []

        drawing_num = row.get('Drawing Number', '')
        if not self.parse_drawing_number(drawing_num):
            errors.append(f"Invalid drawing number: {drawing_num}")

        title = row.get('Title', '')
        if not title:
            errors.append("Missing title")

        return len(errors) == 0, errors

    def add_drawing(self, drawing: Drawing) -> bool:
        """
        Add a drawing to the list.

        Args:
            drawing: Drawing object

        Returns:
            True if added successfully
        """
        is_valid, errors = self.validate_drawing(drawing)
        if not is_valid:
            logger.error(f"Cannot add invalid drawing: {errors}")
            return False

        key = str(drawing.number)
        self.drawings[key] = drawing
        logger.info(f"Added drawing: {key}")
        return True

    def export_csv(self, output_path: str) -> bool:
        """
        Export drawing list to CSV.

        Args:
            output_path: Output file path

        Returns:
            True if successful
        """
        try:
            with open(output_path, 'w', newline='') as f:
                fieldnames = [
                    'Drawing Number', 'Title', 'Description', 'Status',
                    'Drawn By', 'Checked By', 'Approved By', 'Date Created',
                    'Sheets', 'Scale', 'File Path'
                ]
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()

                for drawing in sorted(self.drawings.values(), key=lambda d: str(d.number)):
                    row_dict = {
                        'Drawing Number': str(drawing.number),
                        'Title': drawing.title,
                        'Description': drawing.description,
                        'Status': drawing.status,
                        'Drawn By': drawing.drawn_by,
                        'Checked By': drawing.checked_by,
                        'Approved By': drawing.approved_by,
                        'Date Created': drawing.date_created,
                        'Sheets': drawing.sheets,
                        'Scale': drawing.scale,
                        'File Path': drawing.file_path,
                    }
                    writer.writerow(row_dict)

                logger.info(f"Exported {len(self.drawings)} drawings to {output_path}")
                return True

        except Exception as e:
            logger.error(f"Export failed: {e}")
            return False

    def export_json(self, output_path: str) -> bool:
        """Export drawing list to JSON"""
        try:
            data = {
                'project': self.project_code,
                'exported': datetime.now().isoformat(),
                'drawings': [d.to_dict() for d in self.drawings.values()]
            }
            with open(output_path, 'w') as f:
                json.dump(data, f, indent=2)
            logger.info(f"Exported to {output_path}")
            return True
        except Exception as e:
            logger.error(f"JSON export failed: {e}")
            return False

    def generate_report(self) -> str:
        """Generate summary report"""
        report = f"""
        ╔════════════════════════════════════════╗
        ║  DRAWING LIST REPORT                   ║
        ║  Project: {self.project_code:25} ║
        ║  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S'):23} ║
        ╚════════════════════════════════════════╝

        Total Drawings: {len(self.drawings)}

        By Status:
        """
        status_counts = {}
        for drawing in self.drawings.values():
            status_counts[drawing.status] = status_counts.get(drawing.status, 0) + 1

        for status, count in sorted(status_counts.items()):
            report += f"\n        - {status}: {count}"

        report += "\n\n        By Discipline:\n        "
        discipline_counts = {}
        for drawing in self.drawings.values():
            disc = drawing.number.discipline_code
            discipline_counts[disc] = discipline_counts.get(disc, 0) + 1

        for disc, count in sorted(discipline_counts.items()):
            name = self.DISCIPLINE_CODES.get(disc, 'Unknown')
            report += f"\n        - {disc} ({name}): {count}"

        return report


def main():
    """CLI interface"""
    parser = argparse.ArgumentParser(
        description='Drawing List Manager - R3P-SPEC-002-0 Compliant',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Parse drawing number
  %(prog)s --parse "12345-E-DET-001 A"

  # Generate new drawing number
  %(prog)s --generate 12345 E DET

  # Validate drawing list
  %(prog)s --validate /path/to/drawings.csv

  # Export to JSON
  %(prog)s --export-json /path/to/output.json
        """
    )

    parser.add_argument('--project', default='12345', help='Project code')
    parser.add_argument('--parse', metavar='NUMBER', help='Parse drawing number')
    parser.add_argument('--generate', nargs=3, metavar=('DISC', 'TYPE', 'SEQ'),
                       help='Generate drawing number')
    parser.add_argument('--validate', metavar='FILE', help='Validate CSV file')
    parser.add_argument('--export-csv', metavar='FILE', help='Export to CSV')
    parser.add_argument('--export-json', metavar='FILE', help='Export to JSON')
    parser.add_argument('--report', action='store_true', help='Show summary report')

    args = parser.parse_args()

    manager = DrawingListManager(args.project)

    if args.parse:
        result = manager.parse_drawing_number(args.parse)
        if result:
            print(f"✓ Valid: {result}")
        else:
            print(f"✗ Invalid drawing number")
            sys.exit(1)

    elif args.generate:
        discipline, sheet_type, seq = args.generate
        result = manager.generate_drawing_number(
            args.project, discipline, sheet_type, int(seq)
        )
        if result:
            print(f"✓ Generated: {result}")
        else:
            print(f"✗ Failed to generate drawing number")
            sys.exit(1)

    elif args.validate:
        valid, errors = manager.validate_drawing_list(args.validate)
        if valid:
            print(f"✓ All drawings valid")
        else:
            print(f"✗ Validation errors found:")
            for key, errs in errors.items():
                print(f"  {key}: {', '.join(errs)}")
            sys.exit(1)

    elif args.report:
        print(manager.generate_report())

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
