using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using Microsoft.Extensions.Options;
using System.Globalization;
using System.Text.Json;

namespace AutoDraft.ApiContract.Services;

public sealed class MockAutoDraftBackchecker : IAutoDraftBackchecker
{
    private const string StatusPass = "pass";
    private const string StatusWarn = "warn";
    private const string StatusFail = "fail";
    private const string SeverityLow = "low";
    private const string SeverityMedium = "medium";
    private const string SeverityHigh = "high";
    private static readonly HashSet<string> GeometryCategories = new(StringComparer.Ordinal)
    {
        "delete",
        "add",
        "swap",
    };

    private readonly AutoDraftOptions _options;

    public MockAutoDraftBackchecker(IOptions<AutoDraftOptions> options)
    {
        _options = options.Value;
    }

    public AutoDraftBackcheckResponse Backcheck(
        AutoDraftBackcheckRequest request,
        CancellationToken cancellationToken = default
    )
    {
        cancellationToken.ThrowIfCancellationRequested();
        var actions = request.Actions ?? [];
        var cadSnapshot = ParseCadContext(request.CadContext);

        var actionBounds = new Dictionary<string, BoundsSnapshot>(StringComparer.OrdinalIgnoreCase);
        var actionCategories = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var idx = 0; idx < actions.Count; idx++)
        {
            var action = actions[idx];
            var actionId = ResolveActionId(action, idx + 1);
            var category = NormalizeText(action.Category);
            var bounds = NormalizeBounds(action.Markup?.Bounds);
            actionCategories[actionId] = category;
            if (bounds is not null)
            {
                actionBounds[actionId] = bounds;
            }
        }

        var findings = new List<AutoDraftBackcheckFinding>(actions.Count);
        foreach (var (action, index) in actions.Select((entry, actionIndex) => (entry, actionIndex)))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var actionId = ResolveActionId(action, index + 1);
            var category = NormalizeText(action.Category);
            var actionStatus = NormalizeText(action.Status);
            var markupType = NormalizeText(action.Markup?.Type);
            var markupColor = NormalizeText(action.Markup?.Color);
            var markupText = NormalizeText(action.Markup?.Text);
            var layerNameRaw = ResolveMarkupLayer(action.Markup);
            var layerName = NormalizeText(layerNameRaw);
            var markupBounds = NormalizeBounds(action.Markup?.Bounds);

            var status = StatusPass;
            var severity = SeverityLow;
            var notes = new List<string>();
            var suggestions = new HashSet<string>(StringComparer.Ordinal);

            if (actionStatus is "review" or "needs_review")
            {
                status = StatusFail;
                severity = SeverityHigh;
                notes.Add("Action is still marked for review and is not execution-ready.");
                suggestions.Add("Resolve classification/review state before execution.");
            }

            if (string.IsNullOrWhiteSpace(action.RuleId))
            {
                status = StatusFail;
                severity = SeverityHigh;
                notes.Add("Action is unclassified and requires operator review.");
                suggestions.Add("Classify this action before execution.");
            }

            if (action.Confidence < 0.5)
            {
                PromoteToWarn(ref status, ref severity);
                notes.Add($"Confidence is low ({action.Confidence:0.00}).");
                suggestions.Add("Review geometry intent before execute.");
            }

            if (string.IsNullOrWhiteSpace(markupType))
            {
                PromoteToWarn(ref status, ref severity);
                notes.Add("Markup type is missing.");
                suggestions.Add("Include markup.type to improve rule verification.");
            }

            if (CloudIntentConflicts(markupType, markupColor, markupText))
            {
                status = StatusFail;
                severity = SeverityHigh;
                notes.Add("Cloud color and action text intent conflict.");
                suggestions.Add("Correct cloud color or action wording to remove conflicting intent.");
            }

            if (markupType == "cloud")
            {
                if (markupColor == "green" && category != "delete")
                {
                    PromoteToWarn(ref status, ref severity);
                    notes.Add("Green cloud is typically delete intent, but category is not DELETE.");
                    suggestions.Add("Confirm cloud color/category mapping before execution.");
                }
                else if (markupColor == "red" && category != "add")
                {
                    PromoteToWarn(ref status, ref severity);
                    notes.Add("Red cloud is typically add intent, but category is not ADD.");
                    suggestions.Add("Confirm cloud color/category mapping before execution.");
                }
            }

            if (GeometryCategories.Contains(category) && markupBounds is null)
            {
                PromoteToWarn(ref status, ref severity);
                notes.Add("Action has no geometry bounds for CAD-aware validation.");
                suggestions.Add("Attach markup bounds to enable CAD collision checks.");
            }

            if (GeometryCategories.Contains(category) && string.IsNullOrWhiteSpace(layerName))
            {
                PromoteToWarn(ref status, ref severity);
                notes.Add("Layer name is missing for geometry-affecting action.");
                suggestions.Add("Include markup.layer to validate standards and lock state.");
            }

            if (
                cadSnapshot.Available
                && !string.IsNullOrWhiteSpace(layerName)
                && cadSnapshot.LockedLayers.Contains(layerName)
            )
            {
                status = StatusFail;
                severity = SeverityHigh;
                notes.Add($"Layer '{layerNameRaw}' is locked.");
                suggestions.Add("Move action target to an editable layer or unlock the target layer.");
            }

            if (cadSnapshot.Available && markupBounds is not null)
            {
                var overlappingCount = cadSnapshot.Entities.Count(
                    entity => BoundsOverlap(markupBounds, entity.Bounds)
                );

                if (category == "delete" && overlappingCount == 0)
                {
                    PromoteToWarn(ref status, ref severity);
                    notes.Add("DELETE action has no intersecting CAD entities in bounds.");
                    suggestions.Add("Expand bounds or verify target geometry selection.");
                }
                else if (category == "add" && overlappingCount > 0)
                {
                    PromoteToWarn(ref status, ref severity);
                    notes.Add($"ADD action overlaps {overlappingCount} existing CAD entities.");
                    suggestions.Add("Validate insertion offset or route to avoid geometry overlap.");
                }
                else if (category == "swap" && overlappingCount < 2)
                {
                    PromoteToWarn(ref status, ref severity);
                    notes.Add("SWAP action found fewer than two intersecting targets.");
                    suggestions.Add("Verify both swap endpoints are represented in markup bounds.");
                }
            }

            if (markupBounds is not null)
            {
                var conflictCount = 0;
                foreach (var (otherActionId, otherBounds) in actionBounds)
                {
                    if (string.Equals(otherActionId, actionId, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    if (!BoundsOverlap(markupBounds, otherBounds))
                    {
                        continue;
                    }

                    actionCategories.TryGetValue(otherActionId, out var otherCategory);
                    var addDeleteConflict = (category == "add" && otherCategory == "delete")
                        || (category == "delete" && otherCategory == "add");
                    if (addDeleteConflict)
                    {
                        conflictCount++;
                    }
                }

                if (conflictCount > 0)
                {
                    PromoteToWarn(ref status, ref severity);
                    notes.Add($"Action bounds conflict with {conflictCount} opposite-intent action(s).");
                    suggestions.Add("Resolve overlap between ADD and DELETE operations before execution.");
                }
            }

            findings.Add(
                new AutoDraftBackcheckFinding
                {
                    Id = $"finding-{index + 1}",
                    ActionId = actionId,
                    Status = status,
                    Severity = severity,
                    Category = string.IsNullOrWhiteSpace(category) ? "unclassified" : category,
                    Notes = notes,
                    Suggestions = [.. suggestions],
                }
            );
        }

        var passCount = findings.Count(item => item.Status == StatusPass);
        var warnCount = findings.Count(item => item.Status == StatusWarn);
        var failCount = findings.Count(item => item.Status == StatusFail);
        var requestId = string.IsNullOrWhiteSpace(request.RequestId)
            ? $"req-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"
            : request.RequestId.Trim();
        var warnings = new List<string>(cadSnapshot.Warnings);
        if (request.RequireCadContext && !cadSnapshot.Available)
        {
            warnings.Add("CAD context was required for this request but was unavailable.");
        }

        return new AutoDraftBackcheckResponse
        {
            Ok = true,
            Success = true,
            RequestId = requestId,
            Source = _options.SourceLabel,
            Mode = "cad-aware",
            Cad = new AutoDraftBackcheckCadStatus
            {
                Available = cadSnapshot.Available,
                Degraded = !cadSnapshot.Available,
                Source = cadSnapshot.Source,
                EntityCount = cadSnapshot.Entities.Count,
                LockedLayerCount = cadSnapshot.LockedLayers.Count,
            },
            Summary = new AutoDraftBackcheckSummary
            {
                TotalActions = findings.Count,
                PassCount = passCount,
                WarnCount = warnCount,
                FailCount = failCount,
            },
            Warnings = warnings,
            Findings = findings,
        };
    }

    private static void PromoteToWarn(ref string status, ref string severity)
    {
        if (StatusRank(StatusWarn) <= StatusRank(status))
        {
            return;
        }
        status = StatusWarn;
        severity = SeverityMedium;
    }

    private static int StatusRank(string value)
    {
        return value switch
        {
            StatusFail => 3,
            StatusWarn => 2,
            _ => 1,
        };
    }

    private static string ResolveActionId(AutoDraftActionItem action, int index)
    {
        return string.IsNullOrWhiteSpace(action.Id) ? $"action-{index}" : action.Id.Trim();
    }

    private static string ResolveMarkupLayer(MarkupInput? markup)
    {
        if (markup?.Metadata is null)
        {
            return string.Empty;
        }

        foreach (var (key, value) in markup.Metadata)
        {
            if (
                !string.Equals(key, "layer", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(key, "layer_name", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(key, "layerName", StringComparison.OrdinalIgnoreCase)
            )
            {
                continue;
            }

            if (value.ValueKind == JsonValueKind.String)
            {
                return value.GetString()?.Trim() ?? string.Empty;
            }
        }

        return string.Empty;
    }

    private static string NormalizeText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().ToLowerInvariant();
    }

    private static bool CloudIntentConflicts(string markupType, string markupColor, string markupText)
    {
        if (markupType != "cloud")
        {
            return false;
        }

        var hasDeleteIntent = markupText.Contains("delete", StringComparison.Ordinal);
        var hasAddIntent = markupText.Contains("add", StringComparison.Ordinal);

        return (markupColor == "green" && hasAddIntent) || (markupColor == "red" && hasDeleteIntent);
    }

    private static BoundsSnapshot? NormalizeBounds(MarkupBounds? bounds)
    {
        if (bounds is null)
        {
            return null;
        }

        if (
            !double.IsFinite(bounds.X)
            || !double.IsFinite(bounds.Y)
            || !double.IsFinite(bounds.Width)
            || !double.IsFinite(bounds.Height)
        )
        {
            return null;
        }

        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return null;
        }

        return new BoundsSnapshot(bounds.X, bounds.Y, bounds.Width, bounds.Height);
    }

    private static BoundsSnapshot? NormalizeBounds(JsonElement rawBounds)
    {
        if (rawBounds.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!TryReadDouble(rawBounds, "x", out var x) || !TryReadDouble(rawBounds, "y", out var y))
        {
            return null;
        }

        var widthAvailable = TryReadDouble(rawBounds, "width", out var width)
            || TryReadDouble(rawBounds, "w", out width);
        var heightAvailable = TryReadDouble(rawBounds, "height", out var height)
            || TryReadDouble(rawBounds, "h", out height);

        if (!widthAvailable || !heightAvailable)
        {
            return null;
        }
        if (width <= 0 || height <= 0)
        {
            return null;
        }

        return new BoundsSnapshot(x, y, width, height);
    }

    private static bool BoundsOverlap(BoundsSnapshot a, BoundsSnapshot b)
    {
        return a.X < b.Right && a.Right > b.X && a.Y < b.Bottom && a.Bottom > b.Y;
    }

    private static CadContextSnapshot ParseCadContext(Dictionary<string, JsonElement>? cadContext)
    {
        if (cadContext is null || cadContext.Count == 0)
        {
            return new CadContextSnapshot
            {
                Source = "none",
                Available = false,
                LockedLayers = new HashSet<string>(StringComparer.OrdinalIgnoreCase),
                Entities = [],
                Warnings = ["CAD context unavailable; backcheck degraded to action-level verification."],
            };
        }

        var source = ReadSource(cadContext);
        var lockedLayers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entities = new List<CadEntitySnapshot>();
        var warnings = new List<string>();

        if (cadContext.TryGetValue("layers", out var layersElement) && layersElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var layerElement in layersElement.EnumerateArray())
            {
                if (layerElement.ValueKind == JsonValueKind.String)
                {
                    continue;
                }
                if (layerElement.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (!TryReadString(layerElement, "name", out var layerName))
                {
                    continue;
                }

                if (TryReadBoolean(layerElement, "locked", out var locked) && locked)
                {
                    lockedLayers.Add(layerName.ToLowerInvariant());
                }
                else if (TryReadBoolean(layerElement, "is_locked", out var isLocked) && isLocked)
                {
                    lockedLayers.Add(layerName.ToLowerInvariant());
                }
            }
        }

        if (cadContext.TryGetValue("locked_layers", out var lockedLayersElement) && lockedLayersElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var entry in lockedLayersElement.EnumerateArray())
            {
                if (entry.ValueKind != JsonValueKind.String)
                {
                    continue;
                }
                var value = entry.GetString()?.Trim();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    lockedLayers.Add(value.ToLowerInvariant());
                }
            }
        }

        if (cadContext.TryGetValue("entities", out var entitiesElement) && entitiesElement.ValueKind == JsonValueKind.Array)
        {
            var fallbackIndex = 1;
            foreach (var entityElement in entitiesElement.EnumerateArray())
            {
                if (entityElement.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (!entityElement.TryGetProperty("bounds", out var rawBounds))
                {
                    continue;
                }

                var normalizedBounds = NormalizeBounds(rawBounds);
                if (normalizedBounds is null)
                {
                    continue;
                }

                var entityId = ReadEntityId(entityElement, fallbackIndex);
                var layer = ReadEntityLayer(entityElement);
                entities.Add(
                    new CadEntitySnapshot
                    {
                        Id = entityId,
                        Layer = layer,
                        Bounds = normalizedBounds,
                    }
                );
                fallbackIndex++;
            }
        }

        var hasDrawing = cadContext.TryGetValue("drawing", out var drawingElement)
            && drawingElement.ValueKind == JsonValueKind.Object;
        var available = hasDrawing || lockedLayers.Count > 0 || entities.Count > 0;
        if (!available)
        {
            warnings.Add("CAD context unavailable; backcheck degraded to action-level verification.");
            source = "none";
        }
        else if (string.IsNullOrWhiteSpace(source))
        {
            source = "client";
        }

        return new CadContextSnapshot
        {
            Source = source,
            Available = available,
            LockedLayers = lockedLayers,
            Entities = entities,
            Warnings = warnings,
        };
    }

    private static string ReadSource(Dictionary<string, JsonElement> cadContext)
    {
        if (cadContext.TryGetValue("source", out var sourceElement) && sourceElement.ValueKind == JsonValueKind.String)
        {
            var sourceValue = sourceElement.GetString()?.Trim();
            if (!string.IsNullOrWhiteSpace(sourceValue))
            {
                return sourceValue;
            }
        }
        return "client";
    }

    private static string ReadEntityId(JsonElement entityElement, int fallbackIndex)
    {
        foreach (var key in new[] { "id", "handle", "uuid" })
        {
            if (!TryReadString(entityElement, key, out var value))
            {
                continue;
            }
            return value;
        }
        return $"entity-{fallbackIndex}";
    }

    private static string ReadEntityLayer(JsonElement entityElement)
    {
        return TryReadString(entityElement, "layer", out var value) ? value : string.Empty;
    }

    private static bool TryReadString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return false;
        }
        if (property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var text = property.GetString()?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        value = text;
        return true;
    }

    private static bool TryReadBoolean(JsonElement element, string propertyName, out bool value)
    {
        value = false;
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return false;
        }

        if (property.ValueKind == JsonValueKind.True)
        {
            value = true;
            return true;
        }
        if (property.ValueKind == JsonValueKind.False)
        {
            value = false;
            return true;
        }
        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var intValue))
        {
            value = intValue != 0;
            return true;
        }
        if (property.ValueKind == JsonValueKind.String)
        {
            var text = property.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                return false;
            }
            if (bool.TryParse(text, out var boolValue))
            {
                value = boolValue;
                return true;
            }
            if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedInt))
            {
                value = parsedInt != 0;
                return true;
            }
        }

        return false;
    }

    private static bool TryReadDouble(JsonElement element, string propertyName, out double value)
    {
        value = 0;
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return false;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetDouble(out var numericValue))
        {
            if (!double.IsFinite(numericValue))
            {
                return false;
            }
            value = numericValue;
            return true;
        }
        if (property.ValueKind == JsonValueKind.String)
        {
            var text = property.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                return false;
            }
            if (
                double.TryParse(
                    text,
                    NumberStyles.Float | NumberStyles.AllowThousands,
                    CultureInfo.InvariantCulture,
                    out var parsedValue
                )
                && double.IsFinite(parsedValue)
            )
            {
                value = parsedValue;
                return true;
            }
        }
        return false;
    }

    private sealed record BoundsSnapshot(double X, double Y, double Width, double Height)
    {
        public double Right => X + Width;
        public double Bottom => Y + Height;
    }

    private sealed class CadEntitySnapshot
    {
        public required string Id { get; init; }
        public string Layer { get; init; } = string.Empty;
        public required BoundsSnapshot Bounds { get; init; }
    }

    private sealed class CadContextSnapshot
    {
        public required string Source { get; init; }
        public required bool Available { get; init; }
        public required HashSet<string> LockedLayers { get; init; }
        public required IReadOnlyList<CadEntitySnapshot> Entities { get; init; }
        public required IReadOnlyList<string> Warnings { get; init; }
    }
}
