using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    internal readonly record struct AutoDraftTextSwapExecuteTarget(
        string FirstTargetEntityId,
        string FirstCurrentValue,
        string SecondTargetEntityId,
        string SecondCurrentValue,
        string EntityTypeHint
    );

    internal readonly record struct AutoDraftTextSwapUpdateReceipt(
        string Slot,
        string TargetEntityId,
        string EntityType,
        string PreviousValue,
        string NextValue,
        string Handle
    );

    internal readonly record struct AutoDraftTextSwapCommitOutcome(
        bool Succeeded,
        bool WroteChanges,
        string SkipReason,
        IReadOnlyList<string> Handles,
        IReadOnlyList<AutoDraftTextSwapUpdateReceipt> Updates
    );

    internal static bool TryResolveAutoDraftTextSwapExecuteTarget(
        JsonObject actionObject,
        out AutoDraftTextSwapExecuteTarget target,
        out string reason
    )
    {
        target = default;
        reason = "missing text swap execute_target metadata";

        if (!actionObject.TryGetPropertyValue("execute_target", out var targetNode) || targetNode is not JsonObject targetObject)
        {
            return false;
        }

        var kind = ReadStringValue(targetObject, "kind", "").Trim();
        if (!string.Equals(kind, "text_swap", StringComparison.OrdinalIgnoreCase))
        {
            reason = "execute_target.kind must be 'text_swap'";
            return false;
        }

        var firstTargetEntityId = ReadStringValue(targetObject, "first_target_entity_id", "").Trim();
        var secondTargetEntityId = ReadStringValue(targetObject, "second_target_entity_id", "").Trim();
        if (string.IsNullOrWhiteSpace(firstTargetEntityId) || string.IsNullOrWhiteSpace(secondTargetEntityId))
        {
            reason = "execute_target first/second target ids are required";
            return false;
        }

        if (string.Equals(firstTargetEntityId, secondTargetEntityId, StringComparison.OrdinalIgnoreCase))
        {
            reason = "execute_target first/second target ids must be distinct";
            return false;
        }

        var firstCurrentValue = ReadStringValue(targetObject, "first_current_value", "").Trim();
        var secondCurrentValue = ReadStringValue(targetObject, "second_current_value", "").Trim();
        var entityTypeHint = ReadStringValue(targetObject, "entity_type_hint", "").Trim();
        if (string.IsNullOrWhiteSpace(entityTypeHint))
        {
            entityTypeHint = ReadStringValue(targetObject, "entity_type", "").Trim();
        }

        target = new AutoDraftTextSwapExecuteTarget(
            FirstTargetEntityId: firstTargetEntityId.ToUpperInvariant(),
            FirstCurrentValue: firstCurrentValue,
            SecondTargetEntityId: secondTargetEntityId.ToUpperInvariant(),
            SecondCurrentValue: secondCurrentValue,
            EntityTypeHint: entityTypeHint
        );
        reason = "";
        return true;
    }

    internal static AutoDraftTextSwapCommitOutcome CommitAutoDraftTextSwapExecuteTarget(
        object document,
        AutoDraftTextSwapExecuteTarget target,
        List<string> warnings
    )
    {
        if (string.Equals(target.FirstTargetEntityId, target.SecondTargetEntityId, StringComparison.OrdinalIgnoreCase))
        {
            return new AutoDraftTextSwapCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: "text swap targets must be distinct.",
                Handles: [],
                Updates: []
            );
        }

        if (!TryResolveTextSwapEntity(
                document,
                target.FirstTargetEntityId,
                target.EntityTypeHint,
                target.FirstCurrentValue,
                warnings,
                out var firstEntity,
                out var firstEntityType,
                out var firstPreviousValue,
                out var firstHandle,
                out var firstReason
            ))
        {
            return new AutoDraftTextSwapCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: firstReason,
                Handles: string.IsNullOrWhiteSpace(firstHandle) ? [] : [firstHandle],
                Updates: []
            );
        }

        if (!TryResolveTextSwapEntity(
                document,
                target.SecondTargetEntityId,
                target.EntityTypeHint,
                target.SecondCurrentValue,
                warnings,
                out var secondEntity,
                out var secondEntityType,
                out var secondPreviousValue,
                out var secondHandle,
                out var secondReason
            ))
        {
            return new AutoDraftTextSwapCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: secondReason,
                Handles: string.IsNullOrWhiteSpace(secondHandle) ? [] : [secondHandle],
                Updates: []
            );
        }

        if (string.Equals(firstPreviousValue, secondPreviousValue, StringComparison.Ordinal))
        {
            return new AutoDraftTextSwapCommitOutcome(
                Succeeded: true,
                WroteChanges: false,
                SkipReason: "text swap targets already contain the same value.",
                Handles: new[] { firstHandle, secondHandle }.Where(value => !string.IsNullOrWhiteSpace(value)).ToArray(),
                Updates: []
            );
        }

        try
        {
            ((dynamic)firstEntity!).TextString = secondPreviousValue;
            ((dynamic)secondEntity!).TextString = firstPreviousValue;
            TryUpdateTextSwapEntity(firstEntity, target.FirstTargetEntityId, warnings);
            TryUpdateTextSwapEntity(secondEntity, target.SecondTargetEntityId, warnings);
        }
        catch (Exception ex)
        {
            return new AutoDraftTextSwapCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: $"text swap failed: {ex.Message}",
                Handles: new[] { firstHandle, secondHandle }.Where(value => !string.IsNullOrWhiteSpace(value)).ToArray(),
                Updates: []
            );
        }

        return new AutoDraftTextSwapCommitOutcome(
            Succeeded: true,
            WroteChanges: true,
            SkipReason: "",
            Handles: new[] { firstHandle, secondHandle }.Where(value => !string.IsNullOrWhiteSpace(value)).ToArray(),
            Updates:
            [
                new AutoDraftTextSwapUpdateReceipt(
                    Slot: "first",
                    TargetEntityId: target.FirstTargetEntityId,
                    EntityType: firstEntityType,
                    PreviousValue: firstPreviousValue,
                    NextValue: secondPreviousValue,
                    Handle: firstHandle
                ),
                new AutoDraftTextSwapUpdateReceipt(
                    Slot: "second",
                    TargetEntityId: target.SecondTargetEntityId,
                    EntityType: secondEntityType,
                    PreviousValue: secondPreviousValue,
                    NextValue: firstPreviousValue,
                    Handle: secondHandle
                ),
            ]
        );
    }

    internal static JsonArray AutoDraftTextSwapUpdatesToJsonArray(
        IReadOnlyCollection<AutoDraftTextSwapUpdateReceipt> updates
    )
    {
        var array = new JsonArray();
        foreach (var update in updates)
        {
            array.Add(
                new JsonObject
                {
                    ["slot"] = update.Slot,
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

    private static bool TryResolveTextSwapEntity(
        object document,
        string targetEntityId,
        string entityTypeHint,
        string expectedCurrentValue,
        List<string> warnings,
        out object? entity,
        out string entityType,
        out string previousValue,
        out string handle,
        out string reason
    )
    {
        entity = null;
        entityType = "";
        previousValue = "";
        handle = "";
        reason = "";

        try
        {
            entity = ((dynamic)document).HandleToObject(targetEntityId);
        }
        catch (Exception ex)
        {
            reason = $"target entity '{targetEntityId}' was not found: {ex.Message}";
            return false;
        }

        if (entity is null)
        {
            reason = $"target entity '{targetEntityId}' was not found.";
            return false;
        }

        handle = GetEntityHandle(entity);
        entityType = StringOrDefault(ReadProperty(entity, "ObjectName"), "").Trim();
        previousValue = TryReadRawStringProperty(entity, "TextString") ?? "";
        if (string.IsNullOrWhiteSpace(previousValue) && TryReadRawStringProperty(entity, "Text") is string textValue)
        {
            previousValue = textValue;
        }

        if (string.IsNullOrWhiteSpace(previousValue))
        {
            reason = $"target entity '{targetEntityId}' does not expose writable text content.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(entityTypeHint)
            && !string.IsNullOrWhiteSpace(entityType)
            && entityType.IndexOf(entityTypeHint, StringComparison.OrdinalIgnoreCase) < 0)
        {
            warnings.Add(
                $"Text swap target {targetEntityId} resolved entity type '{entityType}', which does not match hint '{entityTypeHint}'."
            );
        }

        if (!string.IsNullOrWhiteSpace(expectedCurrentValue)
            && !string.Equals(previousValue, expectedCurrentValue, StringComparison.Ordinal))
        {
            reason =
                $"target entity '{targetEntityId}' current value '{previousValue}' did not match expected '{expectedCurrentValue}'.";
            return false;
        }

        return true;
    }

    private static void TryUpdateTextSwapEntity(
        object? entity,
        string targetEntityId,
        List<string> warnings
    )
    {
        if (entity is null)
        {
            return;
        }

        try
        {
            ((dynamic)entity).Update();
        }
        catch (Exception updateEx)
        {
            warnings.Add(
                $"Text swap target '{targetEntityId}' update() raised: {updateEx.Message}"
            );
        }
    }
}
