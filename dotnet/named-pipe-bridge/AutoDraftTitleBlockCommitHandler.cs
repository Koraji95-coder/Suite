using System.Globalization;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    internal readonly record struct AutoDraftTitleBlockExecuteTarget(
        string FieldKey,
        IReadOnlyList<string> AttributeTags,
        string TargetValue,
        string BlockNameHint,
        string LayoutHint
    );

    internal readonly record struct AutoDraftTitleBlockUpdateReceipt(
        string FieldKey,
        string AttributeTag,
        string PreviousValue,
        string NextValue,
        string Handle
    );

    internal readonly record struct AutoDraftTitleBlockCommitOutcome(
        bool Succeeded,
        bool WroteChanges,
        string SkipReason,
        string Handle,
        int Updated,
        int Unchanged,
        int Missing,
        int Failed,
        IReadOnlyList<AutoDraftTitleBlockUpdateReceipt> TitleBlockUpdates
    );

    private readonly record struct AutoDraftTitleBlockSearchSpace(string LayoutName, object Container);

    internal static bool TryResolveAutoDraftTitleBlockExecuteTarget(
        JsonObject actionObject,
        out AutoDraftTitleBlockExecuteTarget target,
        out string reason
    )
    {
        target = default;
        reason = "missing execute_target metadata";

        var targetNode = ReadAutoDraftExecuteTargetNode(actionObject);
        if (targetNode is null)
        {
            return false;
        }

        var kind = ReadStringValue(targetNode, "kind", "").Trim().ToLowerInvariant();
        if (kind.Length <= 0)
        {
            kind = ReadStringValue(targetNode, "kind", "").Trim().ToLowerInvariant();
        }
        if (!string.Equals(kind, "title_block_attribute", StringComparison.OrdinalIgnoreCase))
        {
            reason = "execute_target.kind must be 'title_block_attribute'";
            return false;
        }

        var fieldKey = ReadFirstNonEmptyString(targetNode, "field_key", "fieldKey");
        if (string.IsNullOrWhiteSpace(fieldKey))
        {
            reason = "execute_target.field_key is required";
            return false;
        }

        var attributeTags = ReadExecuteTargetAttributeTags(targetNode);
        if (attributeTags.Count <= 0)
        {
            reason = "execute_target.attribute_tags must contain at least one tag";
            return false;
        }

        if (!TryReadRequiredString(targetNode, "target_value", "targetValue", out var targetValue))
        {
            reason = "execute_target.target_value is required";
            return false;
        }

        target = new AutoDraftTitleBlockExecuteTarget(
            FieldKey: fieldKey.Trim(),
            AttributeTags: attributeTags,
            TargetValue: targetValue,
            BlockNameHint: ReadFirstNonEmptyString(targetNode, "block_name_hint", "blockNameHint"),
            LayoutHint: ReadFirstNonEmptyString(targetNode, "layout_hint", "layoutHint")
        );
        reason = "";
        return true;
    }

    internal static AutoDraftTitleBlockCommitOutcome CommitAutoDraftTitleBlockExecuteTarget(
        object document,
        AutoDraftTitleBlockExecuteTarget target,
        List<string>? warnings = null
    )
    {
        warnings ??= new List<string>();

        var searchSpaces = ResolveAutoDraftTitleBlockSearchSpaces(document, target, warnings);
        if (searchSpaces.Count <= 0)
        {
            var layoutReason = string.IsNullOrWhiteSpace(target.LayoutHint)
                ? "No paper-space layout was available for title block updates."
                : $"Layout '{target.LayoutHint}' was not found for title block updates.";
            return new AutoDraftTitleBlockCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: layoutReason,
                Handle: "",
                Updated: 0,
                Unchanged: 0,
                Missing: target.AttributeTags.Count,
                Failed: 0,
                TitleBlockUpdates: []
            );
        }

        var matches = new List<(
            int Score,
            AutoDraftTitleBlockSearchSpace SearchSpace,
            object Entity,
            string Handle,
            string BlockName,
            Dictionary<string, object> AttributesByTag
        )>();

        foreach (var searchSpace in searchSpaces)
        {
            foreach (var entity in EnumerateAutoDraftTitleBlockEntities(searchSpace.Container))
            {
                var objectName = SafeUpper(ReadProperty(entity, "ObjectName"));
                if (!objectName.Contains("BLOCKREFERENCE", StringComparison.Ordinal))
                {
                    continue;
                }

                var blockName = ReadAutoDraftBlockName(entity);
                if (!MatchesAutoDraftTitleBlockNameHint(blockName, target.BlockNameHint))
                {
                    continue;
                }

                var attributesByTag = ReadEntityAttributesByTag(entity);
                if (attributesByTag.Count <= 0)
                {
                    continue;
                }

                var matchingTagCount = target.AttributeTags.Count(tag => attributesByTag.ContainsKey(tag));
                if (matchingTagCount <= 0)
                {
                    continue;
                }

                var score = matchingTagCount * 10;
                if (!string.IsNullOrWhiteSpace(target.BlockNameHint))
                {
                    score += GetAutoDraftTitleBlockHintScore(blockName, target.BlockNameHint);
                }

                matches.Add(
                    (
                        Score: score,
                        SearchSpace: searchSpace,
                        Entity: entity,
                        Handle: GetEntityHandle(entity),
                        BlockName: blockName,
                        AttributesByTag: attributesByTag
                    )
                );
            }
        }

        if (matches.Count <= 0)
        {
            return new AutoDraftTitleBlockCommitOutcome(
                Succeeded: false,
                WroteChanges: false,
                SkipReason: BuildMissingAutoDraftTitleBlockReason(target),
                Handle: "",
                Updated: 0,
                Unchanged: 0,
                Missing: target.AttributeTags.Count,
                Failed: 0,
                TitleBlockUpdates: []
            );
        }

        var selected = matches
            .OrderByDescending(item => item.Score)
            .ThenBy(
                item => item.SearchSpace.LayoutName,
                StringComparer.OrdinalIgnoreCase
            )
            .First();

        if (matches.Count > 1)
        {
            warnings.Add(
                $"Multiple title block candidates matched field '{target.FieldKey}'. " +
                $"Using {(string.IsNullOrWhiteSpace(selected.Handle) ? "the first match" : $"handle {selected.Handle}")} " +
                $"in layout '{selected.SearchSpace.LayoutName}'."
            );
        }

        var updated = 0;
        var unchanged = 0;
        var missing = 0;
        var failed = 0;
        var receipts = new List<AutoDraftTitleBlockUpdateReceipt>();

        foreach (var attributeTag in target.AttributeTags)
        {
            if (!selected.AttributesByTag.TryGetValue(attributeTag, out var attribute))
            {
                missing += 1;
                continue;
            }

            var previousValue = TryReadRawStringProperty(attribute, "TextString") ?? "";
            if (string.Equals(previousValue, target.TargetValue, StringComparison.Ordinal))
            {
                unchanged += 1;
                continue;
            }

            try
            {
                ((dynamic)attribute).TextString = target.TargetValue;
                try
                {
                    ((dynamic)attribute).Update();
                }
                catch (Exception updateEx)
                {
                    warnings.Add(
                        $"Title block attribute '{attributeTag}' update() raised: {updateEx.Message}"
                    );
                }

                updated += 1;
                receipts.Add(
                    new AutoDraftTitleBlockUpdateReceipt(
                        FieldKey: target.FieldKey,
                        AttributeTag: attributeTag,
                        PreviousValue: previousValue,
                        NextValue: target.TargetValue,
                        Handle: selected.Handle
                    )
                );
            }
            catch (Exception ex)
            {
                failed += 1;
                warnings.Add(
                    $"Title block attribute '{attributeTag}' write failed: {ex.Message}"
                );
            }
        }

        if (updated > 0)
        {
            try
            {
                ((dynamic)selected.Entity).Update();
            }
            catch (Exception ex)
            {
                warnings.Add(
                    $"Title block entity update() raised for field '{target.FieldKey}': {ex.Message}"
                );
            }
        }

        var skipReason = "";
        if (updated <= 0)
        {
            if (failed > 0)
            {
                skipReason = $"title block update failed for field '{target.FieldKey}'";
            }
            else if (unchanged > 0 && missing <= 0)
            {
                skipReason = $"title block attribute values already matched field '{target.FieldKey}'";
            }
            else if (missing > 0 && unchanged <= 0)
            {
                skipReason = $"requested title block attribute tags were not present for field '{target.FieldKey}'";
            }
            else
            {
                skipReason = $"title block update produced no writes for field '{target.FieldKey}'";
            }
        }

        return new AutoDraftTitleBlockCommitOutcome(
            Succeeded: updated > 0 || unchanged > 0,
            WroteChanges: updated > 0,
            SkipReason: skipReason,
            Handle: selected.Handle,
            Updated: updated,
            Unchanged: unchanged,
            Missing: missing,
            Failed: failed,
            TitleBlockUpdates: receipts
        );
    }

    internal static JsonArray AutoDraftTitleBlockUpdatesToJsonArray(
        IReadOnlyCollection<AutoDraftTitleBlockUpdateReceipt> updates
    )
    {
        var node = new JsonArray();
        foreach (var update in updates)
        {
            node.Add(
                new JsonObject
                {
                    ["fieldKey"] = update.FieldKey,
                    ["attributeTag"] = update.AttributeTag,
                    ["previousValue"] = update.PreviousValue,
                    ["nextValue"] = update.NextValue,
                    ["handle"] = string.IsNullOrWhiteSpace(update.Handle) ? null : update.Handle,
                }
            );
        }
        return node;
    }

    private static JsonObject? ReadAutoDraftExecuteTargetNode(JsonObject actionObject)
    {
        if (actionObject.TryGetPropertyValue("execute_target", out var executeTargetNode)
            && executeTargetNode is JsonObject executeTargetObject)
        {
            return executeTargetObject;
        }

        if (actionObject.TryGetPropertyValue("executeTarget", out var executeTargetCamelNode)
            && executeTargetCamelNode is JsonObject executeTargetCamelObject)
        {
            return executeTargetCamelObject;
        }

        var markupMeta = actionObject["markup"]?["meta"] as JsonObject;
        if (markupMeta is not null
            && markupMeta.TryGetPropertyValue("execute_target", out var nestedNode)
            && nestedNode is JsonObject nestedObject)
        {
            return nestedObject;
        }

        if (markupMeta is not null
            && markupMeta.TryGetPropertyValue("executeTarget", out var nestedCamelNode)
            && nestedCamelNode is JsonObject nestedCamelObject)
        {
            return nestedCamelObject;
        }

        return null;
    }

    private static List<string> ReadExecuteTargetAttributeTags(JsonObject targetNode)
    {
        var tags = ReadStringArray(targetNode, "attribute_tags");
        if (tags.Count <= 0)
        {
            tags = ReadStringArray(targetNode, "attributeTags");
        }

        return tags
            .Select(item => item.Trim().ToUpperInvariant())
            .Where(item => item.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool TryReadRequiredString(
        JsonObject payload,
        string key,
        string fallbackKey,
        out string value
    )
    {
        value = "";
        if (TryReadRawJsonString(payload, key, out value))
        {
            return true;
        }
        return TryReadRawJsonString(payload, fallbackKey, out value);
    }

    private static bool TryReadRawJsonString(JsonObject payload, string key, out string value)
    {
        value = "";
        if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonValue valueNode)
        {
            return false;
        }

        if (!valueNode.TryGetValue<string>(out var text))
        {
            return false;
        }

        value = text ?? "";
        return true;
    }

    private static string ReadFirstNonEmptyString(JsonObject payload, string key, string fallbackKey)
    {
        var primary = ReadStringValue(payload, key, "");
        if (!string.IsNullOrWhiteSpace(primary))
        {
            return primary;
        }
        return ReadStringValue(payload, fallbackKey, "");
    }

    private static List<AutoDraftTitleBlockSearchSpace> ResolveAutoDraftTitleBlockSearchSpaces(
        object document,
        AutoDraftTitleBlockExecuteTarget target,
        List<string> warnings
    )
    {
        var spaces = new List<AutoDraftTitleBlockSearchSpace>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(target.LayoutHint))
        {
            var hintedLayout = FindAutoDraftLayoutByName(document, target.LayoutHint);
            if (hintedLayout is null)
            {
                return spaces;
            }

            if (TryResolveAutoDraftLayoutBlock(document, hintedLayout, out var blockContainer, out var layoutName))
            {
                spaces.Add(new AutoDraftTitleBlockSearchSpace(layoutName, blockContainer));
            }
            return spaces;
        }

        var activeLayout = ReadProperty(document, "ActiveLayout");
        if (activeLayout is not null
            && TryResolveAutoDraftLayoutBlock(document, activeLayout, out var activeBlock, out var activeLayoutName)
            && seen.Add(activeLayoutName))
        {
            spaces.Add(new AutoDraftTitleBlockSearchSpace(activeLayoutName, activeBlock));
        }

        foreach (var layout in EnumerateAutoDraftLayouts(document))
        {
            if (!TryResolveAutoDraftLayoutBlock(document, layout, out var blockContainer, out var layoutName))
            {
                continue;
            }

            if (seen.Add(layoutName))
            {
                spaces.Add(new AutoDraftTitleBlockSearchSpace(layoutName, blockContainer));
            }
        }

        if (spaces.Count <= 0)
        {
            var paperSpace = ReadProperty(document, "PaperSpace");
            if (paperSpace is not null)
            {
                spaces.Add(new AutoDraftTitleBlockSearchSpace("PaperSpace", paperSpace));
            }
        }

        return spaces;
    }

    private static object? FindAutoDraftLayoutByName(object document, string layoutHint)
    {
        var layouts = ReadProperty(document, "Layouts");
        if (layouts is not null)
        {
            try
            {
                var fromLookup = ReadWithTransientComRetry(
                    () => ((dynamic)layouts).Item(layoutHint),
                    $"Layouts.Item({layoutHint})"
                );
                if (fromLookup is not null)
                {
                    return fromLookup;
                }
            }
            catch
            {
                // Fall back to enumeration below.
            }
        }

        foreach (var layout in EnumerateAutoDraftLayouts(document))
        {
            var name = StringOrDefault(ReadProperty(layout, "Name"), "");
            if (string.Equals(name, layoutHint, StringComparison.OrdinalIgnoreCase))
            {
                return layout;
            }
        }
        return null;
    }

    private static IEnumerable<object> EnumerateAutoDraftLayouts(object document)
    {
        var layouts = ReadProperty(document, "Layouts");
        if (layouts is null)
        {
            yield break;
        }

        var count = ReadCount(layouts);
        for (var index = 0; index < count; index++)
        {
            var layout = ReadItem(layouts, index);
            if (layout is not null)
            {
                yield return layout;
            }
        }
    }

    private static bool TryResolveAutoDraftLayoutBlock(
        object document,
        object layout,
        out object blockContainer,
        out string layoutName
    )
    {
        blockContainer = document;
        layoutName = StringOrDefault(ReadProperty(layout, "Name"), "");
        if (string.IsNullOrWhiteSpace(layoutName) || IsAutoDraftModelLayout(layoutName))
        {
            return false;
        }

        var block = ReadProperty(layout, "Block");
        if (block is not null)
        {
            blockContainer = block;
            return true;
        }

        var paperSpace = ReadProperty(document, "PaperSpace");
        if (paperSpace is not null)
        {
            blockContainer = paperSpace;
            return true;
        }

        return false;
    }

    private static bool IsAutoDraftModelLayout(string layoutName)
    {
        return string.Equals((layoutName ?? "").Trim(), "MODEL", StringComparison.OrdinalIgnoreCase);
    }

    private static IEnumerable<object> EnumerateAutoDraftTitleBlockEntities(object container)
    {
        var count = ReadCount(container);
        for (var index = 0; index < count; index++)
        {
            var entity = ReadItem(container, index);
            if (entity is not null)
            {
                yield return entity;
            }
        }
    }

    private static string ReadAutoDraftBlockName(object entity)
    {
        var effectiveName = StringOrDefault(ReadProperty(entity, "EffectiveName"), "");
        if (!string.IsNullOrWhiteSpace(effectiveName))
        {
            return effectiveName;
        }
        return StringOrDefault(ReadProperty(entity, "Name"), "");
    }

    private static bool MatchesAutoDraftTitleBlockNameHint(string blockName, string blockNameHint)
    {
        if (string.IsNullOrWhiteSpace(blockNameHint))
        {
            return true;
        }

        var normalizedBlockName = NormalizeAutoDraftName(blockName);
        if (normalizedBlockName.Length <= 0)
        {
            return true;
        }

        foreach (var normalizedHint in EnumerateAutoDraftNameHints(blockNameHint))
        {
            if (string.Equals(normalizedBlockName, normalizedHint, StringComparison.Ordinal)
                || normalizedBlockName.Contains(normalizedHint, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    private static int GetAutoDraftTitleBlockHintScore(string blockName, string blockNameHint)
    {
        var normalizedBlockName = NormalizeAutoDraftName(blockName);
        if (normalizedBlockName.Length <= 0)
        {
            return 0;
        }

        var bestScore = 0;
        foreach (var normalizedHint in EnumerateAutoDraftNameHints(blockNameHint))
        {
            if (string.Equals(normalizedBlockName, normalizedHint, StringComparison.Ordinal))
            {
                bestScore = Math.Max(bestScore, 50);
                continue;
            }

            if (normalizedBlockName.Contains(normalizedHint, StringComparison.Ordinal))
            {
                bestScore = Math.Max(bestScore, 20);
            }
        }

        return bestScore;
    }

    private static IEnumerable<string> EnumerateAutoDraftNameHints(string blockNameHint)
    {
        if (string.IsNullOrWhiteSpace(blockNameHint))
        {
            yield break;
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var rawPart in blockNameHint.Split([',', ';', '|'], StringSplitOptions.RemoveEmptyEntries))
        {
            var normalizedHint = NormalizeAutoDraftName(rawPart);
            if (normalizedHint.Length <= 0 || !seen.Add(normalizedHint))
            {
                continue;
            }

            yield return normalizedHint;
        }
    }

    private static string NormalizeAutoDraftName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }

        var builder = new System.Text.StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(char.ToUpperInvariant(ch));
            }
        }
        return builder.ToString();
    }

    private static Dictionary<string, object> ReadEntityAttributesByTag(object entity)
    {
        var attrsByTag = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        object? rawAttrs;
        try
        {
            rawAttrs = ReadWithTransientComRetry(
                () => ((dynamic)entity).GetAttributes(),
                "GetAttributes"
            );
        }
        catch
        {
            rawAttrs = null;
        }

        if (rawAttrs is null)
        {
            return attrsByTag;
        }

        if (rawAttrs is Array attrArray)
        {
            foreach (var entry in attrArray)
            {
                if (entry is not null)
                {
                    AddAttributeReferenceByTag(attrsByTag, entry);
                }
            }
            return attrsByTag;
        }

        var attrCount = ReadCount(rawAttrs);
        for (var attrIndex = 0; attrIndex < attrCount; attrIndex++)
        {
            var entry = ReadItem(rawAttrs, attrIndex);
            if (entry is not null)
            {
                AddAttributeReferenceByTag(attrsByTag, entry);
            }
        }

        return attrsByTag;
    }

    private static void AddAttributeReferenceByTag(Dictionary<string, object> attrsByTag, object attribute)
    {
        var tag = SafeUpper(ReadProperty(attribute, "TagString"));
        if (!string.IsNullOrWhiteSpace(tag))
        {
            attrsByTag[tag] = attribute;
        }
    }

    private static string? TryReadRawStringProperty(object target, string propertyName)
    {
        var value = ReadProperty(target, propertyName);
        return value?.ToString() ?? "";
    }

    private static string BuildMissingAutoDraftTitleBlockReason(
        AutoDraftTitleBlockExecuteTarget target
    )
    {
        var details = new List<string>();
        if (!string.IsNullOrWhiteSpace(target.LayoutHint))
        {
            details.Add($"layout '{target.LayoutHint}'");
        }
        if (!string.IsNullOrWhiteSpace(target.BlockNameHint))
        {
            details.Add($"block '{target.BlockNameHint}'");
        }
        details.Add($"field '{target.FieldKey}'");

        return $"No matching title block attribute target was found for {string.Join(", ", details)}.";
    }
}
