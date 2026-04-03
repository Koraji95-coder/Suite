using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;

namespace SuiteCadAuthoring
{
    public sealed partial class SuiteCadAuthoringCommands
    {
        internal static JsonObject ExecuteConduitRouteTerminalLabelsSync(JsonObject payload)
        {
            var requestId = ReadConduitString(payload, "requestId");
            var document = Application.DocumentManager?.MdiActiveDocument;
            if (document is null)
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_labels_sync",
                    code: "AUTOCAD_NOT_READY",
                    message: "An active AutoCAD drawing is required for conduit route terminal label sync.",
                    requestId: requestId
                );
            }

            var selectionOnly = ReadConduitBool(payload, "selectionOnly", fallback: false);
            var includeModelspace = ReadConduitBool(payload, "includeModelspace", fallback: true);
            var maxEntities = ClampConduitInt(
                ReadConduitInt(payload, "maxEntities", 50000),
                100,
                250000
            );
            var terminalProfile = ReadConduitTerminalProfile(payload);
            var targetStripLabels = BuildConduitTargetStripLabelMap(
                payload,
                terminalProfile.DefaultTerminalCount
            );
            var targetStripIds = targetStripLabels.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var unresolvedTargetIds = targetStripIds.ToHashSet(StringComparer.OrdinalIgnoreCase);

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

            try
            {
                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    List<string>? DesiredLabelsForStrip(string stripId, int terminalCount)
                    {
                        if (targetStripLabels.Count > 0)
                        {
                            if (!targetStripLabels.TryGetValue(stripId, out var labels))
                            {
                                return null;
                            }

                            return NormalizeConduitTerminalLabelValues(labels, terminalCount);
                        }

                        return NormalizeConduitTerminalLabelValues(null, terminalCount);
                    }

                    void TrySyncEntity(Entity entity)
                    {
                        scannedEntities += 1;
                        var handle = ResolveConduitEntityHandle(entity);
                        if (!string.IsNullOrWhiteSpace(handle) && !seenEntityHandles.Add(handle))
                        {
                            return;
                        }

                        if (entity is not BlockReference blockReference)
                        {
                            skippedNonBlockEntities += 1;
                            return;
                        }

                        scannedBlockReferences += 1;
                        var attrs = ReadConduitAttributeMap(blockReference, transaction);
                        var blockName = ReadConduitBlockName(blockReference, transaction);
                        if (LooksLikeConduitJumperBlock(blockName, attrs))
                        {
                            skippedNonTerminalBlocks += 1;
                            return;
                        }

                        if (!LooksLikeConduitTerminalBlock(blockName, attrs, terminalProfile))
                        {
                            skippedNonTerminalBlocks += 1;
                            return;
                        }

                        terminalCandidateBlocks += 1;
                        var stripId = FirstConduitAttr(attrs, terminalProfile.StripIdKeys)
                            .ToUpperInvariant();
                        if (string.IsNullOrWhiteSpace(stripId))
                        {
                            skippedNonTerminalBlocks += 1;
                            return;
                        }

                        var terminalCount = ParseConduitTerminalCount(
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

                        var writeResult = WriteConduitTerminalLabels(
                            blockReference,
                            transaction,
                            desiredLabels
                        );
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
                        foreach (var entity in EnumerateConduitSelectionEntities(document, transaction))
                        {
                            TrySyncEntity(entity);
                        }
                    }

                    if (includeModelspace)
                    {
                        var modelSpace = GetConduitModelSpace(transaction, document.Database);
                        var scannedCount = 0;
                        var totalModelspaceCount = 0;
                        foreach (ObjectId entityId in modelSpace)
                        {
                            totalModelspaceCount += 1;
                            if (scannedCount >= maxEntities)
                            {
                                continue;
                            }

                            if (
                                transaction.GetObject(entityId, OpenMode.ForRead, false) is Entity entity
                            )
                            {
                                TrySyncEntity(entity);
                                scannedCount += 1;
                            }
                        }

                        if (totalModelspaceCount > maxEntities)
                        {
                            warnings.Add(
                                $"ModelSpace scan capped at {maxEntities} entities (of {totalModelspaceCount})."
                            );
                        }
                    }

                    transaction.Commit();
                }
            }
            catch (Exception ex)
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_labels_sync",
                    code: "TERMINAL_LABEL_SYNC_FAILED",
                    message: $"Conduit route terminal label sync failed: {ex.Message}",
                    requestId: requestId
                );
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
            var code = string.Empty;
            var message = string.Empty;
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

            return BuildConduitRouteResult(
                action: "conduit_route_terminal_labels_sync",
                success: success,
                code: code,
                message: message,
                data: new JsonObject
                {
                    ["drawing"] = new JsonObject
                    {
                        ["name"] = ResolveConduitDrawingName(document),
                        ["units"] = ResolveConduitUnits(document.Database),
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
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta =>
                {
                    meta["scanMs"] = 0;
                    meta["scannedEntities"] = scannedEntities;
                    meta["scannedBlockReferences"] = scannedBlockReferences;
                    meta["skippedNonBlockEntities"] = skippedNonBlockEntities;
                    meta["skippedNonTerminalBlocks"] = skippedNonTerminalBlocks;
                    meta["terminalCandidateBlocks"] = terminalCandidateBlocks;
                    meta["selectionOnly"] = selectionOnly;
                    meta["includeModelspace"] = includeModelspace;
                    meta["terminalProfile"] = ConduitTerminalProfileToJson(terminalProfile);
                }
            );
        }

        private static Dictionary<string, List<string>> BuildConduitTargetStripLabelMap(
            JsonObject payload,
            int defaultTerminalCount
        )
        {
            var target = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            if (payload["strips"] is not JsonArray stripsArray)
            {
                return target;
            }

            foreach (var stripNode in stripsArray)
            {
                if (stripNode is not JsonObject stripObject)
                {
                    continue;
                }

                var stripId = ReadConduitString(stripObject, "stripId");
                if (string.IsNullOrWhiteSpace(stripId))
                {
                    stripId = ReadConduitString(stripObject, "strip_id");
                }

                stripId = stripId.Trim().ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(stripId))
                {
                    continue;
                }

                var terminalCount = ReadConduitInt(stripObject, "terminalCount", int.MinValue);
                if (terminalCount == int.MinValue)
                {
                    terminalCount = ReadConduitInt(stripObject, "terminal_count", int.MinValue);
                }

                var labels = ReadConduitLabelValues(stripObject, "labels");
                if (terminalCount <= 0)
                {
                    terminalCount = labels.Count > 0 ? labels.Count : defaultTerminalCount;
                }

                target[stripId] = NormalizeConduitTerminalLabelValues(labels, terminalCount);
            }

            return target;
        }

        private static List<string> ReadConduitLabelValues(JsonObject payload, string key)
        {
            var values = new List<string>();
            if (payload[key] is not JsonArray array)
            {
                return values;
            }

            foreach (var entry in array)
            {
                if (entry is JsonValue value && value.TryGetValue<string>(out var text))
                {
                    values.Add((text ?? string.Empty).Trim());
                }
            }

            return values;
        }
    }
}
