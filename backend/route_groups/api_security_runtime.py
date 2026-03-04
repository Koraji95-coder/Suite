from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional


@dataclass(frozen=True)
class SecurityRuntime:
    is_valid_api_key: Callable[[Optional[str]], bool]
    require_api_key: Callable[[Callable[..., Any]], Callable[..., Any]]
    validate_layer_config: Callable[[Any], Dict[str, Any]]


def create_security_runtime(
    *,
    request_obj: Any,
    jsonify_fn: Callable[[Dict[str, Any]], Any],
    logger: Any,
    hmac_module: Any,
    wraps_fn: Callable[[Callable[..., Any]], Callable[..., Any]],
    api_key: str,
    re_module: Any,
) -> SecurityRuntime:
    def is_valid_api_key(provided_key: Optional[str]) -> bool:
        if not provided_key:
            return False
        return hmac_module.compare_digest(provided_key, api_key)

    def require_api_key(f):
        """Decorator to require API key authentication for protected routes."""

        @wraps_fn(f)
        def decorated_function(*args, **kwargs):
            provided_key = request_obj.headers.get("X-API-Key")
            is_valid = is_valid_api_key(provided_key)

            # Log all API requests for audit trail.
            logger.info(
                f"API Request: {request_obj.method} {request_obj.path} "
                f"from {request_obj.remote_addr} - Auth: "
                f"{'Valid' if is_valid else 'Invalid/Missing'}"
            )

            if not provided_key:
                logger.warning(
                    f"Unauthorized request (no API key): {request_obj.path} "
                    f"from {request_obj.remote_addr}"
                )
                return (
                    jsonify_fn({"error": "API key required", "code": "AUTH_REQUIRED"}),
                    401,
                )

            if not is_valid:
                logger.warning(
                    f"Unauthorized request (invalid API key): {request_obj.path} "
                    f"from {request_obj.remote_addr}"
                )
                return (
                    jsonify_fn({"error": "Invalid API key", "code": "AUTH_INVALID"}),
                    401,
                )

            return f(*args, **kwargs)

        return decorated_function

    def validate_layer_config(config: Any) -> Dict[str, Any]:
        """
        Validate and sanitize layer extraction configuration.
        Prevents injection attacks and ensures data integrity.
        """
        if not isinstance(config, dict):
            raise ValueError("Config must be a JSON object")

        # Validate and sanitize layers.
        layers = config.get("layers", [])
        if not isinstance(layers, list):
            raise ValueError("'layers' must be an array")
        if len(layers) > 100:  # Prevent DoS via excessive layers.
            raise ValueError("Maximum 100 layers allowed")

        sanitized_layers = []
        for layer in layers:
            if not isinstance(layer, str):
                continue
            # Allow alphanumeric, dash, underscore, space.
            sanitized = re_module.sub(r"[^a-zA-Z0-9\-_ ]", "", layer.strip())
            if sanitized and len(sanitized) <= 255:
                sanitized_layers.append(sanitized)

        # Validate block reference path if provided.
        ref_dwg = config.get("ref_dwg", "")
        if ref_dwg:
            if not isinstance(ref_dwg, str):
                raise ValueError("'ref_dwg' must be a string")
            if ".." in ref_dwg or ref_dwg.startswith(("/", "\\\\")):
                raise ValueError("Invalid reference path")
            if not ref_dwg.lower().endswith(".dwg"):
                raise ValueError("'ref_dwg' must have .dwg extension")

        # Validate block name if provided.
        block_name = config.get("block_name", "")
        if block_name:
            if not isinstance(block_name, str):
                raise ValueError("'block_name' must be a string")
            block_name = re_module.sub(r"[^a-zA-Z0-9\-_]", "", block_name.strip())
            if len(block_name) > 255:
                raise ValueError("Block name too long")

        return {
            "layers": sanitized_layers,
            "ref_dwg": ref_dwg.strip() if ref_dwg else "",
            "block_name": block_name,
            "export_excel": bool(config.get("export_excel", False)),
        }

    return SecurityRuntime(
        is_valid_api_key=is_valid_api_key,
        require_api_key=require_api_key,
        validate_layer_config=validate_layer_config,
    )
