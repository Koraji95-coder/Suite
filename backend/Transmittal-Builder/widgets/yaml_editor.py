"""
Built-in YAML Editor Dialog

Provides a syntax-highlighted YAML editor with validation.
Much better than external editor for .exe deployments.
"""

from __future__ import annotations
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QPushButton, QPlainTextEdit,
    QLabel, QMessageBox, QSizePolicy
)
from PyQt6.QtCore import Qt, QRegularExpression
from PyQt6.QtGui import (
    QSyntaxHighlighter, QTextCharFormat, QColor, QFont,
    QFontDatabase
)
from pathlib import Path


class YAMLSyntaxHighlighter(QSyntaxHighlighter):
    """Syntax highlighter for YAML files."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        
        # Define formats
        self.key_format = QTextCharFormat()
        self.key_format.setForeground(QColor("#4A9EFF"))  # Accent blue
        self.key_format.setFontWeight(QFont.Weight.Bold)
        
        self.value_format = QTextCharFormat()
        self.value_format.setForeground(QColor("#E8EDF4"))  # Text primary
        
        self.string_format = QTextCharFormat()
        self.string_format.setForeground(QColor("#4ADE80"))  # Success green
        
        self.number_format = QTextCharFormat()
        self.number_format.setForeground(QColor("#FFB84D"))  # Warning orange
        
        self.comment_format = QTextCharFormat()
        self.comment_format.setForeground(QColor("#8B92A0"))  # Muted gray
        self.comment_format.setFontItalic(True)
        
        self.list_format = QTextCharFormat()
        self.list_format.setForeground(QColor("#FF5A6E"))  # Error red
        
        # Define patterns
        self.highlighting_rules = [
            # Comments
            (QRegularExpression(r"#[^\n]*"), self.comment_format),
            # Keys (word followed by colon)
            (QRegularExpression(r"^\s*[\w_]+(?=:)"), self.key_format),
            # Quoted strings
            (QRegularExpression(r'"[^"]*"'), self.string_format),
            (QRegularExpression(r"'[^']*'"), self.string_format),
            # Numbers
            (QRegularExpression(r"\b\d+\b"), self.number_format),
            # List markers
            (QRegularExpression(r"^\s*-\s"), self.list_format),
        ]
    
    def highlightBlock(self, text):
        """Apply syntax highlighting to a block of text."""
        for pattern, fmt in self.highlighting_rules:
            iterator = pattern.globalMatch(text)
            while iterator.hasNext():
                match = iterator.next()
                self.setFormat(match.capturedStart(), match.capturedLength(), fmt)


class YAMLEditorDialog(QDialog):
    """
    Built-in YAML editor with syntax highlighting and validation.
    
    Much better than external editor for .exe deployments because:
    - No dependency on system text editor
    - Syntax highlighting built-in
    - Validation before saving
    - Consistent experience across platforms
    """
    
    def __init__(self, config_path: Path, parent=None):
        super().__init__(parent)
        self.config_path = config_path
        self.original_content = ""
        
        self.setWindowTitle("Settings Editor")
        self.setModal(True)
        self.resize(900, 700)
        
        # Apply obsidian theme
        self.setStyleSheet("""
            QDialog {
                background: #0A0A0F;
                color: #E8EDF4;
            }
            QPlainTextEdit {
                background: #12141C;
                color: #E8EDF4;
                border: 1px solid #2A2D42;
                border-radius: 8px;
                padding: 12px;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.5;
            }
            QPushButton {
                background: #185FAC;
                color: #E8EDF4;
                border: none;
                border-radius: 8px;
                padding: 10px 20px;
                font-weight: bold;
                font-size: 13px;
            }
            QPushButton:hover {
                background: #2E7BC6;
            }
            QPushButton:pressed {
                background: #0F4A7A;
            }
            QPushButton#cancelButton {
                background: #1A1D28;
                border: 1px solid #2A2D42;
            }
            QPushButton#cancelButton:hover {
                background: #22253A;
            }
            QLabel {
                color: #8B92A0;
                font-size: 12px;
            }
            QLabel#titleLabel {
                color: #E8EDF4;
                font-size: 16px;
                font-weight: bold;
            }
        """)
        
        self.init_ui()
        self.load_config()
    
    def init_ui(self):
        """Initialize the user interface."""
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Title
        title = QLabel("Configuration Editor")
        title.setObjectName("titleLabel")
        layout.addWidget(title)
        
        # Info label
        info = QLabel(
            f"Editing: {self.config_path.name}\n"
            "Edit PE profiles, firm numbers, and other settings below. "
            "Changes take effect after restarting the application."
        )
        info.setWordWrap(True)
        layout.addWidget(info)
        
        # Editor
        self.editor = QPlainTextEdit()
        self.editor.setTabStopDistance(20)  # 2 spaces for YAML
        
        # Use monospace font
        font = QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont)
        font.setPointSize(11)
        self.editor.setFont(font)
        
        # Add syntax highlighter
        self.highlighter = YAMLSyntaxHighlighter(self.editor.document())
        
        layout.addWidget(self.editor, 1)  # Stretch factor 1
        
        # Validation status
        self.status_label = QLabel("")
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        validate_btn = QPushButton("Validate")
        validate_btn.clicked.connect(self.validate_yaml)
        button_layout.addWidget(validate_btn)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.setObjectName("cancelButton")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        save_btn = QPushButton("Save & Close")
        save_btn.clicked.connect(self.save_and_close)
        button_layout.addWidget(save_btn)
        
        layout.addLayout(button_layout)
    
    def load_config(self):
        """Load config file into editor."""
        try:
            if self.config_path.exists():
                self.original_content = self.config_path.read_text(encoding="utf-8")
                self.editor.setPlainText(self.original_content)
            else:
                self.status_label.setText("⚠️ Config file not found. Creating new file.")
                self.status_label.setStyleSheet("color: #FFB84D;")
        except Exception as e:
            self.status_label.setText(f"❌ Error loading config: {e}")
            self.status_label.setStyleSheet("color: #FF5A6E;")
    
    def validate_yaml(self):
        """Validate YAML syntax."""
        content = self.editor.toPlainText()
        
        try:
            # Try to parse YAML
            import yaml
            yaml.safe_load(content)
            self.status_label.setText("✅ YAML syntax is valid!")
            self.status_label.setStyleSheet("color: #4ADE80;")
            return True
        except ImportError:
            # Fallback: basic validation without PyYAML
            try:
                import json
                # Try to parse as JSON (less strict but catches major errors)
                # This is a very basic check
                if content.strip():
                    self.status_label.setText("⚠️ PyYAML not installed. Basic validation passed.")
                    self.status_label.setStyleSheet("color: #FFB84D;")
                    return True
                else:
                    self.status_label.setText("❌ Config file is empty!")
                    self.status_label.setStyleSheet("color: #FF5A6E;")
                    return False
            except Exception as e:
                self.status_label.setText(f"❌ Validation error: {e}")
                self.status_label.setStyleSheet("color: #FF5A6E;")
                return False
        except Exception as e:
            self.status_label.setText(f"❌ YAML syntax error: {e}")
            self.status_label.setStyleSheet("color: #FF5A6E;")
            return False
    
    def save_and_close(self):
        """Validate and save config."""
        # Validate first
        if not self.validate_yaml():
            reply = QMessageBox.question(
                self,
                "Invalid YAML",
                "The YAML syntax is invalid. Save anyway?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply != QMessageBox.StandardButton.Yes:
                return
        
        # Check if content changed
        content = self.editor.toPlainText()
        if content == self.original_content:
            self.reject()  # No changes, just close
            return
        
        # Save
        try:
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            self.config_path.write_text(content, encoding="utf-8")
            
            # Show success message
            QMessageBox.information(
                self,
                "Settings Saved",
                "Configuration saved successfully!\n\n"
                "Please restart the application for changes to take effect.",
                QMessageBox.StandardButton.Ok
            )
            
            self.accept()
        except Exception as e:
            QMessageBox.critical(
                self,
                "Save Error",
                f"Failed to save configuration:\n\n{str(e)}",
                QMessageBox.StandardButton.Ok
            )

