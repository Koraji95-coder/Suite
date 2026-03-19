using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    internal readonly record struct AutoDraftTextDeleteExecuteTarget(
        string TargetEntityId,
        string CurrentValue,
        string EntityTypeHint
    );

    internal readonly record struct AutoDraftTextDeleteUpdateReceipt(
        string TargetEntityId,
        string EntityType,
        string PreviousValue,
        string Handle
    );

    internal readonly record struct AutoDraftTextDeleteCommitOutcome(
        bool Succeeded,
        bool WroteChanges,
        string SkipReason,
        string Handle,
        string EntityType,
        IReadOnlyList<AutoDraftTextDeleteUpdateReceipt> Updates
    );

    internal static bool TryResolveAutoDraftTextDeleteExecuteTarget(
        JsonObject actionObject,
        out AutoDraftTextDeleteExecuteTarget target,
        out string reason
    )
    {
        target = default;
        reason = "missing text delete execute_target metadata";

        if (!actionObject.TryGetPropertyValue("execute_target", out var targetNode) || targetNode is not JsonObject targetObject)
        {
            return false;
        }

        var kind = ReadStringValue(targetObject, "kind", "").Trim();
        if (!string.Equals(kind, "text_delete", StringComparison.OrdinalIgnoreCase))
        {
            reason = "execute_target.kind must be 'text_delete'";
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

        var currentValue = ReadStringValue(targetObject, "current_value", "").Trim();
        if (string.IsNullOrWhiteSpace(currentValue))
        {
            currentValue = ReadStringValue(targetObject, "old_text", "").Trim();
        }
        if (string.IsNullOrWhiteSpace(currentValue))
        {
            reason = "execute_target.current_value is required";
            return false;
        }

        var entityTypeHint = ReadStringValue(targetObject, "entity_type_hint", "").Trim();
        if (string.IsNullOrWhiteSpace(entityTypeHint))
        {
            entityTypeHint = ReadStringValue(targetObject, "entity_type", "").Trim();
        }

        target = new AutoDraftTextDeleteExecuteTarget(
            TargetEntityId: targetEntityId.Trim().ToUpperInvariant(),
            CurrentValue: currentValue,
            EntityTypeHint: entityTypeHint
        );
        reason = "";
        return true;
    }

    internal static AutoDraftTextDeleteCommitOutcome CommitAutoDraftTextDeleteExecuteTarget(
        object document,
        AutoDraftTextDeleteExecuteTarget target,
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
            return new AutoDraftTextDeleteCommitOutcome(
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
            return new AutoDraftTextDeleteCommitOutcome(
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
            return new AutoDraftTextDeleteCommitOutcome(
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
                $"Text delete target {target.TargetEntityId} resolved entity type '{entityType}', which does not match hint '{target.EntityTypeHint}'."
            );
        }

        if (!string.Equals(previousValue, target.CurrentValue, StringComparison.Ordinal))
        {
            return new AutoDraftTextDeleteCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason:
                    $"target entity '{target.TargetEntityId}' current value '{previousValue}' did not match expected '{target.CurrentValue}'.",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        try
        {
            ((dynamic)entity).Delete();
            try
            {
                ((dynamic)entity).Update();
            }
            catch (Exception updateEx)
            {
                warnings.Add(
                    $"Text delete target '{target.TargetEntityId}' update() raised: {updateEx.Message}"
                );
            }
        }
        catch (Exception ex)
        {
            return new AutoDraftTextDeleteCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"text delete failed for '{target.TargetEntityId}': {ex.Message}",
                Handle: GetEntityHandle(entity),
                EntityType: entityType,
                Updates: []
            );
        }

        var handle = GetEntityHandle(entity);
        return new AutoDraftTextDeleteCommitOutcome(
            Succeeded: true,
            WroteChanges: true,
            SkipReason: "",
            Handle: handle,
            EntityType: entityType,
            Updates:
            [
                new AutoDraftTextDeleteUpdateReceipt(
                    TargetEntityId: target.TargetEntityId,
                    EntityType: entityType,
                    PreviousValue: previousValue,
                    Handle: handle
                ),
            ]
        );
    }

    internal static JsonArray AutoDraftTextDeleteUpdatesToJsonArray(
        IReadOnlyCollection<AutoDraftTextDeleteUpdateReceipt> updates
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
                    ["handle"] = string.IsNullOrWhiteSpace(update.Handle) ? null : update.Handle,
                }
            );
        }
        return array;
    }
}
