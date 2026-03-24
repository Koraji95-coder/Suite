using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

static partial class ConduitRouteStubHandlers
{
    private readonly record struct SuiteCadBatchRule(
        string Id,
        Regex Pattern,
        string Replacement,
        bool UseRegex,
        bool MatchCase
    );

    private readonly record struct SuiteCadTextTarget(
        string Handle,
        string EntityType,
        string LayoutName,
        string BlockName,
        string AttributeTag,
        string CurrentValue
    );

    private readonly record struct SuiteTitleBlockCandidate(
        object Entity,
        string Handle,
        string BlockName,
        string LayoutName,
        Dictionary<string, object> AttributesByTag
    );

    private readonly record struct SuiteAcadeVerificationResult(
        bool Ok,
        string Message,
        List<string> Warnings
    );

    private readonly record struct SuiteTitleBlockAttributeVerificationResult(
        bool Ok,
        int ExpectedCount,
        int MatchedCount,
        int MissingCount,
        int FailedCount,
        JsonArray Receipts
    );

    private sealed class SuiteDocumentScope : IDisposable
    {
        private readonly object _document;
        private readonly bool _owned;
        private readonly bool _releaseOnDispose;
        private bool _saveOnDispose;

        public SuiteDocumentScope(object document, bool owned, bool releaseOnDispose)
        {
            _document = document;
            _owned = owned;
            _releaseOnDispose = releaseOnDispose;
        }

        public object Document => _document;

        public void MarkDirty()
        {
            _saveOnDispose = true;
        }

        public void Dispose()
        {
            if (_owned)
            {
                try
                {
                    ((dynamic)_document).Close(_saveOnDispose);
                }
                catch
                {
                    // Best effort close.
                }
            }
            else if (_saveOnDispose)
            {
                try
                {
                    ((dynamic)_document).Save();
                }
                catch
                {
                    // Best effort save.
                }
            }

            if (_releaseOnDispose)
            {
                try
                {
                    if (OperatingSystem.IsWindows() && Marshal.IsComObject(_document))
                    {
                        Marshal.ReleaseComObject(_document);
                    }
                }
                catch
                {
                    // Best effort cleanup.
                }
            }
        }
    }

    public static JsonObject HandleSuiteDrawingListScan(JsonObject payload)
    {
        var warnings = new List<string>();
        var drawingPaths = ReadStringArray(payload, "drawingPaths");
        if (drawingPaths.Count <= 0)
        {
            return BuildSuiteInvalidRequestResult(
                message: "drawingPaths must contain at least one DWG path."
            );
        }

        var blockNameHint = ReadStringValue(payload, "blockNameHint", "").Trim();
        if (string.IsNullOrWhiteSpace(blockNameHint))
        {
            blockNameHint = "R3P-24x36BORDER&TITLE";
        }
        var attributeTags = ReadStringArray(payload, "attributeTags");
        if (attributeTags.Count <= 0)
        {
            attributeTags = ["DWGNO", "TITLE1", "TITLE2", "TITLE3", "PROJ", "WD_TB"];
        }

        using var session = ConnectAutoCad();
        var drawings = new JsonArray();
        foreach (var drawingPath in drawingPaths)
        {
            var normalizedPath = drawingPath.Trim();
            if (normalizedPath.Length <= 0)
            {
                continue;
            }

            var rowWarnings = new List<string>();
            try
            {
                using var documentScope = OpenSuiteDocument(
                    session.Application,
                    session.Document,
                    normalizedPath,
                    readOnly: true
                );
                drawings.Add(
                    BuildSuiteTitleBlockScanRow(
                        normalizedPath,
                        documentScope.Document,
                        blockNameHint,
                        attributeTags,
                        rowWarnings
                    )
                );
            }
            catch (Exception ex)
            {
                drawings.Add(
                    new JsonObject
                    {
                        ["path"] = normalizedPath,
                        ["titleBlockFound"] = false,
                        ["blockName"] = null,
                        ["layoutName"] = null,
                        ["handle"] = null,
                        ["hasWdTb"] = false,
                        ["attributes"] = new JsonObject(),
                        ["warnings"] = ToJsonArray(
                            [ $"Drawing scan failed for '{normalizedPath}': {ex.Message}" ]
                        ),
                    }
                );
            }

            foreach (var warning in rowWarnings)
            {
                warnings.Add(warning);
            }
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = "Drawing list scan completed.",
            ["data"] = new JsonObject
            {
                ["drawings"] = drawings,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "suite_drawing_list_scan",
                ["drawingCount"] = drawings.Count,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    public static JsonObject HandleSuiteTitleBlockApply(JsonObject payload)
    {
        var filesNode = payload["files"] as JsonArray;
        if (filesNode is null || filesNode.Count <= 0)
        {
            return BuildSuiteInvalidRequestResult(
                message: "files must contain at least one apply target."
            );
        }

        var warnings = new List<string>();
        var blockNameHint = ReadStringValue(payload, "blockNameHint", "").Trim();
        var projectRootPath = ReadStringValue(payload, "projectRootPath", "").Trim();
        var expectedWdtPath = ReadStringValue(payload, "expectedWdtPath", "").Trim();
        var acadeUpdateTimeoutMs = ClampInt(
            ReadInt(payload, "acadeUpdateTimeoutMs", 45_000),
            5_000,
            5 * 60 * 1000
        );
        if (string.IsNullOrWhiteSpace(blockNameHint))
        {
            blockNameHint = "R3P-24x36BORDER&TITLE";
        }

        using var session = ConnectAutoCad();
        var acadeUpdateQueued = false;
        var acadeUpdateCompleted = false;
        var acadeProjectVerified = false;
        if (ReadBool(payload, "triggerAcadeUpdate", fallback: true))
        {
            var verification = VerifySuiteAcadeUpdateContext(
                session.Document,
                projectRootPath,
                expectedWdtPath
            );
            acadeProjectVerified = verification.Ok;
            if (!verification.Ok)
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = verification.Message,
                    ["data"] = new JsonObject
                    {
                        ["files"] = new JsonArray(),
                        ["updated"] = 0,
                        ["acadeUpdateQueued"] = false,
                        ["acadeUpdateCompleted"] = false,
                        ["acadeProjectVerified"] = false,
                    },
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "suite_title_block_apply",
                        ["stage"] = "acade_verify",
                    },
                    ["warnings"] = ToJsonArray(verification.Warnings),
                };
            }

            warnings.AddRange(verification.Warnings);
            try
            {
                ((dynamic)session.Document).SendCommand("_.AEUPDATETITLEBLOCK\n");
                acadeUpdateQueued = true;
                acadeUpdateCompleted = WaitForSuiteCommandToClear(
                    session.Application,
                    "AEUPDATETITLEBLOCK",
                    TimeSpan.FromMilliseconds(acadeUpdateTimeoutMs),
                    warnings
                );
                if (!acadeUpdateCompleted)
                {
                    return new JsonObject
                    {
                        ["success"] = false,
                        ["code"] = "ACADE_UPDATE_NOT_CONFIRMED",
                        ["message"] = "AEUPDATETITLEBLOCK did not complete within the confirmation window.",
                        ["data"] = new JsonObject
                        {
                            ["files"] = new JsonArray(),
                            ["updated"] = 0,
                            ["acadeUpdateQueued"] = acadeUpdateQueued,
                            ["acadeUpdateCompleted"] = false,
                            ["acadeProjectVerified"] = acadeProjectVerified,
                            ["acadeUpdateTimeoutMs"] = acadeUpdateTimeoutMs,
                        },
                        ["meta"] = new JsonObject
                        {
                            ["source"] = "dotnet",
                            ["providerPath"] = "dotnet",
                            ["action"] = "suite_title_block_apply",
                            ["stage"] = "acade_wait",
                        },
                        ["warnings"] = ToJsonArray(warnings),
                    };
                }
            }
            catch (Exception ex)
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "ACADE_UPDATE_FAILED",
                    ["message"] = $"Unable to execute AEUPDATETITLEBLOCK automatically: {ex.Message}",
                    ["data"] = new JsonObject
                    {
                        ["files"] = new JsonArray(),
                        ["updated"] = 0,
                        ["acadeUpdateQueued"] = acadeUpdateQueued,
                        ["acadeUpdateCompleted"] = false,
                        ["acadeProjectVerified"] = acadeProjectVerified,
                        ["acadeUpdateTimeoutMs"] = acadeUpdateTimeoutMs,
                    },
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "suite_title_block_apply",
                        ["stage"] = "acade_execute",
                    },
                    ["warnings"] = ToJsonArray(warnings),
                };
            }
        }

        var acadeVerificationByPath = new Dictionary<string, JsonObject>(
            StringComparer.OrdinalIgnoreCase
        );
        if (acadeUpdateQueued && acadeUpdateCompleted)
        {
            var verificationFiles = new JsonArray();
            var unverifiedCount = 0;
            foreach (var entryNode in filesNode)
            {
                if (entryNode is not JsonObject entry)
                {
                    continue;
                }

                var path = ReadStringValue(entry, "path", "").Trim();
                var relativePath = ReadStringValue(entry, "relativePath", "").Trim();
                if (string.IsNullOrWhiteSpace(path))
                {
                    continue;
                }

                var expectedAcadeValues = ReadSuiteStringMap(entry, "expectedAcadeValues");
                if (expectedAcadeValues.Count <= 0)
                {
                    continue;
                }

                var verificationWarnings = new List<string>();
                JsonObject verificationResult;
                try
                {
                    using var documentScope = OpenSuiteDocument(
                        session.Application,
                        session.Document,
                        path,
                        readOnly: true
                    );
                    verificationResult = VerifySuiteTitleBlockAttributeMap(
                        documentScope.Document,
                        blockNameHint,
                        expectedAcadeValues,
                        verificationWarnings
                    );
                }
                catch (Exception ex)
                {
                    verificationWarnings.Add(
                        $"ACADE verification failed for '{path}': {ex.Message}"
                    );
                    verificationResult = new JsonObject
                    {
                        ["verified"] = false,
                        ["matched"] = 0,
                        ["mismatched"] = expectedAcadeValues.Count,
                        ["missing"] = 0,
                        ["receipts"] = new JsonArray(),
                    };
                }

                acadeVerificationByPath[path] = verificationResult;
                foreach (var warning in verificationWarnings)
                {
                    warnings.Add(warning);
                }

                var verified = verificationResult["verified"]?.GetValue<bool>() ?? false;
                if (!verified)
                {
                    unverifiedCount += 1;
                }

                verificationFiles.Add(
                    new JsonObject
                    {
                        ["path"] = path,
                        ["relativePath"] = string.IsNullOrWhiteSpace(relativePath)
                            ? null
                            : relativePath,
                        ["verified"] = verified,
                        ["matched"] = verificationResult["matched"]?.GetValue<int>() ?? 0,
                        ["mismatched"] = verificationResult["mismatched"]?.GetValue<int>()
                            ?? 0,
                        ["missing"] = verificationResult["missing"]?.GetValue<int>() ?? 0,
                        ["receipts"] = verificationResult["receipts"] as JsonArray
                            ?? new JsonArray(),
                        ["warnings"] = ToJsonArray(verificationWarnings),
                    }
                );
            }

            if (unverifiedCount > 0)
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "ACADE_UPDATE_UNVERIFIED",
                    ["message"] =
                        $"AEUPDATETITLEBLOCK did not produce the expected ACADE-owned values for {unverifiedCount} drawing(s).",
                    ["data"] = new JsonObject
                    {
                        ["files"] = verificationFiles,
                        ["updated"] = 0,
                        ["acadeUpdateQueued"] = acadeUpdateQueued,
                        ["acadeUpdateCompleted"] = acadeUpdateCompleted,
                        ["acadeProjectVerified"] = acadeProjectVerified,
                        ["acadeUpdateTimeoutMs"] = acadeUpdateTimeoutMs,
                    },
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "suite_title_block_apply",
                        ["stage"] = "acade_verify_values",
                    },
                    ["warnings"] = ToJsonArray(warnings),
                };
            }
        }

        var filesArray = new JsonArray();
        var updatedCount = 0;
        foreach (var entryNode in filesNode)
        {
            if (entryNode is not JsonObject entry)
            {
                continue;
            }

            var path = ReadStringValue(entry, "path", "").Trim();
            var relativePath = ReadStringValue(entry, "relativePath", "").Trim();
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            var updates = ReadSuiteStringMap(entry, "updates");
            var rowWarnings = new List<string>();
            var rowReceipts = new JsonArray();
            var wroteChanges = false;

            try
            {
                using var documentScope = OpenSuiteDocument(
                    session.Application,
                    session.Document,
                    path,
                    readOnly: false
                );
                var result = CommitSuiteTitleBlockAttributeMap(
                    documentScope.Document,
                    blockNameHint,
                    updates,
                    rowWarnings
                );
                if (result["wroteChanges"]?.GetValue<bool>() ?? false)
                {
                    documentScope.MarkDirty();
                    wroteChanges = true;
                    updatedCount += result["updated"]?.GetValue<int>() ?? 0;
                }
                rowReceipts = result["receipts"] as JsonArray ?? new JsonArray();
                filesArray.Add(
                    new JsonObject
                    {
                        ["path"] = path,
                        ["relativePath"] = string.IsNullOrWhiteSpace(relativePath) ? null : relativePath,
                        ["wroteChanges"] = wroteChanges,
                        ["updated"] = result["updated"]?.GetValue<int>() ?? 0,
                        ["unchanged"] = result["unchanged"]?.GetValue<int>() ?? 0,
                        ["missing"] = result["missing"]?.GetValue<int>() ?? 0,
                        ["failed"] = result["failed"]?.GetValue<int>() ?? 0,
                        ["acadeVerification"] = acadeVerificationByPath.TryGetValue(
                            path,
                            out var verificationNode
                        )
                            ? verificationNode
                            : null,
                        ["receipts"] = rowReceipts,
                        ["warnings"] = ToJsonArray(rowWarnings),
                    }
                );
            }
            catch (Exception ex)
            {
                filesArray.Add(
                    new JsonObject
                    {
                        ["path"] = path,
                        ["relativePath"] = string.IsNullOrWhiteSpace(relativePath) ? null : relativePath,
                        ["wroteChanges"] = false,
                        ["updated"] = 0,
                        ["unchanged"] = 0,
                        ["missing"] = updates.Count,
                        ["failed"] = updates.Count,
                        ["acadeVerification"] = acadeVerificationByPath.TryGetValue(
                            path,
                            out var verificationNode
                        )
                            ? verificationNode
                            : null,
                        ["receipts"] = new JsonArray(),
                        ["warnings"] = ToJsonArray([ $"Apply failed for '{path}': {ex.Message}" ]),
                    }
                );
            }

            foreach (var warning in rowWarnings)
            {
                warnings.Add(warning);
            }
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = "Title block apply completed.",
            ["data"] = new JsonObject
            {
                ["files"] = filesArray,
                ["updated"] = updatedCount,
                ["acadeUpdateQueued"] = acadeUpdateQueued,
                ["acadeUpdateCompleted"] = acadeUpdateCompleted,
                ["acadeProjectVerified"] = acadeProjectVerified,
                ["acadeUpdateTimeoutMs"] = acadeUpdateTimeoutMs,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "suite_title_block_apply",
                ["fileCount"] = filesArray.Count,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    public static JsonObject HandleSuiteBatchFindReplacePreview(JsonObject payload)
    {
        var rules = ReadSuiteCadBatchRules(payload, out var validationError);
        if (validationError.Length > 0)
        {
            return BuildSuiteInvalidRequestResult(validationError);
        }

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var matches = new JsonArray();

        foreach (var target in EnumerateSuiteCadTextTargets(session.Document))
        {
            var currentValue = target.CurrentValue;
            foreach (var rule in rules)
            {
                var nextValue = rule.Pattern.Replace(currentValue, rule.Replacement);
                if (string.Equals(currentValue, nextValue, StringComparison.Ordinal))
                {
                    continue;
                }

                matches.Add(
                    new JsonObject
                    {
                        ["file"] = drawingName,
                        ["line"] = 0,
                        ["ruleId"] = rule.Id,
                        ["handle"] = target.Handle,
                        ["entityType"] = target.EntityType,
                        ["layoutName"] = target.LayoutName,
                        ["blockName"] = string.IsNullOrWhiteSpace(target.BlockName) ? null : target.BlockName,
                        ["attributeTag"] = string.IsNullOrWhiteSpace(target.AttributeTag) ? null : target.AttributeTag,
                        ["before"] = currentValue,
                        ["after"] = nextValue,
                        ["currentValue"] = currentValue,
                        ["nextValue"] = nextValue,
                    }
                );
                currentValue = nextValue;
            }
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = "CAD batch preview completed.",
            ["data"] = new JsonObject
            {
                ["drawingName"] = drawingName,
                ["matches"] = matches,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "suite_batch_find_replace_preview",
                ["matchCount"] = matches.Count,
            },
            ["warnings"] = new JsonArray(),
        };
    }

    public static JsonObject HandleSuiteBatchFindReplaceApply(JsonObject payload)
    {
        if (payload["matches"] is not JsonArray matchesArray || matchesArray.Count <= 0)
        {
            return BuildSuiteInvalidRequestResult("matches must contain at least one preview row.");
        }

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var warnings = new List<string>();
        var changeRows = new JsonArray();
        var updated = 0;

        foreach (var node in matchesArray)
        {
            if (node is not JsonObject match)
            {
                continue;
            }

            var handle = ReadStringValue(match, "handle", "").Trim().ToUpperInvariant();
            var entityType = ReadStringValue(match, "entityType", "").Trim();
            var attributeTag = ReadStringValue(match, "attributeTag", "").Trim().ToUpperInvariant();
            var currentValue = ReadStringValue(match, "currentValue", "");
            var nextValue = ReadStringValue(match, "nextValue", "");
            var ruleId = ReadStringValue(match, "ruleId", "");
            if (string.IsNullOrWhiteSpace(handle))
            {
                continue;
            }

            var result = ApplySuiteCadBatchMatch(
                session.Document,
                handle,
                entityType,
                attributeTag,
                currentValue,
                nextValue,
                warnings
            );

            if (result.Applied)
            {
                updated += 1;
                changeRows.Add(
                    new JsonObject
                    {
                        ["file"] = drawingName,
                        ["line"] = 0,
                        ["ruleId"] = ruleId,
                        ["before"] = currentValue,
                        ["after"] = nextValue,
                        ["handle"] = handle,
                        ["entityType"] = entityType,
                        ["attributeTag"] = string.IsNullOrWhiteSpace(attributeTag) ? null : attributeTag,
                    }
                );
            }
        }

        if (updated > 0)
        {
            try
            {
                ((dynamic)session.Document).Save();
            }
            catch (Exception ex)
            {
                warnings.Add($"Drawing save after CAD batch apply raised: {ex.Message}");
            }
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = "CAD batch apply completed.",
            ["data"] = new JsonObject
            {
                ["drawingName"] = drawingName,
                ["updated"] = updated,
                ["changes"] = changeRows,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "suite_batch_find_replace_apply",
                ["updated"] = updated,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    private static JsonObject BuildSuiteInvalidRequestResult(string message)
    {
        return new JsonObject
        {
            ["success"] = false,
            ["code"] = "INVALID_REQUEST",
            ["message"] = message,
            ["data"] = new JsonObject(),
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
            },
            ["warnings"] = new JsonArray(),
        };
    }

    private static JsonObject VerifySuiteTitleBlockAttributeMap(
        object document,
        string blockNameHint,
        IReadOnlyDictionary<string, string> expectedValues,
        List<string> warnings
    )
    {
        if (!TryFindSuiteTitleBlockCandidate(
            document,
            blockNameHint,
            expectedValues.Keys,
            warnings,
            out var candidate
        ))
        {
            return new JsonObject
            {
                ["verified"] = false,
                ["matched"] = 0,
                ["mismatched"] = 0,
                ["missing"] = expectedValues.Count,
                ["receipts"] = new JsonArray(),
            };
        }

        var matched = 0;
        var mismatched = 0;
        var missing = 0;
        var receipts = new JsonArray();

        foreach (var update in expectedValues)
        {
            var attributeTag = update.Key.Trim().ToUpperInvariant();
            if (!candidate.AttributesByTag.TryGetValue(attributeTag, out var attributeRef))
            {
                missing += 1;
                receipts.Add(
                    new JsonObject
                    {
                        ["attributeTag"] = attributeTag,
                        ["status"] = "missing",
                        ["expectedValue"] = update.Value,
                        ["currentValue"] = null,
                    }
                );
                continue;
            }

            var currentValue = TryReadRawStringProperty(attributeRef, "TextString") ?? "";
            if (string.Equals(currentValue, update.Value, StringComparison.Ordinal))
            {
                matched += 1;
                receipts.Add(
                    new JsonObject
                    {
                        ["attributeTag"] = attributeTag,
                        ["status"] = "matched",
                        ["expectedValue"] = update.Value,
                        ["currentValue"] = currentValue,
                    }
                );
                continue;
            }

            mismatched += 1;
            receipts.Add(
                new JsonObject
                {
                    ["attributeTag"] = attributeTag,
                    ["status"] = "mismatched",
                    ["expectedValue"] = update.Value,
                    ["currentValue"] = currentValue,
                }
            );
        }

        return new JsonObject
        {
            ["verified"] = mismatched == 0 && missing == 0,
            ["matched"] = matched,
            ["mismatched"] = mismatched,
            ["missing"] = missing,
            ["receipts"] = receipts,
        };
    }

    private static JsonObject BuildSuiteNotImplementedResult(string action)
    {
        return new JsonObject
        {
            ["success"] = false,
            ["code"] = "NOT_IMPLEMENTED",
            ["message"] = $"Action '{action}' is not implemented yet.",
            ["data"] = new JsonObject(),
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = action,
            },
            ["warnings"] = new JsonArray(),
        };
    }

    private static SuiteAcadeVerificationResult VerifySuiteAcadeUpdateContext(
        object activeDocument,
        string projectRootPath,
        string expectedWdtPath
    )
    {
        var warnings = new List<string>();
        var activeFullName = StringOrDefault(ReadProperty(activeDocument, "FullName"), "").Trim();
        if (string.IsNullOrWhiteSpace(activeFullName))
        {
            return new SuiteAcadeVerificationResult(
                false,
                "The active AutoCAD Electrical drawing could not be resolved.",
                warnings
            );
        }

        if (!string.IsNullOrWhiteSpace(projectRootPath))
        {
            string normalizedProjectRoot;
            string normalizedActivePath;
            try
            {
                normalizedProjectRoot = Path.GetFullPath(projectRootPath);
                normalizedActivePath = Path.GetFullPath(activeFullName);
            }
            catch (Exception ex)
            {
                return new SuiteAcadeVerificationResult(
                    false,
                    $"Unable to normalize the project root for ACADE verification: {ex.Message}",
                    warnings
                );
            }

            if (
                !normalizedActivePath.StartsWith(
                    normalizedProjectRoot,
                    StringComparison.OrdinalIgnoreCase
                )
            )
            {
                return new SuiteAcadeVerificationResult(
                    false,
                    "The active AutoCAD drawing is not inside the selected project root. Open a drawing from the target AutoCAD Electrical project first.",
                    warnings
                );
            }

            if (!Directory.Exists(normalizedProjectRoot))
            {
                return new SuiteAcadeVerificationResult(
                    false,
                    "The selected project root does not exist on disk.",
                    warnings
                );
            }

            if (
                !Directory
                    .EnumerateFiles(normalizedProjectRoot, "*.wdp", SearchOption.TopDirectoryOnly)
                    .Any()
            )
            {
                return new SuiteAcadeVerificationResult(
                    false,
                    "No .WDP project file was found in the selected AutoCAD Electrical project root.",
                    warnings
                );
            }
        }

        if (!string.IsNullOrWhiteSpace(expectedWdtPath) && !File.Exists(expectedWdtPath))
        {
            return new SuiteAcadeVerificationResult(
                false,
                "The generated .WDT mapping file is missing from the selected project root.",
                warnings
            );
        }

        return new SuiteAcadeVerificationResult(
            true,
            "ACADE update context verified.",
            warnings
        );
    }

    private static bool WaitForSuiteCommandToClear(
        object application,
        string commandName,
        TimeSpan timeout,
        List<string> warnings
    )
    {
        var normalizedCommand = commandName.Trim().ToUpperInvariant();
        if (normalizedCommand.Length <= 0)
        {
            return true;
        }

        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < timeout)
        {
            try
            {
                var cmdNames = SafeUpper(
                    ReadWithTransientComRetry(
                        () => ((dynamic)application).GetVariable("CMDNAMES"),
                        "Application.GetVariable(CMDNAMES)"
                    )
                );
                if (!cmdNames.Contains(normalizedCommand, StringComparison.Ordinal))
                {
                    return true;
                }
            }
            catch (Exception ex)
            {
                warnings.Add(
                    $"Unable to confirm AEUPDATETITLEBLOCK completion from AutoCAD: {ex.Message}"
                );
                return false;
            }

            Thread.Sleep(250);
        }

        warnings.Add(
            $"Timed out waiting for {normalizedCommand} to leave the AutoCAD command stack."
        );
        return false;
    }

    private static SuiteDocumentScope OpenSuiteDocument(
        object application,
        object activeDocument,
        string drawingPath,
        bool readOnly
    )
    {
        var normalizedTarget = drawingPath.Trim();
        if (normalizedTarget.Length <= 0)
        {
            throw new InvalidOperationException("Drawing path is required.");
        }

        var activeFullName = StringOrDefault(ReadProperty(activeDocument, "FullName"), "");
        if (string.Equals(activeFullName, normalizedTarget, StringComparison.OrdinalIgnoreCase))
        {
            return new SuiteDocumentScope(activeDocument, owned: false, releaseOnDispose: false);
        }

        var documents = ReadProperty(application, "Documents");
        if (documents is not null)
        {
            var count = ReadCount(documents);
            for (var index = 0; index < count; index++)
            {
                var openDocument = ReadItem(documents, index);
                if (openDocument is null)
                {
                    continue;
                }

                var fullName = StringOrDefault(ReadProperty(openDocument, "FullName"), "");
                if (string.Equals(fullName, normalizedTarget, StringComparison.OrdinalIgnoreCase))
                {
                    return new SuiteDocumentScope(openDocument, owned: false, releaseOnDispose: true);
                }
            }

            var opened = ReadWithTransientComRetry(
                () => ((dynamic)documents).Open(normalizedTarget, readOnly),
                $"Documents.Open({normalizedTarget})"
            );
            if (opened is null)
            {
                throw new InvalidOperationException($"Unable to open drawing '{normalizedTarget}'.");
            }
            return new SuiteDocumentScope(opened, owned: true, releaseOnDispose: true);
        }

        throw new InvalidOperationException("AutoCAD documents collection is unavailable.");
    }

    private static JsonObject BuildSuiteTitleBlockScanRow(
        string drawingPath,
        object document,
        string blockNameHint,
        IReadOnlyCollection<string> attributeTags,
        List<string> warnings
    )
    {
        if (!TryFindSuiteTitleBlockCandidate(
            document,
            blockNameHint,
            attributeTags,
            warnings,
            out var candidate
        ))
        {
            return new JsonObject
            {
                ["path"] = drawingPath,
                ["titleBlockFound"] = false,
                ["blockName"] = null,
                ["layoutName"] = null,
                ["handle"] = null,
                ["hasWdTb"] = false,
                ["attributes"] = new JsonObject(),
                ["warnings"] = ToJsonArray(warnings),
            };
        }

        var attributes = new JsonObject();
        foreach (var entry in candidate.AttributesByTag.OrderBy(item => item.Key, StringComparer.OrdinalIgnoreCase))
        {
            attributes[entry.Key] = TryReadRawStringProperty(entry.Value, "TextString") ?? "";
        }

        return new JsonObject
        {
            ["path"] = drawingPath,
            ["titleBlockFound"] = true,
            ["blockName"] = string.IsNullOrWhiteSpace(candidate.BlockName) ? null : candidate.BlockName,
            ["layoutName"] = string.IsNullOrWhiteSpace(candidate.LayoutName) ? null : candidate.LayoutName,
            ["handle"] = string.IsNullOrWhiteSpace(candidate.Handle) ? null : candidate.Handle,
            ["hasWdTb"] = candidate.AttributesByTag.ContainsKey("WD_TB"),
            ["attributes"] = attributes,
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    private static JsonObject CommitSuiteTitleBlockAttributeMap(
        object document,
        string blockNameHint,
        IReadOnlyDictionary<string, string> updates,
        List<string> warnings
    )
    {
        if (!TryFindSuiteTitleBlockCandidate(
            document,
            blockNameHint,
            updates.Keys,
            warnings,
            out var candidate
        ))
        {
            return new JsonObject
            {
                ["wroteChanges"] = false,
                ["updated"] = 0,
                ["unchanged"] = 0,
                ["missing"] = updates.Count,
                ["failed"] = 0,
                ["receipts"] = new JsonArray(),
            };
        }

        var updated = 0;
        var unchanged = 0;
        var missing = 0;
        var failed = 0;
        var receipts = new JsonArray();

        foreach (var update in updates)
        {
            var attributeTag = update.Key.Trim().ToUpperInvariant();
            var targetValue = update.Value ?? "";
            if (!candidate.AttributesByTag.TryGetValue(attributeTag, out var attribute))
            {
                missing += 1;
                continue;
            }

            var previousValue = TryReadRawStringProperty(attribute, "TextString") ?? "";
            if (string.Equals(previousValue, targetValue, StringComparison.Ordinal))
            {
                unchanged += 1;
                continue;
            }

            try
            {
                ((dynamic)attribute).TextString = targetValue;
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
                    new JsonObject
                    {
                        ["attributeTag"] = attributeTag,
                        ["previousValue"] = previousValue,
                        ["nextValue"] = targetValue,
                        ["handle"] = string.IsNullOrWhiteSpace(candidate.Handle) ? null : candidate.Handle,
                        ["layoutName"] = string.IsNullOrWhiteSpace(candidate.LayoutName) ? null : candidate.LayoutName,
                    }
                );
            }
            catch (Exception ex)
            {
                failed += 1;
                warnings.Add(
                    $"Title block write failed for '{attributeTag}': {ex.Message}"
                );
            }
        }

        return new JsonObject
        {
            ["wroteChanges"] = updated > 0,
            ["updated"] = updated,
            ["unchanged"] = unchanged,
            ["missing"] = missing,
            ["failed"] = failed,
            ["receipts"] = receipts,
        };
    }

    private static bool TryFindSuiteTitleBlockCandidate(
        object document,
        string blockNameHint,
        IEnumerable<string> requestedTags,
        List<string> warnings,
        out SuiteTitleBlockCandidate candidate
    )
    {
        candidate = default;
        var targetTags = requestedTags
            .Select(tag => tag?.Trim().ToUpperInvariant() ?? "")
            .Where(tag => tag.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (targetTags.Count <= 0)
        {
            targetTags = ["DWGNO", "TITLE1", "TITLE2", "TITLE3", "PROJ"];
        }

        var searchTarget = new AutoDraftTitleBlockExecuteTarget(
            FieldKey: "suite_title_block_scan",
            AttributeTags: targetTags,
            TargetValue: "",
            BlockNameHint: blockNameHint,
            LayoutHint: ""
        );
        var searchSpaces = ResolveAutoDraftTitleBlockSearchSpaces(document, searchTarget, warnings);
        if (searchSpaces.Count <= 0)
        {
            return false;
        }

        var matches = new List<(
            int Score,
            object Entity,
            string Handle,
            string BlockName,
            string LayoutName,
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
                if (!MatchesAutoDraftTitleBlockNameHint(blockName, blockNameHint))
                {
                    continue;
                }

                var attributesByTag = ReadEntityAttributesByTag(entity);
                if (attributesByTag.Count <= 0)
                {
                    continue;
                }

                var matchingTagCount = targetTags.Count(tag => attributesByTag.ContainsKey(tag));
                if (matchingTagCount <= 0)
                {
                    continue;
                }

                var score = matchingTagCount * 10;
                if (!string.IsNullOrWhiteSpace(blockNameHint))
                {
                    var normalizedBlockName = NormalizeAutoDraftName(blockName);
                    var normalizedHint = NormalizeAutoDraftName(blockNameHint);
                    if (string.Equals(normalizedBlockName, normalizedHint, StringComparison.Ordinal))
                    {
                        score += 50;
                    }
                    else if (normalizedBlockName.Contains(normalizedHint, StringComparison.Ordinal))
                    {
                        score += 20;
                    }
                }

                matches.Add(
                    (
                        Score: score,
                        Entity: entity,
                        Handle: GetEntityHandle(entity),
                        BlockName: blockName,
                        LayoutName: searchSpace.LayoutName,
                        AttributesByTag: attributesByTag
                    )
                );
            }
        }

        if (matches.Count <= 0)
        {
            return false;
        }

        var selected = matches
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.LayoutName, StringComparer.OrdinalIgnoreCase)
            .First();
        if (matches.Count > 1)
        {
            warnings.Add(
                $"Multiple title block candidates matched '{blockNameHint}'. Using {(string.IsNullOrWhiteSpace(selected.Handle) ? "the first match" : $"handle {selected.Handle}")} in layout '{selected.LayoutName}'."
            );
        }

        candidate = new SuiteTitleBlockCandidate(
            Entity: selected.Entity,
            Handle: selected.Handle,
            BlockName: selected.BlockName,
            LayoutName: selected.LayoutName,
            AttributesByTag: selected.AttributesByTag
        );
        return true;
    }

    private static Dictionary<string, string> ReadSuiteStringMap(JsonObject payload, string key)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonObject obj)
        {
            return map;
        }

        foreach (var kvp in obj)
        {
            if (string.IsNullOrWhiteSpace(kvp.Key))
            {
                continue;
            }

            var value = kvp.Value?.ToString() ?? "";
            map[kvp.Key.Trim()] = value;
        }

        return map;
    }

    private static List<SuiteCadBatchRule> ReadSuiteCadBatchRules(JsonObject payload, out string validationError)
    {
        validationError = "";
        if (payload["rules"] is not JsonArray rulesArray || rulesArray.Count <= 0)
        {
            validationError = "rules must contain at least one replacement rule.";
            return [];
        }

        var rules = new List<SuiteCadBatchRule>();
        for (var index = 0; index < rulesArray.Count; index++)
        {
            if (rulesArray[index] is not JsonObject ruleObj)
            {
                continue;
            }

            var find = ReadStringValue(ruleObj, "find", "");
            if (string.IsNullOrWhiteSpace(find))
            {
                continue;
            }

            var id = ReadStringValue(ruleObj, "id", $"rule-{index + 1}");
            var replacement = ReadStringValue(ruleObj, "replace", "");
            var useRegex = ReadBool(ruleObj, "useRegex", fallback: false);
            var matchCase = ReadBool(ruleObj, "matchCase", fallback: false);
            var flags = matchCase ? RegexOptions.None : RegexOptions.IgnoreCase;
            try
            {
                rules.Add(
                    new SuiteCadBatchRule(
                        Id: id,
                        Pattern: new Regex(useRegex ? find : Regex.Escape(find), flags),
                        Replacement: replacement,
                        UseRegex: useRegex,
                        MatchCase: matchCase
                    )
                );
            }
            catch (Exception ex)
            {
                validationError = $"Invalid regex for rule '{id}': {ex.Message}";
                return [];
            }
        }

        if (rules.Count <= 0)
        {
            validationError = "No valid rules provided.";
        }
        return rules;
    }

    private static IEnumerable<SuiteCadTextTarget> EnumerateSuiteCadTextTargets(object document)
    {
        var seenHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var entity in EnumerateSuiteCadEntities(document))
        {
            var objectName = SafeUpper(ReadProperty(entity, "ObjectName"));
            var handle = GetEntityHandle(entity);
            if (string.IsNullOrWhiteSpace(handle) || !seenHandles.Add($"{objectName}:{handle}"))
            {
                continue;
            }

            if (objectName.Contains("DBTEXT", StringComparison.Ordinal))
            {
                yield return new SuiteCadTextTarget(
                    Handle: handle,
                    EntityType: "DBText",
                    LayoutName: ResolveSuiteCadEntityLayoutName(document, entity),
                    BlockName: "",
                    AttributeTag: "",
                    CurrentValue: TryReadRawStringProperty(entity, "TextString") ?? ""
                );
                continue;
            }

            if (objectName.Contains("MTEXT", StringComparison.Ordinal))
            {
                yield return new SuiteCadTextTarget(
                    Handle: handle,
                    EntityType: "MText",
                    LayoutName: ResolveSuiteCadEntityLayoutName(document, entity),
                    BlockName: "",
                    AttributeTag: "",
                    CurrentValue: TryReadRawStringProperty(entity, "TextString") ?? ""
                );
                continue;
            }

            if (!objectName.Contains("BLOCKREFERENCE", StringComparison.Ordinal))
            {
                continue;
            }

            var blockName = ReadAutoDraftBlockName(entity);
            var layoutName = ResolveSuiteCadEntityLayoutName(document, entity);
            foreach (var attributeEntry in ReadEntityAttributesByTag(entity))
            {
                var attributeValue = TryReadRawStringProperty(attributeEntry.Value, "TextString") ?? "";
                yield return new SuiteCadTextTarget(
                    Handle: handle,
                    EntityType: "AttributeReference",
                    LayoutName: layoutName,
                    BlockName: blockName,
                    AttributeTag: attributeEntry.Key,
                    CurrentValue: attributeValue
                );
            }
        }
    }

    private static IEnumerable<object> EnumerateSuiteCadEntities(object document)
    {
        var modelSpace = ReadProperty(document, "ModelSpace");
        if (modelSpace is not null)
        {
            foreach (var entity in EnumerateAutoDraftTitleBlockEntities(modelSpace))
            {
                yield return entity;
            }
        }

        foreach (var layout in EnumerateAutoDraftLayouts(document))
        {
            if (!TryResolveAutoDraftLayoutBlock(document, layout, out var blockContainer, out _))
            {
                continue;
            }

            foreach (var entity in EnumerateAutoDraftTitleBlockEntities(blockContainer))
            {
                yield return entity;
            }
        }
    }

    private static string ResolveSuiteCadEntityLayoutName(object document, object entity)
    {
        try
        {
            var ownerId = StringOrDefault(ReadProperty(entity, "OwnerID"), "");
            if (!string.IsNullOrWhiteSpace(ownerId))
            {
                return ownerId;
            }
        }
        catch
        {
            // Ignore and fall back.
        }
        return StringOrDefault(ReadProperty(ReadProperty(document, "ActiveLayout")!, "Name"), "Active");
    }

    private readonly record struct SuiteCadApplyOutcome(bool Applied);

    private static SuiteCadApplyOutcome ApplySuiteCadBatchMatch(
        object document,
        string handle,
        string entityType,
        string attributeTag,
        string currentValue,
        string nextValue,
        List<string> warnings
    )
    {
        object? entity;
        try
        {
            entity = ((dynamic)document).HandleToObject(handle);
        }
        catch (Exception ex)
        {
            warnings.Add($"Target entity '{handle}' was not found: {ex.Message}");
            return new SuiteCadApplyOutcome(false);
        }

        if (entity is null)
        {
            warnings.Add($"Target entity '{handle}' was not found.");
            return new SuiteCadApplyOutcome(false);
        }

        if (string.Equals(entityType, "AttributeReference", StringComparison.OrdinalIgnoreCase))
        {
            var attributesByTag = ReadEntityAttributesByTag(entity);
            if (!attributesByTag.TryGetValue(attributeTag, out var attribute))
            {
                warnings.Add($"Attribute '{attributeTag}' was not found on block handle {handle}.");
                return new SuiteCadApplyOutcome(false);
            }

            var previous = TryReadRawStringProperty(attribute, "TextString") ?? "";
            if (!string.Equals(previous, currentValue, StringComparison.Ordinal))
            {
                warnings.Add(
                    $"Skipped attribute {attributeTag} on handle {handle} because the current value changed."
                );
                return new SuiteCadApplyOutcome(false);
            }

            ((dynamic)attribute).TextString = nextValue;
            try
            {
                ((dynamic)attribute).Update();
            }
            catch
            {
                // Best effort.
            }
            return new SuiteCadApplyOutcome(true);
        }

        var previousValue = TryReadRawStringProperty(entity, "TextString") ?? "";
        if (!string.Equals(previousValue, currentValue, StringComparison.Ordinal))
        {
            warnings.Add($"Skipped handle {handle} because the current value changed.");
            return new SuiteCadApplyOutcome(false);
        }

        if (string.Equals(entityType, "MText", StringComparison.OrdinalIgnoreCase))
        {
            var rawContents = TryReadRawStringProperty(entity, "Contents") ?? previousValue;
            var hasFormattingCodes =
                rawContents.Contains("\\", StringComparison.Ordinal)
                || rawContents.Contains("{", StringComparison.Ordinal)
                || rawContents.Contains("}", StringComparison.Ordinal);
            if (hasFormattingCodes && !string.Equals(rawContents, previousValue, StringComparison.Ordinal))
            {
                warnings.Add(
                    $"Skipped MText handle {handle} because it contains formatting codes and cannot be safely rewritten."
                );
                return new SuiteCadApplyOutcome(false);
            }

            ((dynamic)entity).Contents = nextValue;
            try
            {
                ((dynamic)entity).Update();
            }
            catch
            {
                // Best effort.
            }
            return new SuiteCadApplyOutcome(true);
        }

        ((dynamic)entity).TextString = nextValue;
        try
        {
            ((dynamic)entity).Update();
        }
        catch
        {
            // Best effort.
        }
        return new SuiteCadApplyOutcome(true);
    }
}
