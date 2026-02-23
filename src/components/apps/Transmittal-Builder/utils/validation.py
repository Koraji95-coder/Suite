"""
Live Validation Helpers

Provides utilities for validating form fields in real-time.
"""

from __future__ import annotations
import re
from typing import Callable, Iterable, List
from PyQt6.QtWidgets import QWidget, QPushButton, QLineEdit, QTextEdit
from PyQt6.QtCore import QTimer


def _mark_invalid(w: QWidget, why: str):
    """Mark widget as invalid with red border and tooltip."""
    current_style = w.styleSheet()
    if "border: 2px solid #FF5A6E" not in current_style:
        w.setStyleSheet(current_style + " ; border: 2px solid #FF5A6E;")
    w.setToolTip(why)


def _mark_valid(w: QWidget):
    """Remove invalid styling from widget."""
    # Remove only our red border; keep theme intact
    w.setStyleSheet(re.sub(r"border:\s*2px\s*solid\s*#FF5A6E;?", "", w.styleSheet()))
    w.setToolTip("")


def attach_line_validator(
    le: QLineEdit,
    predicate: Callable[[str], bool],
    why: str,
    on_change: Callable[[], None],
    *,
    is_visual: Callable[[], bool] = lambda: True,
    debounce_ms: int = 500
):
    """
    Attach validator to QLineEdit with debouncing.

    Args:
        le: QLineEdit to validate
        predicate: Function that takes text and returns True if valid
        why: Error message to show in tooltip
        on_change: Callback to run after validation
        is_visual: Function that returns True if visual feedback should be shown
        debounce_ms: Milliseconds to wait after typing stops before validating

    Returns:
        Function to re-run validation and repaint
    """
    timer = QTimer()
    timer.setSingleShot(True)
    timer.setInterval(debounce_ms)

    def run():
        txt = le.text().strip()
        ok = predicate(txt)
        if is_visual():
            _mark_valid(le) if ok else _mark_invalid(le, why)
        else:
            _mark_valid(le)  # Keep neutral before reveal
        on_change()
        return ok

    timer.timeout.connect(run)
    le.textChanged.connect(lambda _: timer.start())

    # Initial validation (no debounce)
    run()
    return run  # Return function for re-running validation


def attach_text_validator(
    te: QTextEdit,
    predicate: Callable[[str], bool],
    why: str,
    on_change: Callable[[], None],
    *,
    is_visual: Callable[[], bool] = lambda: True,
    debounce_ms: int = 500
):
    """
    Attach validator to QTextEdit with debouncing.

    Args:
        te: QTextEdit to validate
        predicate: Function that takes text and returns True if valid
        why: Error message to show in tooltip
        on_change: Callback to run after validation
        is_visual: Function that returns True if visual feedback should be shown
        debounce_ms: Milliseconds to wait after typing stops before validating

    Returns:
        Function to re-run validation and repaint
    """
    timer = QTimer()
    timer.setSingleShot(True)
    timer.setInterval(debounce_ms)

    def run():
        txt = te.toPlainText().strip()
        ok = predicate(txt)
        if is_visual():
            _mark_valid(te) if ok else _mark_invalid(te, why)
        else:
            _mark_valid(te)  # Keep neutral before reveal
        on_change()
        return ok

    timer.timeout.connect(run)
    te.textChanged.connect(lambda: timer.start())

    # Initial validation (no debounce)
    run()
    return run  # Return function for re-running validation


def enable_when(validators: Iterable[Callable[[], bool]], button: QPushButton):
    """
    Enable button only when all validators return True.
    
    Args:
        validators: List of functions that return True if valid
        button: Button to enable/disable
    
    Returns:
        Function to call to recompute button state
    """
    def recompute():
        ok = all(v() for v in validators)
        button.setEnabled(ok)
    
    return recompute


# ---- Common Validators ----

def is_valid_email(email: str) -> bool:
    """Check if email is valid format."""
    if not email:
        return True  # Empty is OK (optional field)
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def is_not_empty(text: str) -> bool:
    """Check if text is not empty."""
    return bool(text.strip())


def is_valid_phone(phone: str) -> bool:
    """Check if phone number is valid format."""
    if not phone:
        return True  # Empty is OK (optional field)
    # Allow various formats: (555) 123-4567, 555-123-4567, 5551234567
    pattern = r'^[\d\s\-\(\)]+$'
    return bool(re.match(pattern, phone))


def min_length(min_len: int) -> Callable[[str], bool]:
    """Create validator for minimum length."""
    def validator(text: str) -> bool:
        return len(text.strip()) >= min_len
    return validator


def max_length(max_len: int) -> Callable[[str], bool]:
    """Create validator for maximum length."""
    def validator(text: str) -> bool:
        return len(text.strip()) <= max_len
    return validator


def matches_pattern(pattern: str) -> Callable[[str], bool]:
    """Create validator for regex pattern."""
    compiled = re.compile(pattern)
    def validator(text: str) -> bool:
        if not text:
            return True  # Empty is OK
        return bool(compiled.match(text))
    return validator


class ValidationGroup:
    """
    Group of validators that can be checked together.
    
    Usage:
        group = ValidationGroup()
        group.add(lambda: email_field.text(), is_valid_email, "Invalid email")
        group.add(lambda: name_field.text(), is_not_empty, "Name required")
        
        if group.is_valid():
            # All fields valid
            pass
    """
    
    def __init__(self):
        self.validators: List[Callable[[], bool]] = []
    
    def add(
        self,
        getter: Callable[[], str],
        predicate: Callable[[str], bool],
        error_msg: str
    ):
        """Add a validator to the group."""
        def validator():
            value = getter()
            return predicate(value)
        
        self.validators.append(validator)
    
    def is_valid(self) -> bool:
        """Check if all validators pass."""
        return all(v() for v in self.validators)
    
    def get_errors(self) -> List[str]:
        """Get list of validation errors."""
        errors = []
        for v in self.validators:
            if not v():
                errors.append("Validation failed")
        return errors

