from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .api_autocad_com_helpers import (
    com_call_with_retry as autocad_com_call_with_retry_helper,
    ensure_layer as autocad_ensure_layer_helper,
    pt as autocad_pt_helper,
    wait_for_command_finish as autocad_wait_for_command_finish_helper,
)
from .api_autocad_connection import (
    connect_autocad as autocad_connect_autocad_helper,
    dyn as autocad_dyn_helper,
)
from .api_autocad_entity_geometry import (
    entity_bbox as autocad_entity_bbox_helper,
    entity_center as autocad_entity_center_helper,
    poly_centroid as autocad_poly_centroid_helper,
)
from .api_autocad_export_excel import (
    export_points_to_excel as autocad_export_points_to_excel_helper,
)
from .api_autocad_manager import (
    create_autocad_manager as autocad_manager_create_helper,
    get_manager as autocad_manager_get_helper,
)
from .api_autocad_reference_block import (
    add_point_label as autocad_add_point_label_helper,
    default_ref_dwg_path as autocad_default_ref_dwg_path_helper,
    ensure_block_exists as autocad_ensure_block_exists_helper,
    insert_reference_block as autocad_insert_reference_block_helper,
)


@dataclass(frozen=True)
class AutoCADRuntime:
    foundation_source_type: str
    dyn: Callable[[Any], Any]
    connect_autocad: Callable[[], Any]
    com_call_with_retry: Callable[..., Any]
    pt: Callable[..., Any]
    ensure_layer: Callable[[Any, str], None]
    wait_for_command_finish: Callable[[Any, float], bool]
    ensure_block_exists: Callable[[Any, str, str], str]
    insert_reference_block: Callable[..., Any]
    add_point_label: Callable[..., Any]
    default_ref_dwg_path: Callable[[], str]
    entity_bbox: Callable[[Any], Any]
    poly_centroid: Callable[[Any], Any]
    entity_center: Callable[[Any], Any]
    export_points_to_excel: Callable[..., Any]
    get_manager: Callable[[], Any]


def create_autocad_runtime(
    *,
    autocad_com_available: bool,
    pythoncom_module: Any,
    win32com_module: Any,
    psutil_module: Any,
    time_module: Any,
    threading_module: Any,
    os_module: Any,
    re_module: Any,
    traceback_module: Any,
    logger: Any,
    datetime_now_fn: Callable[[], Any],
    api_base_dir: str,
    foundation_source_type: str = "Foundation Coordinates",
    print_fn: Any = print,
) -> AutoCADRuntime:
    def dyn(obj: Any) -> Any:
        return autocad_dyn_helper(
            obj,
            autocad_com_available=autocad_com_available,
            pythoncom_module=pythoncom_module,
            win32com_module=win32com_module,
        )

    def connect_autocad() -> Any:
        return autocad_connect_autocad_helper(
            autocad_com_available=autocad_com_available,
            win32com_module=win32com_module,
            dyn_fn=dyn,
        )

    def com_call_with_retry(callable_func, max_retries: int = 25, initial_delay: float = 0.03):
        return autocad_com_call_with_retry_helper(
            callable_func,
            max_retries=max_retries,
            initial_delay=initial_delay,
            pythoncom_module=pythoncom_module,
            time_module=time_module,
        )

    def pt(x: float, y: float, z: float = 0.0):
        win32_client_module = win32com_module.client if win32com_module is not None else None
        return autocad_pt_helper(
            x,
            y,
            z,
            autocad_com_available=autocad_com_available,
            pythoncom_module=pythoncom_module,
            win32com_client_module=win32_client_module,
        )

    def ensure_layer(doc: Any, layer_name: str) -> None:
        return autocad_ensure_layer_helper(
            doc,
            layer_name,
            dyn_fn=dyn,
        )

    def wait_for_command_finish(doc: Any, timeout_s: float = 10.0) -> bool:
        return autocad_wait_for_command_finish_helper(
            doc,
            timeout_s=timeout_s,
            dyn_fn=dyn,
            time_module=time_module,
        )

    def ensure_block_exists(doc: Any, block_name: str, dwg_path: str) -> str:
        return autocad_ensure_block_exists_helper(
            doc,
            block_name,
            dwg_path,
            dyn_fn=dyn,
            logger=logger,
            pt_fn=pt,
            com_call_with_retry_fn=com_call_with_retry,
            wait_for_command_finish_fn=wait_for_command_finish,
        )

    def insert_reference_block(
        doc,
        ms,
        ref_dwg_path,
        layer_name,
        x,
        y,
        z,
        scale,
        rotation_deg,
    ):
        return autocad_insert_reference_block_helper(
            doc,
            ms,
            ref_dwg_path,
            layer_name,
            x,
            y,
            z,
            scale,
            rotation_deg,
            dyn_fn=dyn,
            ensure_block_exists_fn=ensure_block_exists,
            ensure_layer_fn=ensure_layer,
            pt_fn=pt,
            com_call_with_retry_fn=com_call_with_retry,
        )

    def add_point_label(ms, layer_name, label_text, x, y, z, scale):
        return autocad_add_point_label_helper(
            ms,
            layer_name,
            label_text,
            x,
            y,
            z,
            scale,
            pt_fn=pt,
            com_call_with_retry_fn=com_call_with_retry,
            dyn_fn=dyn,
        )

    def default_ref_dwg_path() -> str:
        return autocad_default_ref_dwg_path_helper(base_dir=api_base_dir)

    def entity_bbox(ent):
        return autocad_entity_bbox_helper(ent, dyn_fn=dyn)

    def poly_centroid(ent):
        return autocad_poly_centroid_helper(ent, dyn_fn=dyn)

    def entity_center(ent):
        return autocad_entity_center_helper(ent, dyn_fn=dyn)

    def export_points_to_excel(points, precision, use_corners, drawing_dir=None):
        return autocad_export_points_to_excel_helper(
            points,
            precision,
            use_corners,
            drawing_dir=drawing_dir,
            output_base_dir=api_base_dir,
            now_fn=datetime_now_fn,
        )

    def _create_autocad_manager() -> Any:
        return autocad_manager_create_helper(
            time_module=time_module,
            threading_module=threading_module,
            psutil_module=psutil_module,
            pythoncom_module=pythoncom_module,
            traceback_module=traceback_module,
            os_module=os_module,
            re_module=re_module,
            autocad_com_available=autocad_com_available,
            connect_autocad_fn=connect_autocad,
            dyn_fn=dyn,
            entity_bbox_fn=entity_bbox,
            entity_center_fn=entity_center,
            default_ref_dwg_path_fn=default_ref_dwg_path,
            insert_reference_block_fn=insert_reference_block,
            add_point_label_fn=add_point_label,
            export_points_to_excel_fn=export_points_to_excel,
            foundation_source_type=foundation_source_type,
            print_fn=print_fn,
        )

    def get_manager() -> Any:
        return autocad_manager_get_helper(create_manager_fn=_create_autocad_manager)

    return AutoCADRuntime(
        foundation_source_type=foundation_source_type,
        dyn=dyn,
        connect_autocad=connect_autocad,
        com_call_with_retry=com_call_with_retry,
        pt=pt,
        ensure_layer=ensure_layer,
        wait_for_command_finish=wait_for_command_finish,
        ensure_block_exists=ensure_block_exists,
        insert_reference_block=insert_reference_block,
        add_point_label=add_point_label,
        default_ref_dwg_path=default_ref_dwg_path,
        entity_bbox=entity_bbox,
        poly_centroid=poly_centroid,
        entity_center=entity_center,
        export_points_to_excel=export_points_to_excel,
        get_manager=get_manager,
    )
