using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;

namespace SuiteCadAuthoring
{
    public sealed partial class SuiteCadAuthoringCommands
    {
        internal static JsonObject ExecuteConduitRouteTerminalScan(JsonObject payload)
        {
            var requestId = ReadConduitString(payload, "requestId");
            var document = Application.DocumentManager?.MdiActiveDocument;
            if (document is null)
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_scan",
                    code: "AUTOCAD_NOT_READY",
                    message: "An active AutoCAD drawing is required for conduit route terminal scan.",
                    requestId: requestId
                );
            }

            var selectionOnly = ReadConduitBool(payload, "selectionOnly", fallback: false);
            var includeModelspace = ReadConduitBool(payload, "includeModelspace", fallback: true);
            var maxEntities = ClampConduitInt(
                ReadConduitInt(payload, "maxEntities", 50000),
                500,
                200000
            );
            var terminalProfile = ReadConduitTerminalProfile(payload);

            var warnings = new List<string>();
            var panels = new JsonObject();
            var jumpers = new List<ConduitJumperRecord>();
            var stripRecords = new List<ConduitStripScanRecord>();
            var pendingPositionalJumpers = new List<ConduitPendingPositionalJumperCandidate>();
            var seenEntityHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenStripIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenJumperSignatures = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var scannedEntities = 0;
            var scannedBlockReferences = 0;
            var skippedNonTerminalBlocks = 0;
            var jumperCandidateBlocks = 0;
            var skippedInvalidJumperBlocks = 0;
            var positionalJumperCandidates = 0;
            var resolvedPositionalJumpers = 0;
            var totalStrips = 0;
            var totalTerminals = 0;
            var totalJumpers = 0;
            var totalLabeledTerminals = 0;
            var totalGeometryPrimitives = 0;

            try
            {
                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    void ConsumeEntity(Entity entity)
                    {
                        scannedEntities += 1;
                        var handle = ResolveConduitEntityHandle(entity);
                        if (!string.IsNullOrWhiteSpace(handle) && !seenEntityHandles.Add(handle))
                        {
                            return;
                        }

                        if (entity is not BlockReference blockReference)
                        {
                            return;
                        }

                        scannedBlockReferences += 1;
                        var attrs = ReadConduitAttributeMap(blockReference, transaction);
                        var blockName = ReadConduitBlockName(blockReference, transaction);
                        if (LooksLikeConduitJumperBlock(blockName, attrs))
                        {
                            jumperCandidateBlocks += 1;
                            var jumper = TryParseConduitJumperRecord(
                                attrs,
                                blockName,
                                handle,
                                terminalProfile.DefaultPanelPrefix
                            );
                            if (jumper is null)
                            {
                                positionalJumperCandidates += 1;
                                pendingPositionalJumpers.Add(
                                    new ConduitPendingPositionalJumperCandidate
                                    {
                                        JumperId = FirstConduitAttr(attrs, ConduitJumperIdKeys).Trim(),
                                        PanelHint = FirstConduitAttr(attrs, ConduitJumperPanelIdKeys)
                                            .Trim()
                                            .ToUpperInvariant(),
                                        Handle = handle,
                                        BlockName = blockName,
                                        X = blockReference.Position.X,
                                        Y = blockReference.Position.Y,
                                    }
                                );
                                return;
                            }

                            var jumperSignature =
                                $"{jumper.PanelId}|{jumper.FromStripId}|{jumper.FromTerminal}|{jumper.ToStripId}|{jumper.ToTerminal}";
                            if (!seenJumperSignatures.Add(jumperSignature))
                            {
                                return;
                            }

                            jumpers.Add(jumper);
                            totalJumpers += 1;
                            return;
                        }

                        if (!LooksLikeConduitTerminalBlock(blockName, attrs, terminalProfile))
                        {
                            skippedNonTerminalBlocks += 1;
                            return;
                        }

                        var stripId = FirstConduitAttr(attrs, terminalProfile.StripIdKeys)
                            .ToUpperInvariant();
                        if (string.IsNullOrWhiteSpace(stripId))
                        {
                            stripId = string.IsNullOrWhiteSpace(blockName)
                                ? $"STRIP_{scannedBlockReferences}"
                                : blockName.ToUpperInvariant();
                        }

                        if (!seenStripIds.Add(stripId))
                        {
                            var suffix = 2;
                            var candidate = $"{stripId}_{suffix}";
                            while (!seenStripIds.Add(candidate))
                            {
                                suffix += 1;
                                candidate = $"{stripId}_{suffix}";
                            }

                            stripId = candidate;
                        }

                        var panelId = FirstConduitAttr(attrs, terminalProfile.PanelIdKeys)
                            .ToUpperInvariant();
                        if (string.IsNullOrWhiteSpace(panelId))
                        {
                            panelId = DeriveConduitPanelId(stripId);
                        }

                        if (string.IsNullOrWhiteSpace(panelId))
                        {
                            panelId = terminalProfile.DefaultPanelPrefix;
                        }

                        var panelName = FirstConduitAttr(attrs, terminalProfile.PanelNameKeys);
                        if (string.IsNullOrWhiteSpace(panelName))
                        {
                            panelName = panelId;
                        }

                        var side = NormalizeConduitSide(
                            FirstConduitAttr(attrs, terminalProfile.SideKeys)
                        );
                        var terminalCount = ParseConduitTerminalCount(
                            attrs,
                            terminalProfile.TerminalCountKeys,
                            terminalProfile.DefaultTerminalCount
                        );
                        var stripNumber = ParseConduitStripNumber(
                            stripId,
                            attrs,
                            terminalProfile.StripNumberKeys
                        );
                        var terminalLabels = ParseConduitTerminalLabels(attrs, terminalCount);
                        totalLabeledTerminals += terminalLabels.Count(
                            label => !string.IsNullOrWhiteSpace(label)
                        );

                        var geometry = BuildConduitGeometryPayload(blockReference);
                        totalGeometryPrimitives += geometry.GeometryCount;

                        var panelNode = panels[panelId] as JsonObject;
                        if (panelNode is null)
                        {
                            panelNode = new JsonObject
                            {
                                ["fullName"] = panelName,
                                ["color"] = ResolveConduitPanelColor(panelId),
                                ["sides"] = new JsonObject(),
                            };
                            panels[panelId] = panelNode;
                        }

                        var sideMap = panelNode["sides"] as JsonObject ?? new JsonObject();
                        panelNode["sides"] = sideMap;
                        var sideNode = sideMap[side] as JsonObject;
                        if (sideNode is null)
                        {
                            sideNode = new JsonObject
                            {
                                ["strips"] = new JsonArray(),
                            };
                            sideMap[side] = sideNode;
                        }

                        var strips = sideNode["strips"] as JsonArray ?? new JsonArray();
                        sideNode["strips"] = strips;
                        strips.Add(
                            new JsonObject
                            {
                                ["stripId"] = stripId,
                                ["stripNumber"] = stripNumber,
                                ["terminalCount"] = terminalCount,
                                ["terminalLabels"] = ToConduitJsonArray(terminalLabels),
                                ["geometry"] = geometry.Geometry,
                                ["x"] = blockReference.Position.X,
                                ["y"] = blockReference.Position.Y,
                            }
                        );

                        stripRecords.Add(
                            new ConduitStripScanRecord
                            {
                                PanelId = panelId,
                                Side = side,
                                StripId = stripId,
                                TerminalCount = terminalCount,
                                X = blockReference.Position.X,
                                Y = blockReference.Position.Y,
                                MinY = geometry.MinY,
                                MaxY = geometry.MaxY,
                            }
                        );

                        totalStrips += 1;
                        totalTerminals += terminalCount;
                    }

                    if (selectionOnly)
                    {
                        foreach (var entity in EnumerateConduitSelectionEntities(document, transaction))
                        {
                            ConsumeEntity(entity);
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
                                ConsumeEntity(entity);
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
                    action: "conduit_route_terminal_scan",
                    code: "TERMINAL_SCAN_FAILED",
                    message: $"Conduit route terminal scan failed: {ex.Message}",
                    requestId: requestId
                );
            }

            foreach (var pending in pendingPositionalJumpers)
            {
                var resolved = ResolveConduitPositionalJumperRecord(
                    pending,
                    stripRecords,
                    terminalProfile.DefaultPanelPrefix
                );
                if (resolved is null)
                {
                    skippedInvalidJumperBlocks += 1;
                    warnings.Add(
                        $"Skipping jumper block {(string.IsNullOrWhiteSpace(pending.BlockName) ? "<unknown>" : pending.BlockName)} (could not resolve nearest strip pair from insertion point)."
                    );
                    continue;
                }

                var jumperSignature =
                    $"{resolved.PanelId}|{resolved.FromStripId}|{resolved.FromTerminal}|{resolved.ToStripId}|{resolved.ToTerminal}";
                if (!seenJumperSignatures.Add(jumperSignature))
                {
                    continue;
                }

                jumpers.Add(resolved);
                totalJumpers += 1;
                resolvedPositionalJumpers += 1;
            }

            var success = totalStrips > 0;
            return BuildConduitRouteResult(
                action: "conduit_route_terminal_scan",
                success: success,
                code: success ? string.Empty : "NO_TERMINAL_STRIPS_FOUND",
                message: success
                    ? $"Scanned {scannedEntities} entities and found {totalStrips} terminal strips."
                    : "No terminal-strip block references were detected.",
                data: new JsonObject
                {
                    ["drawing"] = new JsonObject
                    {
                        ["name"] = ResolveConduitDrawingName(document),
                        ["units"] = ResolveConduitUnits(document.Database),
                    },
                    ["panels"] = panels,
                    ["jumpers"] = BuildConduitJumpersJson(jumpers),
                },
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta =>
                {
                    meta["scanMs"] = 0;
                    meta["scannedEntities"] = scannedEntities;
                    meta["scannedBlockReferences"] = scannedBlockReferences;
                    meta["skippedNonTerminalBlocks"] = skippedNonTerminalBlocks;
                    meta["jumperCandidateBlocks"] = jumperCandidateBlocks;
                    meta["skippedInvalidJumperBlocks"] = skippedInvalidJumperBlocks;
                    meta["positionalJumperCandidates"] = positionalJumperCandidates;
                    meta["resolvedPositionalJumpers"] = resolvedPositionalJumpers;
                    meta["selectionOnly"] = selectionOnly;
                    meta["includeModelspace"] = includeModelspace;
                    meta["totalPanels"] = panels.Count;
                    meta["totalStrips"] = totalStrips;
                    meta["totalTerminals"] = totalTerminals;
                    meta["totalJumpers"] = totalJumpers;
                    meta["totalLabeledTerminals"] = totalLabeledTerminals;
                    meta["totalGeometryPrimitives"] = totalGeometryPrimitives;
                    meta["terminalProfile"] = ConduitTerminalProfileToJson(terminalProfile);
                }
            );
        }

        private static IEnumerable<Entity> EnumerateConduitSelectionEntities(
            Document document,
            Transaction transaction
        )
        {
            var result = document.Editor.SelectImplied();
            if (result.Status != PromptStatus.OK || result.Value is null)
            {
                yield break;
            }

            foreach (var objectId in result.Value.GetObjectIds())
            {
                if (transaction.GetObject(objectId, OpenMode.ForRead, false) is Entity entity)
                {
                    yield return entity;
                }
            }
        }

        private static (
            JsonArray Geometry,
            int GeometryCount,
            double? MinY,
            double? MaxY
        ) BuildConduitGeometryPayload(BlockReference blockReference)
        {
            if (!TryGetConduitEntityBounds(blockReference, out var extents))
            {
                return (new JsonArray(), 0, null, null);
            }

            var points = new JsonArray
            {
                new JsonObject { ["x"] = Math.Round(extents.MinPoint.X, 6), ["y"] = Math.Round(extents.MinPoint.Y, 6) },
                new JsonObject { ["x"] = Math.Round(extents.MaxPoint.X, 6), ["y"] = Math.Round(extents.MinPoint.Y, 6) },
                new JsonObject { ["x"] = Math.Round(extents.MaxPoint.X, 6), ["y"] = Math.Round(extents.MaxPoint.Y, 6) },
                new JsonObject { ["x"] = Math.Round(extents.MinPoint.X, 6), ["y"] = Math.Round(extents.MaxPoint.Y, 6) },
                new JsonObject { ["x"] = Math.Round(extents.MinPoint.X, 6), ["y"] = Math.Round(extents.MinPoint.Y, 6) },
            };

            return (
                new JsonArray
                {
                    new JsonObject
                    {
                        ["kind"] = "polyline",
                        ["closed"] = true,
                        ["points"] = points,
                    },
                },
                1,
                extents.MinPoint.Y,
                extents.MaxPoint.Y
            );
        }

        private static ConduitJumperRecord? TryParseConduitJumperRecord(
            IReadOnlyDictionary<string, string> attrs,
            string blockName,
            string handle,
            string defaultPanelPrefix
        )
        {
            var fromStripId = FirstConduitAttr(attrs, ConduitJumperFromStripKeys)
                .Trim()
                .ToUpperInvariant();
            var toStripId = FirstConduitAttr(attrs, ConduitJumperToStripKeys)
                .Trim()
                .ToUpperInvariant();
            var fromTerminal = ParseConduitTerminalIndex(
                FirstConduitAttr(attrs, ConduitJumperFromTermKeys)
            );
            var toTerminal = ParseConduitTerminalIndex(
                FirstConduitAttr(attrs, ConduitJumperToTermKeys)
            );
            if (
                string.IsNullOrWhiteSpace(fromStripId)
                || string.IsNullOrWhiteSpace(toStripId)
                || !fromTerminal.HasValue
                || !toTerminal.HasValue
            )
            {
                return null;
            }

            var panelId = FirstConduitAttr(attrs, ConduitJumperPanelIdKeys)
                .Trim()
                .ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = DeriveConduitPanelId(fromStripId);
            }

            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = DeriveConduitPanelId(toStripId);
            }

            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = string.IsNullOrWhiteSpace(defaultPanelPrefix)
                    ? "PANEL"
                    : defaultPanelPrefix.Trim().ToUpperInvariant();
            }

            var jumperId = FirstConduitAttr(attrs, ConduitJumperIdKeys).Trim();
            if (string.IsNullOrWhiteSpace(jumperId))
            {
                jumperId = string.IsNullOrWhiteSpace(handle)
                    ? $"JMP_{fromStripId}_{fromTerminal.Value}"
                    : $"JMP_{handle}";
            }

            return new ConduitJumperRecord
            {
                JumperId = jumperId,
                PanelId = panelId,
                FromStripId = fromStripId,
                FromTerminal = fromTerminal.Value,
                ToStripId = toStripId,
                ToTerminal = toTerminal.Value,
                SourceBlockName = (blockName ?? string.Empty).Trim(),
                Resolution = "attribute",
            };
        }

        private static ConduitJumperRecord? ResolveConduitPositionalJumperRecord(
            ConduitPendingPositionalJumperCandidate candidate,
            IReadOnlyList<ConduitStripScanRecord> stripRecords,
            string defaultPanelPrefix
        )
        {
            if (stripRecords.Count < 2)
            {
                return null;
            }

            var eligible = stripRecords.ToList();
            if (!string.IsNullOrWhiteSpace(candidate.PanelHint))
            {
                var filtered = stripRecords
                    .Where(
                        strip =>
                            string.Equals(
                                strip.PanelId,
                                candidate.PanelHint,
                                StringComparison.OrdinalIgnoreCase
                            )
                    )
                    .ToList();
                if (filtered.Count >= 2)
                {
                    eligible = filtered;
                }
            }

            if (eligible.Count < 2)
            {
                return null;
            }

            double DistanceToCandidate(ConduitStripScanRecord strip)
            {
                var center = GetConduitStripCenter(strip);
                var dx = center.X - candidate.X;
                var dy = center.Y - candidate.Y;
                return Math.Sqrt((dx * dx) + (dy * dy));
            }

            var firstStrip = eligible.OrderBy(DistanceToCandidate).FirstOrDefault();
            if (firstStrip is null)
            {
                return null;
            }

            var firstSide = NormalizeConduitSide(firstStrip.Side);
            var firstPanel = firstStrip.PanelId ?? string.Empty;
            var secondStrip = eligible
                .Where(
                    strip =>
                        !string.Equals(
                            strip.StripId,
                            firstStrip.StripId,
                            StringComparison.OrdinalIgnoreCase
                        )
                )
                .OrderBy(
                    strip =>
                    {
                        var panelPenalty = string.Equals(
                            strip.PanelId,
                            firstPanel,
                            StringComparison.OrdinalIgnoreCase
                        )
                            ? 0.0
                            : 250.0;
                        var sidePenalty = string.Equals(
                            NormalizeConduitSide(strip.Side),
                            firstSide,
                            StringComparison.OrdinalIgnoreCase
                        )
                            ? 35.0
                            : 0.0;
                        return DistanceToCandidate(strip) + panelPenalty + sidePenalty;
                    }
                )
                .FirstOrDefault();
            if (secondStrip is null)
            {
                return null;
            }

            var fromStripId = (firstStrip.StripId ?? string.Empty).Trim().ToUpperInvariant();
            var toStripId = (secondStrip.StripId ?? string.Empty).Trim().ToUpperInvariant();
            if (
                string.IsNullOrWhiteSpace(fromStripId)
                || string.IsNullOrWhiteSpace(toStripId)
                || string.Equals(fromStripId, toStripId, StringComparison.OrdinalIgnoreCase)
            )
            {
                return null;
            }

            var panelId = !string.IsNullOrWhiteSpace(candidate.PanelHint)
                ? candidate.PanelHint
                : !string.IsNullOrWhiteSpace(firstStrip.PanelId)
                    ? firstStrip.PanelId
                    : !string.IsNullOrWhiteSpace(secondStrip.PanelId)
                        ? secondStrip.PanelId
                        : defaultPanelPrefix;
            panelId = string.IsNullOrWhiteSpace(panelId)
                ? "PANEL"
                : panelId.Trim().ToUpperInvariant();

            var fromTerminal = InferConduitTerminalIndexFromY(firstStrip, candidate.Y);
            var toTerminal = InferConduitTerminalIndexFromY(secondStrip, candidate.Y);
            var jumperId = (candidate.JumperId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(jumperId))
            {
                jumperId = string.IsNullOrWhiteSpace(candidate.Handle)
                    ? $"JMP_{fromStripId}_{fromTerminal}"
                    : $"JMP_{candidate.Handle}";
            }

            return new ConduitJumperRecord
            {
                JumperId = jumperId,
                PanelId = panelId,
                FromStripId = fromStripId,
                FromTerminal = fromTerminal,
                ToStripId = toStripId,
                ToTerminal = toTerminal,
                SourceBlockName = (candidate.BlockName ?? string.Empty).Trim(),
                Resolution = "position",
                X = candidate.X,
                Y = candidate.Y,
            };
        }

        private static ConduitGeometryPoint GetConduitStripCenter(ConduitStripScanRecord strip)
        {
            if (strip.MinY.HasValue && strip.MaxY.HasValue)
            {
                return new ConduitGeometryPoint(strip.X, (strip.MinY.Value + strip.MaxY.Value) * 0.5);
            }

            return new ConduitGeometryPoint(strip.X, strip.Y);
        }

        private static int InferConduitTerminalIndexFromY(
            ConduitStripScanRecord strip,
            double yValue
        )
        {
            var terminalCount = ClampConduitInt(strip.TerminalCount, 1, 2000);
            if (strip.MinY.HasValue && strip.MaxY.HasValue)
            {
                var span = strip.MaxY.Value - strip.MinY.Value;
                if (span > 1e-6)
                {
                    var normalized = (yValue - strip.MinY.Value) / span;
                    normalized = Math.Max(0.0, Math.Min(1.0, normalized));
                    return ClampConduitInt(
                        (int)Math.Round(normalized * (terminalCount - 1)) + 1,
                        1,
                        terminalCount
                    );
                }
            }

            var guessed = (int)Math.Round(((yValue - strip.Y) / 12.0) + 1.0);
            return ClampConduitInt(guessed, 1, terminalCount);
        }

        private static JsonArray BuildConduitJumpersJson(IEnumerable<ConduitJumperRecord> jumpers)
        {
            var array = new JsonArray();
            foreach (
                var jumper in jumpers
                    .OrderBy(item => item.PanelId, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(item => item.FromStripId, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(item => item.FromTerminal)
                    .ThenBy(item => item.ToStripId, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(item => item.ToTerminal)
            )
            {
                var node = new JsonObject
                {
                    ["jumperId"] = jumper.JumperId,
                    ["panelId"] = jumper.PanelId,
                    ["fromStripId"] = jumper.FromStripId,
                    ["fromTerminal"] = jumper.FromTerminal,
                    ["toStripId"] = jumper.ToStripId,
                    ["toTerminal"] = jumper.ToTerminal,
                    ["sourceBlockName"] = jumper.SourceBlockName,
                    ["resolution"] = string.IsNullOrWhiteSpace(jumper.Resolution)
                        ? "attribute"
                        : jumper.Resolution,
                };
                if (jumper.X.HasValue && jumper.Y.HasValue)
                {
                    node["x"] = jumper.X.Value;
                    node["y"] = jumper.Y.Value;
                }

                array.Add(node);
            }

            return array;
        }
    }
}
