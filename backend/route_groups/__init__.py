"""Route group modules for api_server split-by-domain registration."""

from typing import Any


def register_route_groups(*args: Any, **kwargs: Any):
    from .api_registry import register_route_groups as _register_route_groups

    return _register_route_groups(*args, **kwargs)

__all__ = ["register_route_groups"]
