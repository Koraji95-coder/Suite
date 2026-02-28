"""
Configuration System for Root3Power Transmittal Builder

Handles:
- YAML configuration files (user-editable)
- Environment variables (.env files)
- Cross-platform config directories
- Email credentials management
"""

from __future__ import annotations
import os
import sys
import json
from dataclasses import dataclass
from typing import Dict, Any, Optional, List
from pathlib import Path


def _user_config_dir(app_name: str) -> Path:
    """Get platform-specific user config directory."""
    if os.name == "nt":  # Windows
        base = os.getenv("APPDATA") or (Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":  # macOS
        base = Path.home() / "Library" / "Application Support"
    else:  # Linux/Unix
        base = Path(os.getenv("XDG_CONFIG_HOME") or (Path.home() / ".config"))
    
    p = Path(base) / app_name.replace(" ", "")
    p.mkdir(parents=True, exist_ok=True)
    return p


def _read_text(p: Path) -> str:
    """Safely read text file."""
    return p.read_text(encoding="utf-8") if p.exists() else ""


def _write_text(p: Path, s: str) -> None:
    """Safely write text file."""
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def _load_dotenv_file(p: Path) -> Dict[str, str]:
    """Load .env file into dictionary."""
    env: Dict[str, str] = {}
    if not p.exists():
        return env
    
    for line in p.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    
    return env


def _merge_dicts(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    """Deep merge two dictionaries."""
    out = dict(a)
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge_dicts(out[k], v)
        else:
            out[k] = v
    return out


def _yaml_load(s: str) -> Dict[str, Any]:
    """
    Load YAML string into dictionary.
    Uses PyYAML if available, otherwise falls back to simple parser.
    """
    if not s.strip():
        return {}
    
    # Try PyYAML first
    try:
        import yaml
        return yaml.safe_load(s) or {}
    except ImportError:
        pass
    
    # Try JSON (valid YAML subset)
    try:
        return json.loads(s)
    except Exception:
        pass
    
    # Fallback: Simple YAML parser (handles basic key-value pairs and lists)
    data: Dict[str, Any] = {}
    stack: List[tuple[int, Any]] = [(-1, data)]
    current_key = None
    
    for raw in s.splitlines():
        if not raw.strip() or raw.strip().startswith("#"):
            continue
        
        indent = len(raw) - len(raw.lstrip(" "))
        content = raw.strip()
        
        # Pop stack to correct level
        while stack and indent <= stack[-1][0]:
            stack.pop()
        
        parent = stack[-1][1]
        
        # List item
        if content.startswith("- "):
            val = content[2:].strip().strip('"').strip("'")
            if isinstance(parent, list):
                parent.append(val)
            elif isinstance(parent, dict) and current_key:
                if not isinstance(parent.get(current_key), list):
                    parent[current_key] = []
                parent[current_key].append(val)
            continue
        
        # Key-value pair
        if ":" in content:
            k, v = content.split(":", 1)
            k = k.strip()
            v = v.strip()
            current_key = k
            
            if v == "":
                # Empty value = nested dict or list
                child: Any = {}
                if isinstance(parent, dict):
                    parent[k] = child
                stack.append((indent, child))
            else:
                # Value present
                if isinstance(parent, dict):
                    # Try to parse as number or boolean
                    if v.lower() == "true":
                        parent[k] = True
                    elif v.lower() == "false":
                        parent[k] = False
                    elif v.isdigit():
                        parent[k] = int(v)
                    else:
                        try:
                            parent[k] = float(v)
                        except ValueError:
                            parent[k] = v.strip('"').strip("'")
    
    return data


@dataclass
class MailCreds:
    """Email credentials."""
    sender: str
    app_password: str
    default_receiver: str


class ConfigManager:
    """
    Manages application configuration.
    
    Loads configuration from:
    1. Default config (shipped with app)
    2. User config (editable by user)
    3. Environment variables (.env file)
    """
    
    def __init__(self, app_name: str = "Root3PowerTransmittal"):
        self.app_name = app_name

        # Determine exe directory
        if getattr(sys, "frozen", False):
            self.exe_dir = Path(sys.executable).parent
        else:
            self.exe_dir = Path.cwd()

        # Use project directory for user config (easier for shipping)
        self.user_dir = self.exe_dir
        self.user_cfg = self.user_dir / "config.yaml"

        # No separate default config - use the main config file
        self.default_cfg = self.user_cfg

        # .env files (exe dir takes precedence)
        self.env_file_exe = self.exe_dir / ".env"
        self.env_file_user = self.user_dir / ".env"
        
        self.data: Dict[str, Any] = {}
        self.env: Dict[str, str] = {}
    
    def ensure_ready(self) -> None:
        """Ensure config is ready (create user config if needed)."""
        if not self.user_cfg.exists():
            # Create a basic config file if it doesn't exist
            basic_config = """schema_version: 1

ui:
  theme: "obsidian"
  show_wizard: false
  default_pe: "Andrew Simmons, PE"
  default_firm: "TX - FIRM #20290"
  auto_save_interval: 120

business:
  firm_numbers:
    - "None"
    - "TX - Firm #20290"
    - "LA - Firm #6673"
    - "OK - Firm #8360"

  pe_profiles:
    - name: "Don Washington, PE"
      title: "VP of Electrical Engineering"
      email: "don.washington@root3power.com"
      phone: "(832) 865-0461"
      signature: "don_signature.png"

    - name: "Andrew Simmons, PE"
      title: "Managing Partner"
      email: "andrew.simmons@root3power.com"
      phone: "(713) 294-2003"
      signature: "andrew_signature.png"

email:
  sender: "your.email@gmail.com"
  app_password: "your_app_password"
  default_receiver: "recipient@example.com"
  subject_prefix: "[Root3Power Transmittal Builder]"
  sender_name: "Root3Power Transmittal Builder"

validation:
  require_from_email: true
  require_project_name: true
  require_at_least_one_contact: true
  email_pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$"
"""
            _write_text(self.user_cfg, basic_config)

        self.reload()

    def reload(self) -> None:
        """Reload configuration from all sources."""
        # Load config file
        merged = _yaml_load(_read_text(self.user_cfg))
        
        # Load .env files
        dotenv = _load_dotenv_file(
            self.env_file_exe if self.env_file_exe.exists() else self.env_file_user
        )
        env = dict(dotenv)
        env.update(os.environ)  # OS env vars override .env
        
        # Apply env var overrides
        if "R3P_RECEIVER" in env:
            merged.setdefault("email", {})["default_receiver"] = env["R3P_RECEIVER"]
        
        self.data = merged
        self.env = env
    
    # ---- Business helpers ----
    
    def get_firm_numbers(self) -> List[str]:
        """Get list of firm numbers."""
        arr = self.data.get("business", {}).get("firm_numbers", [])
        return list(arr) if arr else ["None"]
    
    def get_pe_names(self) -> List[str]:
        """Get list of PE names."""
        profiles = self.data.get("business", {}).get("pe_profiles", [])
        names = [p.get("name", "") for p in profiles if p.get("name")]
        return ["None"] + names
    
    def get_pe_profile(self, name: str) -> Optional[Dict[str, str]]:
        """Get PE profile by name."""
        for p in self.data.get("business", {}).get("pe_profiles", []):
            if p.get("name") == name:
                return dict(p)
        return None
    
    def get_auto_save_interval(self) -> int:
        """Get auto-save interval in seconds."""
        return self.data.get("ui", {}).get("auto_save_interval", 120)
    
    # ---- Validation helpers ----
    
    def get_validation_rules(self) -> Dict[str, Any]:
        """Get validation rules."""
        return self.data.get("validation", {})
    
    # ---- Email helpers ----
    
    def mail_creds(self) -> MailCreds:
        """
        Get email credentials from YAML config.

        Raises:
            RuntimeError: If credentials are missing
        """
        email_config = self.data.get("email", {})
        sender = email_config.get("sender", "").strip()
        app_password = email_config.get("app_password", "").strip()
        default_receiver = email_config.get("default_receiver", "").strip()

        if not sender or not app_password or not default_receiver:
            raise RuntimeError(
                "Missing email credentials!\n\n"
                "Please edit config.yaml and add:\n"
                "email:\n"
                "  sender: your.email@gmail.com\n"
                "  app_password: your_app_password\n"
                "  default_receiver: recipient@example.com\n"
            )

        return MailCreds(sender, app_password, default_receiver)
    
    def get_sender_name(self) -> str:
        """Get email sender display name."""
        return self.data.get("email", {}).get("sender_name", "Root3Power Transmittal Builder")
    
    # ---- Config file access ----
    
    def open_config_file(self) -> None:
        """Open user config file in default editor."""
        import subprocess
        if os.name == "nt":  # Windows
            os.startfile(str(self.user_cfg))
        elif sys.platform == "darwin":  # macOS
            subprocess.run(["open", str(self.user_cfg)])
        else:  # Linux
            subprocess.run(["xdg-open", str(self.user_cfg)])
    
    def get_config_path(self) -> Path:
        """Get path to user config file."""
        return self.user_cfg

