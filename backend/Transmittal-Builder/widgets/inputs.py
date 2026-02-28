"""
Drag & Drop Input Widgets

Provides enhanced input widgets that accept drag-and-drop files/folders.
"""

from __future__ import annotations
import os
import re
from typing import Iterable, Optional
from PyQt6.QtWidgets import QLineEdit
from PyQt6.QtCore import Qt


class DropLineEdit(QLineEdit):
    """
    QLineEdit that accepts file/folder drops.
    
    Features:
    - Drag & drop files or folders
    - File pattern filtering (e.g., *.pdf, *.png)
    - Visual feedback on drag enter/leave
    - Mode: 'file' or 'dir'
    """
    
    def __init__(
        self,
        mode: str = "file",
        patterns: Optional[Iterable[str]] = None,
        *args,
        **kwargs
    ):
        """
        Initialize DropLineEdit.
        
        Args:
            mode: 'file' or 'dir' - what to accept
            patterns: File patterns to accept (e.g., ['*.pdf', '*.png'])
            *args, **kwargs: Passed to QLineEdit
        """
        super().__init__(*args, **kwargs)
        self._mode = mode  # "file" | "dir"
        self._patterns = set(p.lower() for p in patterns) if patterns else None
        self._original_stylesheet = ""
        self.setAcceptDrops(True)
        
        # Update placeholder to indicate drag-drop support
        if not self.placeholderText():
            if mode == "file":
                self.setPlaceholderText("Browse or drag & drop file here...")
            else:
                self.setPlaceholderText("Browse or drag & drop folder here...")
    
    def dragEnterEvent(self, e):
        """Handle drag enter - show visual feedback."""
        if e.mimeData().hasUrls():
            e.acceptProposedAction()
            # Visual feedback: blue dashed border
            self._original_stylesheet = self.styleSheet()
            self.setStyleSheet(
                self.styleSheet() + "; border: 2px dashed #185FAC; background: rgba(24, 95, 172, 0.1);"
            )
        else:
            e.ignore()
    
    def dragLeaveEvent(self, e):
        """Handle drag leave - remove visual feedback."""
        # Restore original stylesheet
        self.setStyleSheet(self._original_stylesheet)
    
    def dropEvent(self, e):
        """Handle drop - set file/folder path."""
        # Remove visual feedback
        self.setStyleSheet(self._original_stylesheet)
        
        urls = e.mimeData().urls()
        if not urls:
            return
        
        # Get first file/folder path
        p = urls[0].toLocalFile()
        
        if self._mode == "dir" and os.path.isdir(p):
            # Directory mode - accept folders
            self.setText(p)
        elif self._mode == "file" and os.path.isfile(p):
            # File mode - check pattern if specified
            if self._patterns:
                # Check if file matches any pattern
                ok = any(
                    p.lower().endswith(suf.replace("*", "").lower())
                    for suf in self._patterns
                )
                if not ok:
                    # File doesn't match pattern - ignore
                    return
            self.setText(p)
    
    def wheelEvent(self, event):
        """Ignore wheel events (prevent accidental scrolling)."""
        event.ignore()


class ValidatedLineEdit(DropLineEdit):
    """
    DropLineEdit with built-in validation.
    
    Shows red border if validation fails.
    """
    
    def __init__(
        self,
        validator_func=None,
        error_message: str = "Invalid input",
        *args,
        **kwargs
    ):
        """
        Initialize ValidatedLineEdit.
        
        Args:
            validator_func: Function that takes text and returns bool
            error_message: Tooltip to show on validation error
            *args, **kwargs: Passed to DropLineEdit
        """
        super().__init__(*args, **kwargs)
        self._validator_func = validator_func
        self._error_message = error_message
        self._is_valid = True
        
        if validator_func:
            self.textChanged.connect(self._validate)
    
    def _validate(self):
        """Validate current text."""
        if not self._validator_func:
            return
        
        text = self.text().strip()
        is_valid = self._validator_func(text)
        
        if is_valid != self._is_valid:
            self._is_valid = is_valid
            self._update_style()
    
    def _update_style(self):
        """Update style based on validation state."""
        if self._is_valid:
            # Remove error styling
            self.setStyleSheet(
                re.sub(r"border:\s*2px\s*solid\s*#FF5A6E;?", "", self.styleSheet())
            )
            self.setToolTip("")
        else:
            # Add error styling
            if "border: 2px solid #FF5A6E" not in self.styleSheet():
                self.setStyleSheet(
                    self.styleSheet() + "; border: 2px solid #FF5A6E;"
                )
            self.setToolTip(self._error_message)
    
    def is_valid(self) -> bool:
        """Check if current value is valid."""
        return self._is_valid
    
    def validate_now(self):
        """Force validation now."""
        self._validate()

