using System.Diagnostics;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    public static JsonObject HandleTerminalScan(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();

        var selectionOnly = ReadBool(payload, "selectionOnly", fallback: false);
        var includeModelspace = ReadBool(payload, "includeModelspace", fallback: true);
        var maxEntities = ClampInt(ReadInt(payload, "maxEntities", 50000), 500, 200000);
        var terminalProfile = ReadTerminalScanProfile(payload);

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var units = ResolveUnits(session.Document);

        var panels = new JsonObject();
        var warnings = new List<string>();
        var seenEntityHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenStripIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenJumperSignatures = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var blockGeometryCache = new Dictionary<string, List<TerminalGeometryPrimitive>>(StringComparer.OrdinalIgnoreCase);
        var jumpers = new List<JumperRecord>();
        var stripRecords = new List<StripScanRecord>();
        var pendingPositionalJumpers = new List<PendingPositionalJumperCandidate>();

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

        void ConsumeEntity(object entity)
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
                jumperCandidateBlocks += 1;
                var jumper = TryParseJumperRecord(
                    attrs,
                    blockName,
                    handle,
                    terminalProfile.DefaultPanelPrefix
                );
                if (jumper is null)
                {
                    if (TryReadPoint(ReadProperty(entity, "InsertionPoint"), out var jumperX, out var jumperY))
                    {
                        positionalJumperCandidates += 1;
                        pendingPositionalJumpers.Add(
                            new PendingPositionalJumperCandidate
                            {
                                JumperId = FirstAttr(attrs, JumperIdKeys).Trim(),
                                PanelHint = FirstAttr(attrs, JumperPanelIdKeys).Trim().ToUpperInvariant(),
                                Handle = handle,
                                BlockName = (blockName ?? "").Trim(),
                                X = jumperX,
                                Y = jumperY,
                            }
                        );
                        return;
                    }

                    skippedInvalidJumperBlocks += 1;
                    warnings.Add(
                        $"Skipping jumper block {(string.IsNullOrWhiteSpace(blockName) ? "<unknown>" : blockName)} (missing FROM/TO attributes and insertion point)."
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

            if (!LooksLikeTerminalBlock(blockName, attrs, terminalProfile))
            {
                skippedNonTerminalBlocks += 1;
                return;
            }

            if (!TryReadPoint(ReadProperty(entity, "InsertionPoint"), out var pointX, out var pointY))
            {
                return;
            }

            var stripId = FirstAttr(attrs, terminalProfile.StripIdKeys).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(stripId))
            {
                stripId = string.IsNullOrWhiteSpace(blockName) ? $"STRIP_{scannedBlockReferences}" : blockName.ToUpperInvariant();
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

            var panelId = FirstAttr(attrs, terminalProfile.PanelIdKeys).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = DerivePanelFromStripId(stripId);
            }
            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = terminalProfile.DefaultPanelPrefix;
            }
            var panelName = FirstAttr(attrs, terminalProfile.PanelNameKeys);
            if (string.IsNullOrWhiteSpace(panelName))
            {
                panelName = panelId;
            }
            var side = NormalizeSide(FirstAttr(attrs, terminalProfile.SideKeys));

            var terminalCount = ParseTerminalCount(
                attrs,
                terminalProfile.TerminalCountKeys,
                terminalProfile.DefaultTerminalCount
            );
            var stripNumber = ParseStripNumber(stripId, attrs, terminalProfile.StripNumberKeys);
            var terminalLabels = ParseTerminalLabels(attrs, terminalCount);
            totalLabeledTerminals += terminalLabels.Count(label => !string.IsNullOrWhiteSpace(label));
            var geometry = ReadTerminalGeometryForInsert(
                session.Document,
                entity,
                blockName,
                pointX,
                pointY,
                blockGeometryCache
            );
            totalGeometryPrimitives += geometry.Count;

            var panelNode = panels[panelId] as JsonObject;
            if (panelNode is null)
            {
                panelNode = new JsonObject
                {
                    ["fullName"] = panelName,
                    ["color"] = PanelColor(panelId),
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
                    ["terminalLabels"] = ToJsonArray(terminalLabels),
                    ["geometry"] = GeometryToJsonArray(geometry),
                    ["x"] = pointX,
                    ["y"] = pointY,
                }
            );

            stripRecords.Add(
                new StripScanRecord
                {
                    PanelId = panelId,
                    Side = side,
                    StripId = stripId,
                    TerminalCount = terminalCount,
                    X = pointX,
                    Y = pointY,
                    Geometry = CloneGeometry(geometry),
                }
            );

            totalStrips += 1;
            totalTerminals += terminalCount;
        }

        if (selectionOnly)
        {
            foreach (var entity in EnumerateSelectionEntities(session.Document))
            {
                ConsumeEntity(entity);
            }
        }

        foreach (var pending in pendingPositionalJumpers)
        {
            var resolved = ResolvePositionalJumperRecord(
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
                ConsumeEntity(entity);
            }
        }

        stopwatch.Stop();

        var success = totalStrips > 0;
        BridgeLog.Info(
            $"Terminal scan completed success={success} scanned_entities={scannedEntities} strips={totalStrips} terminals={totalTerminals} elapsed_ms={stopwatch.ElapsedMilliseconds}"
        );
        return new JsonObject
        {
            ["success"] = success,
            ["code"] = success ? "" : "NO_TERMINAL_STRIPS_FOUND",
            ["message"] = success
                ? $"Scanned {scannedEntities} entities and found {totalStrips} terminal strips."
                : "No terminal-strip block references were detected.",
            ["data"] = new JsonObject
            {
                ["drawing"] = new JsonObject
                {
                    ["name"] = drawingName,
                    ["units"] = units,
                },
                ["panels"] = panels,
                ["jumpers"] = JumpersToJsonArray(jumpers),
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["scanMs"] = stopwatch.ElapsedMilliseconds,
                ["scannedEntities"] = scannedEntities,
                ["scannedBlockReferences"] = scannedBlockReferences,
                ["skippedNonTerminalBlocks"] = skippedNonTerminalBlocks,
                ["jumperCandidateBlocks"] = jumperCandidateBlocks,
                ["skippedInvalidJumperBlocks"] = skippedInvalidJumperBlocks,
                ["positionalJumperCandidates"] = positionalJumperCandidates,
                ["resolvedPositionalJumpers"] = resolvedPositionalJumpers,
                ["selectionOnly"] = selectionOnly,
                ["includeModelspace"] = includeModelspace,
                ["totalPanels"] = panels.Count,
                ["totalStrips"] = totalStrips,
                ["totalTerminals"] = totalTerminals,
                ["totalJumpers"] = totalJumpers,
                ["totalLabeledTerminals"] = totalLabeledTerminals,
                ["totalGeometryPrimitives"] = totalGeometryPrimitives,
                ["terminalProfile"] = TerminalScanProfileToJson(terminalProfile),
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }
}

