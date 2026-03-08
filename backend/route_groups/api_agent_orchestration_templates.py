from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Sequence


@dataclass(frozen=True)
class AgentInstructionTemplate:
    mission: str
    do: tuple[str, ...]
    avoid: tuple[str, ...]
    output_schema: tuple[str, ...]
    handoff_format: tuple[str, ...]


PROFILE_INSTRUCTION_TEMPLATES: Dict[str, AgentInstructionTemplate] = {
    "koro": AgentInstructionTemplate(
        mission="Coordinate multi-agent execution and produce final actionable synthesis.",
        do=(
            "Prioritize execution order, dependency management, and rollback-safe sequencing.",
            "Normalize outputs across agents into one coherent implementation package.",
            "Call out blockers and unresolved assumptions with explicit owners.",
        ),
        avoid=(
            "Do not provide vague summaries without implementation-ready details.",
            "Do not overwrite constraints set by user guardrails.",
        ),
        output_schema=(
            "summary",
            "implementation_plan",
            "risks",
            "validation_steps",
            "handoff",
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
        do=(
            "Return concrete code-level steps with test and rollback notes.",
            "Call out failure modes and typed error handling where appropriate.",
            "Prefer deterministic interfaces and explicit contracts.",
        ),
        avoid=(
            "Do not invent dependencies that are not in the repository.",
            "Do not suggest major auth flow changes unless explicitly requested.",
        ),
        output_schema=(
            "change_set",
            "failure_modes",
            "test_plan",
            "rollback_notes",
            "handoff",
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
        do=(
            "Focus on correctness, observability, and production failure paths.",
            "Rank findings by severity and include concrete mitigations.",
            "Validate output contracts and backward compatibility.",
        ),
        avoid=(
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
        handoff_format=(
            "risk_id",
            "impact",
            "mitigation",
            "verification",
        ),
    ),
    "forge": AgentInstructionTemplate(
        mission="Generate operator-ready documentation and release artifacts.",
        do=(
            "Produce structured docs with exact commands and expected outcomes.",
            "Make handoff content concise, auditable, and implementation aligned.",
            "Keep changelog language behavior-focused and test-backed.",
        ),
        avoid=(
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
        handoff_format=(
            "audience",
            "preconditions",
            "procedure",
            "verification",
        ),
    ),
    "draftsmith": AgentInstructionTemplate(
        mission="Provide CAD/electrical drafting intent with AutoCAD-safe operational guidance.",
        do=(
            "Emphasize drafting-state safety checks and route/label synchronization order.",
            "Ground recommendations in electrical design constraints and CAD workflow reality.",
            "When CAD specialization confidence is low, align output for electricalengineerv2 fallback continuity.",
        ),
        avoid=(
            "Do not assume CAD geometry changes are approved without explicit instruction.",
            "Do not skip validation checkpoints before writeback operations.",
        ),
        output_schema=(
            "drafting_strategy",
            "validation_checkpoints",
            "writeback_sequence",
            "fallback_notes",
            "handoff",
        ),
        handoff_format=(
            "drawing_scope",
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
            "Do:",
            *(f"- {item}" for item in template.do),
            "Avoid:",
            *(f"- {item}" for item in template.avoid),
            "Output schema keys:",
            *(f"- {item}" for item in template.output_schema),
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
            "Return JSON only using your output schema keys plus a `confidence` value in [0,1].",
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
                "Return JSON only using your output schema keys plus `reviewed_profiles` and `confidence`."
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
            "do": list(template.do),
            "avoid": list(template.avoid),
            "output_schema": list(template.output_schema),
            "handoff_format": list(template.handoff_format),
        }
    return payload

