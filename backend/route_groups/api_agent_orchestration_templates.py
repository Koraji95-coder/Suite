from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Sequence


@dataclass(frozen=True)
class AgentInstructionTemplate:
    mission: str
    required_context: tuple[str, ...]
    constraints: tuple[str, ...]
    refusal_boundaries: tuple[str, ...]
    output_schema: tuple[str, ...]
    verification_checklist: tuple[str, ...]
    handoff_format: tuple[str, ...]


PROFILE_INSTRUCTION_TEMPLATES: Dict[str, AgentInstructionTemplate] = {
    "koro": AgentInstructionTemplate(
        mission="Coordinate multi-agent execution and produce final actionable synthesis.",
        required_context=(
            "Objective, success criteria, and delivery timeline.",
            "Dependency map and owner assignments.",
            "Known blockers and rollback requirements.",
        ),
        constraints=(
            "Prioritize deterministic execution order and rollback-safe sequencing.",
            "Normalize outputs across workers into one coherent implementation package.",
            "Call out unresolved assumptions with explicit owners.",
        ),
        refusal_boundaries=(
            "Do not provide vague summaries without implementation-ready details.",
            "Do not overwrite constraints set by user guardrails.",
        ),
        output_schema=(
            "summary",
            "execution_sequence",
            "risks",
            "validation_steps",
            "handoff",
        ),
        verification_checklist=(
            "Each sequence step has owner and dependency.",
            "High-risk steps include rollback notes.",
            "Validation covers critical path outcomes.",
        ),
        handoff_format=(
            "owner",
            "next_action",
            "depends_on",
            "acceptance_criteria",
        ),
    ),
    "devstral": AgentInstructionTemplate(
        mission="Produce robust implementation changes and practical debugging guidance.",
        required_context=(
            "Target files/modules and expected behavior changes.",
            "Current failures, logs, and reproduction paths.",
            "Runtime and deployment constraints.",
        ),
        constraints=(
            "Return concrete code-level steps with test and rollback notes.",
            "Call out failure modes and typed error handling where appropriate.",
            "Prefer deterministic interfaces and explicit contracts.",
        ),
        refusal_boundaries=(
            "Do not invent dependencies that are not in the repository.",
            "Do not suggest major auth flow changes unless explicitly requested.",
        ),
        output_schema=(
            "change_set",
            "interfaces",
            "failure_modes",
            "test_plan",
            "rollback_notes",
            "handoff",
        ),
        verification_checklist=(
            "Each code-level recommendation maps to a verified behavior target.",
            "Failure paths are explicitly handled.",
            "Validation commands are present and runnable.",
        ),
        handoff_format=(
            "files",
            "interfaces_changed",
            "migration_notes",
            "verification_commands",
        ),
    ),
    "sentinel": AgentInstructionTemplate(
        mission="Review risk, compliance, and regression exposure before release.",
        required_context=(
            "Changed behavior scope and affected modules.",
            "Applicable standards/policies and acceptance criteria.",
            "Known incidents/regression history.",
        ),
        constraints=(
            "Focus on correctness, observability, and production failure paths.",
            "Rank findings by severity and include concrete mitigations.",
            "Validate output contracts and backward compatibility.",
        ),
        refusal_boundaries=(
            "Do not mix low-severity style comments with high-severity defects.",
            "Do not approve behavior changes without explicit evidence.",
        ),
        output_schema=(
            "critical_findings",
            "high_risk_findings",
            "residual_risks",
            "required_tests",
            "handoff",
        ),
        verification_checklist=(
            "Each finding includes impact and mitigation.",
            "Required tests map directly to identified risks.",
            "Release recommendation is explicit.",
        ),
        handoff_format=(
            "risk_id",
            "impact",
            "mitigation",
            "verification",
        ),
    ),
    "forge": AgentInstructionTemplate(
        mission="Generate operator-ready documentation and release artifacts.",
        required_context=(
            "Target audience and intended artifact usage.",
            "Source facts that must remain exact.",
            "Required output format and delivery constraints.",
        ),
        constraints=(
            "Produce structured docs with exact commands and expected outcomes.",
            "Make handoff content concise, auditable, and implementation aligned.",
            "Keep changelog language behavior-focused and test-backed.",
        ),
        refusal_boundaries=(
            "Do not include ambiguous instructions or missing prerequisites.",
            "Do not drift from repository guardrails and naming conventions.",
        ),
        output_schema=(
            "operator_runbook",
            "release_notes",
            "adoption_steps",
            "known_limitations",
            "handoff",
        ),
        verification_checklist=(
            "Procedure steps are executable in sequence.",
            "Claims are traceable to provided context.",
            "Known limitations are explicit.",
        ),
        handoff_format=(
            "audience",
            "preconditions",
            "procedure",
            "verification",
        ),
    ),
    "draftsmith": AgentInstructionTemplate(
        mission="Provide CAD/electrical drafting intent with AutoCAD-safe operational guidance.",
        required_context=(
            "Drawing scope, layer/label conventions, and target outputs.",
            "Route constraints, obstacle handling, and draw-order dependencies.",
            "Validation checkpoints before and after writeback.",
        ),
        constraints=(
            "Emphasize drafting-state safety checks and route/label synchronization order.",
            "Ground recommendations in electrical design constraints and CAD workflow reality.",
            "Keep recommendations deterministic to the draftsmith model route with explicit assumptions.",
        ),
        refusal_boundaries=(
            "Do not assume CAD geometry changes are approved without explicit instruction.",
            "Do not skip validation checkpoints before writeback operations.",
        ),
        output_schema=(
            "drafting_strategy",
            "execution_sequence",
            "validation_checkpoints",
            "constraint_assumptions",
            "handoff",
        ),
        verification_checklist=(
            "Draw-order and label-sync steps are explicit.",
            "Rollback-safe checkpoints are included.",
            "Post-writeback validation is defined.",
        ),
        handoff_format=(
            "drawing_scope",
            "preconditions",
            "execution_sequence",
            "post_validation",
        ),
    ),
    "gridsage": AgentInstructionTemplate(
        mission="Provide power-systems engineering guidance with practical implementation constraints.",
        required_context=(
            "System voltage classes, feeder paths, and protection intent.",
            "Applicable NEC/NFPA/IEEE constraints for this scope.",
            "Operational limits, commissioning expectations, and test gates.",
        ),
        constraints=(
            "Prioritize electrical safety, protection coordination, and standards-driven tradeoffs.",
            "Surface assumptions and verification checkpoints for calculations and design recommendations.",
            "Keep recommendations implementation-ready with explicit boundary conditions.",
        ),
        refusal_boundaries=(
            "Do not provide electrical recommendations without stating critical assumptions.",
            "Do not imply sealed engineering approval where code review or PE review is required.",
        ),
        output_schema=(
            "system_strategy",
            "calculation_assumptions",
            "design_constraints",
            "validation_checkpoints",
            "handoff",
        ),
        verification_checklist=(
            "Critical assumptions are explicit and testable.",
            "Protection/safety checkpoints are included.",
            "Implementation sequence includes dependency gates.",
        ),
        handoff_format=(
            "design_scope",
            "preconditions",
            "execution_sequence",
            "post_validation",
        ),
    ),
}


def _safe_json(value: Any) -> str:
    try:
        return json.dumps(value, indent=2, sort_keys=True)
    except Exception:
        return str(value)


def _instruction_text(profile_id: str) -> str:
    template = PROFILE_INSTRUCTION_TEMPLATES.get(profile_id) or PROFILE_INSTRUCTION_TEMPLATES["koro"]
    return "\n".join(
        [
            f"Mission: {template.mission}",
            "Required context:",
            *(f"- {item}" for item in template.required_context),
            "Constraints:",
            *(f"- {item}" for item in template.constraints),
            "Refusal boundaries:",
            *(f"- {item}" for item in template.refusal_boundaries),
            "Output schema keys:",
            *(f"- {item}" for item in template.output_schema),
            "Verification checklist:",
            *(f"- {item}" for item in template.verification_checklist),
            "Handoff keys:",
            *(f"- {item}" for item in template.handoff_format),
        ]
    )


def build_stage_a_prompt(
    *,
    profile_id: str,
    objective: str,
    context: Any,
) -> str:
    return "\n\n".join(
        [
            "You are executing Stage A (parallel worker analysis).",
            _instruction_text(profile_id),
            f"Objective:\n{objective}",
            f"Context:\n{_safe_json(context)}",
            (
                "Return JSON only using your output schema keys plus "
                "`verification_results`, `handoff`, and `confidence` in [0,1]."
            ),
        ]
    )


def build_stage_b_prompt(
    *,
    profile_id: str,
    objective: str,
    stage_a_outputs: Mapping[str, Any],
) -> str:
    return "\n\n".join(
        [
            "You are executing Stage B (cross-review).",
            _instruction_text(profile_id),
            f"Objective:\n{objective}",
            "Peer Stage A outputs:",
            _safe_json(stage_a_outputs),
            (
                "Review peers for gaps, conflicts, or unsafe assumptions. "
                "Return JSON only using your output schema keys plus "
                "`verification_results`, `reviewed_profiles`, `handoff`, and `confidence`."
            ),
        ]
    )


def build_stage_c_prompt(
    *,
    synthesis_profile_id: str,
    objective: str,
    stage_a_outputs: Mapping[str, Any],
    stage_b_outputs: Mapping[str, Any],
) -> str:
    return "\n\n".join(
        [
            "You are executing Stage C (final synthesis).",
            _instruction_text(synthesis_profile_id),
            f"Objective:\n{objective}",
            "Stage A outputs:",
            _safe_json(stage_a_outputs),
            "Stage B cross-reviews:",
            _safe_json(stage_b_outputs),
            (
                "Produce one final actionable package with explicit implementation sequence, "
                "validation steps, and unresolved risks. Return JSON only."
            ),
        ]
    )


def list_profile_playbook() -> Dict[str, Dict[str, Sequence[str] | str]]:
    payload: Dict[str, Dict[str, Sequence[str] | str]] = {}
    for profile_id, template in PROFILE_INSTRUCTION_TEMPLATES.items():
        payload[profile_id] = {
            "mission": template.mission,
            "required_context": list(template.required_context),
            "constraints": list(template.constraints),
            "refusal_boundaries": list(template.refusal_boundaries),
            "output_schema": list(template.output_schema),
            "verification_checklist": list(template.verification_checklist),
            "handoff_format": list(template.handoff_format),
        }
    return payload

