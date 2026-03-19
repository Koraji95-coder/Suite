using System.Diagnostics;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    public static JsonObject HandleTerminalLabelsSync(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();

        var selectionOnly = ReadBool(payload, "selectionOnly", fallback: false);
        var includeModelspace = ReadBool(payload, "includeModelspace", fallback: true);
        var maxEntities = ClampInt(ReadInt(payload, "maxEntities", 50000), 100, 250000);
        var terminalProfile = ReadTerminalScanProfile(payload);
        var targetStripLabels = BuildTargetStripLabelMap(payload, terminalProfile.DefaultTerminalCount);
        var targetStripIds = targetStripLabels.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unresolvedTargetIds = targetStripIds.ToHashSet(StringComparer.OrdinalIgnoreCase);

        using var session = ConnectAutoCad();
        var drawingContext = ReadAutoCadDrawingContext(session);
        var drawingName = drawingContext.DrawingName;
        var units = ResolveUnits(session.Document);

        var warnings = new List<string>();
        var seenEntityHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var matchedStrips = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var updatedStrips = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var scannedEntities = 0;
        var scannedBlockReferences = 0;
        var skippedNonBlockEntities = 0;
        var skippedNonTerminalBlocks = 0;
        var terminalCandidateBlocks = 0;
        var matchedTerminalBlocks = 0;
        var updatedBlocks = 0;
        var updatedAttributes = 0;
        var unchangedAttributes = 0;
        var missingAttributes = 0;
        var failedAttributes = 0;

        List<string>? DesiredLabelsForStrip(string stripId, int terminalCount)
        {
            if (targetStripLabels.Count > 0)
            {
                if (!targetStripLabels.TryGetValue(stripId, out var stripLabels))
                {
                    return null;
                }
                return NormalizeTerminalLabelValues(stripLabels, terminalCount);
            }
            return NormalizeTerminalLabelValues(null, terminalCount);
        }

        void TrySyncEntity(object entity)
        {
            scannedEntities += 1;

            var handle = SafeUpper(ReadProperty(entity, "Handle"));
            if (!string.IsNullOrWhiteSpace(handle) && !seenEntityHandles.Add(handle))
            {
                return;
            }

            var objectName = SafeUpper(ReadProperty(entity, "ObjectName"));
            if (!objectName.Contains("BLOCKREFERENCE", StringComparison.Ordinal))
            {
                skippedNonBlockEntities += 1;
                return;
            }
            scannedBlockReferences += 1;

            var attrs = ReadAttributeMap(entity);
            var blockName = StringOrDefault(ReadProperty(entity, "EffectiveName"), "");
            if (string.IsNullOrWhiteSpace(blockName))
            {
                blockName = StringOrDefault(ReadProperty(entity, "Name"), "");
            }

            if (LooksLikeJumperBlock(blockName, attrs))
            {
                skippedNonTerminalBlocks += 1;
                return;
            }

            if (!LooksLikeTerminalBlock(blockName, attrs, terminalProfile))
            {
                skippedNonTerminalBlocks += 1;
                return;
            }
            terminalCandidateBlocks += 1;

            var stripId = FirstAttr(attrs, terminalProfile.StripIdKeys).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(stripId))
            {
                skippedNonTerminalBlocks += 1;
                return;
            }

            var terminalCount = ParseTerminalCount(
                attrs,
                terminalProfile.TerminalCountKeys,
                terminalProfile.DefaultTerminalCount
            );
            var desiredLabels = DesiredLabelsForStrip(stripId, terminalCount);
            if (desiredLabels is null)
            {
                return;
            }

            unresolvedTargetIds.Remove(stripId);
            matchedTerminalBlocks += 1;
            matchedStrips.Add(stripId);

            var writeResult = WriteTerminalLabelsToEntity(entity, desiredLabels);
            updatedAttributes += writeResult.Updated;
            unchangedAttributes += writeResult.Unchanged;
            missingAttributes += writeResult.Missing;
            failedAttributes += writeResult.Failed;

            if (writeResult.Updated > 0)
            {
                updatedBlocks += 1;
                updatedStrips.Add(stripId);
            }
        }

        if (selectionOnly)
        {
            foreach (var entity in EnumerateSelectionEntities(session.Document))
            {
                TrySyncEntity(entity);
            }
        }

        if (includeModelspace)
        {
            var modelspaceCount = ReadCount(session.Modelspace);
            var cappedCount = Math.Min(modelspaceCount, maxEntities);
            if (modelspaceCount > maxEntities)
            {
                warnings.Add($"ModelSpace scan capped at {maxEntities} entities (of {modelspaceCount}).");
            }
            for (var index = 0; index < cappedCount; index++)
            {
                var entity = ReadItem(session.Modelspace, index);
                if (entity is null)
                {
                    continue;
                }
                TrySyncEntity(entity);
            }
        }

        if (unresolvedTargetIds.Count > 0)
        {
            var unresolvedSample = string.Join(
                ", ",
                unresolvedTargetIds
                    .OrderBy(item => item, StringComparer.OrdinalIgnoreCase)
                    .Take(8)
            );
            warnings.Add(
                $"{unresolvedTargetIds.Count} target strip(s) were not matched in drawing: {unresolvedSample}"
            );
        }

        var success = true;
        var code = "";
        var message = "";
        if (targetStripIds.Count > 0 && matchedTerminalBlocks == 0)
        {
            success = false;
            code = "NO_TARGET_STRIPS_MATCHED";
            message = "No terminal strips matched requested label-sync targets.";
        }
        else if (terminalCandidateBlocks == 0)
        {
            success = false;
            code = "NO_TERMINAL_STRIPS_FOUND";
            message = "No terminal-strip block references were found for label sync.";
        }
        else
        {
            message =
                $"Processed {matchedTerminalBlocks} terminal block(s): " +
                $"{updatedBlocks} block(s) updated, {unchangedAttributes} attribute value(s) unchanged.";
        }

        try
        {
            ((dynamic)session.Document).Regen(1);
        }
        catch
        {
            // Ignore regen failures.
        }

        stopwatch.Stop();
        return new JsonObject
        {
            ["success"] = success,
            ["code"] = code,
            ["message"] = message,
            ["data"] = new JsonObject
            {
                ["drawing"] = new JsonObject
                {
                    ["name"] = drawingName,
                    ["units"] = units,
                },
                ["updatedStrips"] = updatedStrips.Count,
                ["matchedStrips"] = matchedStrips.Count,
                ["targetStrips"] = targetStripIds.Count,
                ["matchedBlocks"] = matchedTerminalBlocks,
                ["updatedBlocks"] = updatedBlocks,
                ["updatedAttributes"] = updatedAttributes,
                ["unchangedAttributes"] = unchangedAttributes,
                ["missingAttributes"] = missingAttributes,
                ["failedAttributes"] = failedAttributes,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["scanMs"] = stopwatch.ElapsedMilliseconds,
                ["scannedEntities"] = scannedEntities,
                ["scannedBlockReferences"] = scannedBlockReferences,
                ["skippedNonBlockEntities"] = skippedNonBlockEntities,
                ["skippedNonTerminalBlocks"] = skippedNonTerminalBlocks,
                ["terminalCandidateBlocks"] = terminalCandidateBlocks,
                ["selectionOnly"] = selectionOnly,
                ["includeModelspace"] = includeModelspace,
                ["terminalProfile"] = TerminalScanProfileToJson(terminalProfile),
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }
}

