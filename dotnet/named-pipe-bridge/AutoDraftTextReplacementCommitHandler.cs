using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    internal readonly record struct AutoDraftTextReplacementExecuteTarget(
        string TargetEntityId,
        string TargetValue,
        string CurrentValue,
        string EntityTypeHint
    );

    internal readonly record struct AutoDraftTextReplacementUpdateReceipt(
        string TargetEntityId,
        string EntityType,
        string PreviousValue,
        string NextValue,
        string Handle
    );

    internal readonly record struct AutoDraftTextReplacementCommitOutcome(
        bool Succeeded,
        bool WroteChanges,
        string SkipReason,
        string Handle,
        string EntityType,
        IReadOnlyList<AutoDraftTextReplacementUpdateReceipt> Updates
    );

    internal static bool TryResolveAutoDraftTextReplacementExecuteTarget(
        JsonObject actionObject,
        out AutoDraftTextReplacementExecuteTarget target,
        out string reason
    )
    {
        target = default;
        reason = "missing text replacement execute_target metadata";

        if (!actionObject.TryGetPropertyValue("execute_target", out var targetNode) || targetNode is not JsonObject)
        {
            return false;
        }

        var kind = ReadStringValue((JsonObject)targetNode, "kind", "").Trim();
        if (!string.Equals(kind, "text_replacement", StringComparison.OrdinalIgnoreCase))
        {
            reason = "execute_target.kind must be 'text_replacement'";
            return false;
        }

        var targetEntityId = ReadStringValue((JsonObject)targetNode, "target_entity_id", "").Trim();
        if (string.IsNullOrWhiteSpace(targetEntityId))
        {
            targetEntityId = ReadStringValue((JsonObject)targetNode, "entity_id", "").Trim();
        }
        if (string.IsNullOrWhiteSpace(targetEntityId))
        {
            reason = "execute_target.target_entity_id is required";
            return false;
        }

        var targetValue = ReadStringValue((JsonObject)targetNode, "target_value", "").Trim();
        if (string.IsNullOrWhiteSpace(targetValue))
        {
            reason = "execute_target.target_value is required";
            return false;
        }

        var currentValue = ReadStringValue((JsonObject)targetNode, "current_value", "").Trim();
        if (string.IsNullOrWhiteSpace(currentValue))
        {
            currentValue = ReadStringValue((JsonObject)targetNode, "old_text", "").Trim();
        }

        var entityTypeHint = ReadStringValue((JsonObject)targetNode, "entity_type_hint", "").Trim();
        if (string.IsNullOrWhiteSpace(entityTypeHint))
        {
            entityTypeHint = ReadStringValue((JsonObject)targetNode, "entity_type", "").Trim();
        }

        target = new AutoDraftTextReplacementExecuteTarget(
            TargetEntityId: targetEntityId.Trim().ToUpperInvariant(),
            TargetValue: targetValue,
            CurrentValue: currentValue,
            EntityTypeHint: entityTypeHint
        );
        reason = "";
        return true;
    }

    internal static AutoDraftTextReplacementCommitOutcome CommitAutoDraftTextReplacementExecuteTarget(
        object document,
        AutoDraftTextReplacementExecuteTarget target,
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
            return new AutoDraftTextReplacementCommitOutcome(
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
            return new AutoDraftTextReplacementCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"target entity '{target.TargetEntityId}' was not found.",
                Handle: "",
                EntityType: "",
                Updates: []
            );
        }

        var entityType = StringOrDefault(ReadProperty(entity, "ObjectName"), "").Trim();
        var previousValue = TryReadRawStringProperty(entity, "TextString");
        if (previousValue is null)
        {
            return new AutoDraftTextReplacementCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"target entity '{target.TargetEntityId}' does not expose TextString.",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        if (!string.IsNullOrWhiteSpace(target.EntityTypeHint)
            && !string.IsNullOrWhiteSpace(entityType)
            && entityType.IndexOf(target.EntityTypeHint, StringComparison.OrdinalIgnoreCase) < 0)
        {
            warnings.Add(
                $"Text replacement target {target.TargetEntityId} resolved entity type '{entityType}', which does not match hint '{target.EntityTypeHint}'."
            );
        }

        if (!string.IsNullOrWhiteSpace(target.CurrentValue)
            && !string.Equals(previousValue, target.CurrentValue, StringComparison.Ordinal))
        {
            return new AutoDraftTextReplacementCommitOutcome(
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
            return new AutoDraftTextReplacementCommitOutcome(
                Succeeded: true,
                WroteChanges: false,
                SkipReason: $"text target '{target.TargetEntityId}' already matches the requested value.",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        try
        {
            ((dynamic)entity).TextString = target.TargetValue;
            try
            {
                ((dynamic)entity).Update();
            }
            catch (Exception updateEx)
            {
                warnings.Add(
                    $"Text replacement target '{target.TargetEntityId}' update() raised: {updateEx.Message}"
                );
            }
        }
        catch (Exception ex)
        {
            return new AutoDraftTextReplacementCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"text replacement write failed for '{target.TargetEntityId}': {ex.Message}",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        var handle = GetEntityHandle(entity);
        return new AutoDraftTextReplacementCommitOutcome(
            Succeeded: true,
            WroteChanges: true,
            SkipReason: "",
            Handle: handle,
            EntityType: entityType,
            Updates:
            [
                new AutoDraftTextReplacementUpdateReceipt(
                    TargetEntityId: target.TargetEntityId,
                    EntityType: entityType,
                    PreviousValue: previousValue,
                    NextValue: target.TargetValue,
                    Handle: handle
                ),
            ]
        );
    }

    internal static JsonArray AutoDraftTextReplacementUpdatesToJsonArray(
        IReadOnlyCollection<AutoDraftTextReplacementUpdateReceipt> updates
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
}
