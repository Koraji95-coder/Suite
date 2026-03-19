using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    internal readonly record struct AutoDraftDimensionTextExecuteTarget(
        string TargetEntityId,
        string TargetValue,
        string CurrentValue,
        string EntityTypeHint
    );

    internal readonly record struct AutoDraftDimensionTextUpdateReceipt(
        string TargetEntityId,
        string EntityType,
        string PreviousValue,
        string NextValue,
        string Handle
    );

    internal readonly record struct AutoDraftDimensionTextCommitOutcome(
        bool Succeeded,
        bool WroteChanges,
        string SkipReason,
        string Handle,
        string EntityType,
        IReadOnlyList<AutoDraftDimensionTextUpdateReceipt> Updates
    );

    internal static bool TryResolveAutoDraftDimensionTextExecuteTarget(
        JsonObject actionObject,
        out AutoDraftDimensionTextExecuteTarget target,
        out string reason
    )
    {
        target = default;
        reason = "missing dimension text execute_target metadata";

        if (!actionObject.TryGetPropertyValue("execute_target", out var targetNode) || targetNode is not JsonObject targetObject)
        {
            return false;
        }

        var kind = ReadStringValue(targetObject, "kind", "").Trim();
        if (!string.Equals(kind, "dimension_text_override", StringComparison.OrdinalIgnoreCase))
        {
            reason = "execute_target.kind must be 'dimension_text_override'";
            return false;
        }

        var targetEntityId = ReadStringValue(targetObject, "target_entity_id", "").Trim();
        if (string.IsNullOrWhiteSpace(targetEntityId))
        {
            targetEntityId = ReadStringValue(targetObject, "entity_id", "").Trim();
        }
        if (string.IsNullOrWhiteSpace(targetEntityId))
        {
            reason = "execute_target.target_entity_id is required";
            return false;
        }

        var targetValue = ReadStringValue(targetObject, "target_value", "").Trim();
        if (string.IsNullOrWhiteSpace(targetValue))
        {
            reason = "execute_target.target_value is required";
            return false;
        }

        var currentValue = ReadStringValue(targetObject, "current_value", "").Trim();
        if (string.IsNullOrWhiteSpace(currentValue))
        {
            currentValue = ReadStringValue(targetObject, "old_text", "").Trim();
        }

        var entityTypeHint = ReadStringValue(targetObject, "entity_type_hint", "").Trim();
        if (string.IsNullOrWhiteSpace(entityTypeHint))
        {
            entityTypeHint = ReadStringValue(targetObject, "entity_type", "").Trim();
        }

        target = new AutoDraftDimensionTextExecuteTarget(
            TargetEntityId: targetEntityId.Trim().ToUpperInvariant(),
            TargetValue: targetValue,
            CurrentValue: currentValue,
            EntityTypeHint: entityTypeHint
        );
        reason = "";
        return true;
    }

    internal static AutoDraftDimensionTextCommitOutcome CommitAutoDraftDimensionTextExecuteTarget(
        object document,
        AutoDraftDimensionTextExecuteTarget target,
        List<string> warnings
    )
    {
        object? entity;
        try
        {
            entity = ((dynamic)document).HandleToObject(target.TargetEntityId);
        }
        catch (Exception ex)
        {
            return new AutoDraftDimensionTextCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"target entity '{target.TargetEntityId}' was not found: {ex.Message}",
                Handle: "",
                EntityType: "",
                Updates: []
            );
        }

        if (entity is null)
        {
            return new AutoDraftDimensionTextCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"target entity '{target.TargetEntityId}' was not found.",
                Handle: "",
                EntityType: "",
                Updates: []
            );
        }

        var entityType = StringOrDefault(ReadProperty(entity, "ObjectName"), "").Trim();
        if (entityType.IndexOf("dimension", StringComparison.OrdinalIgnoreCase) < 0)
        {
            return new AutoDraftDimensionTextCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"target entity '{target.TargetEntityId}' is not a dimension entity.",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        if (!string.IsNullOrWhiteSpace(target.EntityTypeHint)
            && entityType.IndexOf(target.EntityTypeHint, StringComparison.OrdinalIgnoreCase) < 0)
        {
            warnings.Add(
                $"Dimension target {target.TargetEntityId} resolved entity type '{entityType}', which does not match hint '{target.EntityTypeHint}'."
            );
        }

        var previousValue = ReadAutoDraftDimensionDisplayValue(entity);
        if (!string.IsNullOrWhiteSpace(target.CurrentValue)
            && !string.IsNullOrWhiteSpace(previousValue)
            && !string.Equals(previousValue, target.CurrentValue, StringComparison.Ordinal))
        {
            return new AutoDraftDimensionTextCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason:
                    $"target entity '{target.TargetEntityId}' current value '{previousValue}' did not match expected '{target.CurrentValue}'.",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        if (string.Equals(previousValue, target.TargetValue, StringComparison.Ordinal))
        {
            return new AutoDraftDimensionTextCommitOutcome(
                Succeeded: true,
                WroteChanges: false,
                SkipReason: $"dimension target '{target.TargetEntityId}' already matches the requested override.",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        try
        {
            ((dynamic)entity).TextOverride = target.TargetValue;
            try
            {
                ((dynamic)entity).Update();
            }
            catch (Exception updateEx)
            {
                warnings.Add(
                    $"Dimension target '{target.TargetEntityId}' update() raised: {updateEx.Message}"
                );
            }
        }
        catch (Exception ex)
        {
            return new AutoDraftDimensionTextCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"dimension override write failed for '{target.TargetEntityId}': {ex.Message}",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        var handle = GetEntityHandle(entity);
        return new AutoDraftDimensionTextCommitOutcome(
            Succeeded: true,
            WroteChanges: true,
            SkipReason: "",
            Handle: handle,
            EntityType: entityType,
            Updates:
            [
                new AutoDraftDimensionTextUpdateReceipt(
                    TargetEntityId: target.TargetEntityId,
                    EntityType: entityType,
                    PreviousValue: previousValue,
                    NextValue: target.TargetValue,
                    Handle: handle
                ),
            ]
        );
    }

    internal static JsonArray AutoDraftDimensionTextUpdatesToJsonArray(
        IReadOnlyCollection<AutoDraftDimensionTextUpdateReceipt> updates
    )
    {
        var array = new JsonArray();
        foreach (var update in updates)
        {
            array.Add(
                new JsonObject
                {
                    ["targetEntityId"] = update.TargetEntityId,
                    ["entityType"] = string.IsNullOrWhiteSpace(update.EntityType) ? null : update.EntityType,
                    ["previousValue"] = update.PreviousValue,
                    ["nextValue"] = update.NextValue,
                    ["handle"] = string.IsNullOrWhiteSpace(update.Handle) ? null : update.Handle,
                }
            );
        }
        return array;
    }

    private static string ReadAutoDraftDimensionDisplayValue(object entity)
    {
        var textOverride = (TryReadRawStringProperty(entity, "TextOverride") ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(textOverride) && !string.Equals(textOverride, "<>", StringComparison.Ordinal))
        {
            return textOverride;
        }

        var textString = (TryReadRawStringProperty(entity, "TextString") ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(textString) && !string.Equals(textString, "<>", StringComparison.Ordinal))
        {
            return textString;
        }

        var textValue = (TryReadRawStringProperty(entity, "Text") ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(textValue) && !string.Equals(textValue, "<>", StringComparison.Ordinal))
        {
            return textValue;
        }

        var measurement = ReadProperty(entity, "Measurement");
        if (measurement is not null)
        {
            var measurementText = measurement.ToString()?.Trim() ?? "";
            if (!string.IsNullOrWhiteSpace(measurementText))
            {
                return measurementText;
            }
        }

        return "";
    }
}
