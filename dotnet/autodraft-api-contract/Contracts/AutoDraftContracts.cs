using System.Text.Json;
using System.Text.Json.Serialization;

namespace AutoDraft.ApiContract.Contracts;

public sealed class MarkupInput
{
    [JsonPropertyName("type")]
    public string? Type { get; init; }

    [JsonPropertyName("color")]
    public string? Color { get; init; }

    [JsonPropertyName("text")]
    public string? Text { get; init; }

    [JsonPropertyName("bounds")]
    public MarkupBounds? Bounds { get; init; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Metadata { get; init; }
}

public sealed class MarkupBounds
{
    [JsonPropertyName("x")]
    public double X { get; init; }

    [JsonPropertyName("y")]
    public double Y { get; init; }

    [JsonPropertyName("width")]
    public double Width { get; init; }

    [JsonPropertyName("height")]
    public double Height { get; init; }
}

public sealed class AutoDraftRule
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("category")]
    public required string Category { get; init; }

    [JsonPropertyName("trigger")]
    public required Dictionary<string, object?> Trigger { get; init; }

    [JsonPropertyName("action")]
    public required string Action { get; init; }

    [JsonPropertyName("icon")]
    public required string Icon { get; init; }

    [JsonPropertyName("examples")]
    public IReadOnlyList<string> Examples { get; init; } = [];

    [JsonPropertyName("confidence")]
    public double Confidence { get; init; }
}

public sealed class AutoDraftPlanRequest
{
    [JsonPropertyName("markups")]
    public List<MarkupInput> Markups { get; init; } = [];
}

public sealed class AutoDraftPlanSummary
{
    [JsonPropertyName("total_markups")]
    public int TotalMarkups { get; init; }

    [JsonPropertyName("actions_proposed")]
    public int ActionsProposed { get; init; }

    [JsonPropertyName("classified")]
    public int Classified { get; init; }

    [JsonPropertyName("needs_review")]
    public int NeedsReview { get; init; }
}

public sealed class AutoDraftActionItem
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("rule_id")]
    public string? RuleId { get; init; }

    [JsonPropertyName("category")]
    public required string Category { get; init; }

    [JsonPropertyName("action")]
    public required string Action { get; init; }

    [JsonPropertyName("confidence")]
    public double Confidence { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("markup")]
    public required MarkupInput Markup { get; init; }
}

public sealed class AutoDraftPlanResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("source")]
    public required string Source { get; init; }

    [JsonPropertyName("actions")]
    public IReadOnlyList<AutoDraftActionItem> Actions { get; init; } = [];

    [JsonPropertyName("summary")]
    public required AutoDraftPlanSummary Summary { get; init; }

    [JsonPropertyName("message")]
    public string? Message { get; init; }
}

public sealed class AutoDraftExecuteRequest
{
    [JsonPropertyName("actions")]
    public List<AutoDraftActionItem> Actions { get; init; } = [];

    [JsonPropertyName("dry_run")]
    public bool DryRun { get; init; } = true;

    [JsonPropertyName("backcheck_request_id")]
    public string? BackcheckRequestId { get; init; }

    [JsonPropertyName("backcheck_override_reason")]
    public string? BackcheckOverrideReason { get; init; }

    [JsonPropertyName("backcheck_fail_count")]
    public int BackcheckFailCount { get; init; }
}

public sealed class AutoDraftExecuteResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("source")]
    public required string Source { get; init; }

    [JsonPropertyName("job_id")]
    public required string JobId { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("accepted")]
    public int Accepted { get; init; }

    [JsonPropertyName("skipped")]
    public int Skipped { get; init; }

    [JsonPropertyName("dry_run")]
    public bool DryRun { get; init; }

    [JsonPropertyName("message")]
    public string? Message { get; init; }
}

public sealed class AutoDraftBackcheckRequest
{
    [JsonPropertyName("actions")]
    public List<AutoDraftActionItem> Actions { get; init; } = [];

    [JsonPropertyName("cad_context")]
    public Dictionary<string, JsonElement>? CadContext { get; init; }

    [JsonPropertyName("require_cad_context")]
    public bool RequireCadContext { get; init; }

    [JsonPropertyName("requestId")]
    public string? RequestId { get; init; }
}

public sealed class AutoDraftBackcheckSummary
{
    [JsonPropertyName("total_actions")]
    public int TotalActions { get; init; }

    [JsonPropertyName("pass_count")]
    public int PassCount { get; init; }

    [JsonPropertyName("warn_count")]
    public int WarnCount { get; init; }

    [JsonPropertyName("fail_count")]
    public int FailCount { get; init; }
}

public sealed class AutoDraftBackcheckCadStatus
{
    [JsonPropertyName("available")]
    public bool Available { get; init; }

    [JsonPropertyName("degraded")]
    public bool Degraded { get; init; }

    [JsonPropertyName("source")]
    public string Source { get; init; } = "none";

    [JsonPropertyName("entity_count")]
    public int EntityCount { get; init; }

    [JsonPropertyName("locked_layer_count")]
    public int LockedLayerCount { get; init; }
}

public sealed class AutoDraftBackcheckFinding
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("action_id")]
    public required string ActionId { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("severity")]
    public required string Severity { get; init; }

    [JsonPropertyName("category")]
    public required string Category { get; init; }

    [JsonPropertyName("notes")]
    public IReadOnlyList<string> Notes { get; init; } = [];

    [JsonPropertyName("suggestions")]
    public IReadOnlyList<string> Suggestions { get; init; } = [];
}

public sealed class AutoDraftBackcheckResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("success")]
    public bool Success { get; init; }

    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }

    [JsonPropertyName("source")]
    public required string Source { get; init; }

    [JsonPropertyName("mode")]
    public required string Mode { get; init; }

    [JsonPropertyName("cad")]
    public required AutoDraftBackcheckCadStatus Cad { get; init; }

    [JsonPropertyName("summary")]
    public required AutoDraftBackcheckSummary Summary { get; init; }

    [JsonPropertyName("warnings")]
    public IReadOnlyList<string> Warnings { get; init; } = [];

    [JsonPropertyName("findings")]
    public IReadOnlyList<AutoDraftBackcheckFinding> Findings { get; init; } = [];
}

public sealed class AutoDraftRulesResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("rules")]
    public IReadOnlyList<AutoDraftRule> Rules { get; init; } = [];
}

public sealed class AutoDraftHealthResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("app")]
    public required string App { get; init; }

    [JsonPropertyName("mode")]
    public required string Mode { get; init; }

    [JsonPropertyName("version")]
    public required string Version { get; init; }

    [JsonPropertyName("planner_ready")]
    public bool PlannerReady { get; init; }

    [JsonPropertyName("executor_ready")]
    public bool ExecutorReady { get; init; }

    [JsonPropertyName("timestamp_utc")]
    public DateTimeOffset TimestampUtc { get; init; }
}
