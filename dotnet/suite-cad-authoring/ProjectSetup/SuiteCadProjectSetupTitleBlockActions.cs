using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json.Nodes;
using System.Threading;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SuiteCadAuthoring
{
    internal readonly struct ProjectSetupAcadeVerificationResult
    {
        internal ProjectSetupAcadeVerificationResult(bool ok, string message, IReadOnlyList<string> warnings)
        {
            Ok = ok;
            Message = message ?? string.Empty;
            Warnings = warnings ?? Array.Empty<string>();
        }

        internal bool Ok { get; }

        internal string Message { get; }

        internal IReadOnlyList<string> Warnings { get; }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        private const string DefaultProjectSetupBlockNameHint = "R3P-24x36BORDER&TITLE";
        private static readonly string[] DefaultProjectSetupAttributeTags =
        {
            "DWGNO",
            "TITLE1",
            "TITLE2",
            "TITLE3",
            "PROJ",
            "WD_TB",
        };

        internal static JsonObject HandlePipeDrawingListScan(JsonObject payload)
        {
            var drawingPaths = ReadProjectSetupStringList(payload["drawingPaths"]);
            if (drawingPaths.Count <= 0)
            {
                return BuildProjectSetupFailureEnvelope(
                    "suite_drawing_list_scan",
                    "INVALID_REQUEST",
                    "drawingPaths must contain at least one DWG path."
                );
            }

            var blockNameHint = ReadProjectSetupBlockNameHint(payload);
            var attributeTags = ReadProjectSetupAttributeTags(payload);

            return SuiteCadPipeHost.InvokeOnApplicationThread(
                () => ExecuteProjectSetupDrawingListScan(drawingPaths, blockNameHint, attributeTags)
            );
        }

        internal static JsonObject HandlePipeTitleBlockApply(JsonObject payload)
        {
            var filesNode = payload["files"] as JsonArray;
            if (filesNode is null || filesNode.Count <= 0)
            {
                return BuildProjectSetupFailureEnvelope(
                    "suite_title_block_apply",
                    "INVALID_REQUEST",
                    "files must contain at least one apply target."
                );
            }

            var blockNameHint = ReadProjectSetupBlockNameHint(payload);
            var projectRootPath = ReadProjectSetupString(payload, "projectRootPath");
            var expectedWdtPath = ReadProjectSetupString(payload, "expectedWdtPath");
            var acadeUpdateTimeoutMs = ClampProjectSetupInt(
                ReadProjectSetupInt(payload, "acadeUpdateTimeoutMs", 45_000),
                5_000,
                5 * 60 * 1000
            );
            var triggerAcadeUpdate = ReadProjectSetupBool(payload, "triggerAcadeUpdate", fallback: true);

            return SuiteCadPipeHost.InvokeOnApplicationThread(
                () =>
                    ExecuteProjectSetupTitleBlockApply(
                        filesNode,
                        blockNameHint,
                        projectRootPath,
                        expectedWdtPath,
                        triggerAcadeUpdate,
                        acadeUpdateTimeoutMs
                    )
            );
        }

        internal static JsonObject BuildProjectSetupDrawingScanResponse(
            JsonArray drawings,
            IReadOnlyList<string> warnings
        )
        {
            return new JsonObject
            {
                ["success"] = true,
                ["code"] = string.Empty,
                ["message"] = "Drawing list scan completed.",
                ["data"] = new JsonObject
                {
                    ["drawings"] = drawings,
                },
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet+inproc",
                    ["action"] = "suite_drawing_list_scan",
                    ["drawingCount"] = drawings.Count,
                },
                ["warnings"] = ToProjectSetupJsonArray(warnings),
            };
        }

        internal static JsonObject BuildProjectSetupTitleBlockApplySuccessResponse(
            JsonArray files,
            int updatedCount,
            bool acadeUpdateQueued,
            bool acadeUpdateCompleted,
            bool acadeProjectVerified,
            int acadeUpdateTimeoutMs,
            IReadOnlyList<string> warnings
        )
        {
            return new JsonObject
            {
                ["success"] = true,
                ["code"] = string.Empty,
                ["message"] = "Title block apply completed.",
                ["data"] = BuildProjectSetupTitleBlockApplyData(
                    files,
                    updatedCount,
                    acadeUpdateQueued,
                    acadeUpdateCompleted,
                    acadeProjectVerified,
                    acadeUpdateTimeoutMs
                ),
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet+inproc",
                    ["action"] = "suite_title_block_apply",
                    ["fileCount"] = files.Count,
                },
                ["warnings"] = ToProjectSetupJsonArray(warnings),
            };
        }

        private static JsonObject ExecuteProjectSetupDrawingListScan(
            IReadOnlyList<string> drawingPaths,
            string blockNameHint,
            IReadOnlyList<string> attributeTags
        )
        {
            var warnings = new List<string>();
            var drawings = new JsonArray();

            foreach (var drawingPath in drawingPaths)
            {
                var normalizedPath = NormalizeText(drawingPath);
                if (normalizedPath.Length <= 0)
                {
                    continue;
                }

                var rowWarnings = new List<string>();
                try
                {
                    drawings.Add(
                        BuildProjectSetupDrawingScanRow(
                            normalizedPath,
                            blockNameHint,
                            attributeTags,
                            rowWarnings
                        )
                    );
                }
                catch (Exception ex)
                {
                    drawings.Add(
                        BuildProjectSetupDrawingScanFailureRow(
                            normalizedPath,
                            $"Drawing scan failed for '{normalizedPath}': {ex.Message}"
                        )
                    );
                }

                warnings.AddRange(rowWarnings);
            }

            return BuildProjectSetupDrawingScanResponse(drawings, warnings);
        }

        private static JsonObject ExecuteProjectSetupTitleBlockApply(
            JsonArray filesNode,
            string blockNameHint,
            string projectRootPath,
            string expectedWdtPath,
            bool triggerAcadeUpdate,
            int acadeUpdateTimeoutMs
        )
        {
            var warnings = new List<string>();
            var filesArray = new JsonArray();
            var updatedCount = 0;
            var acadeUpdateQueued = false;
            var acadeUpdateCompleted = false;
            var acadeProjectVerified = false;
            var acadeVerificationByPath = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
            var startingDocument = Application.DocumentManager?.MdiActiveDocument;

            try
            {
                if (triggerAcadeUpdate)
                {
                    var verification = VerifyProjectSetupAcadeUpdateContext(projectRootPath, expectedWdtPath);
                    acadeProjectVerified = verification.Ok;
                    if (!verification.Ok)
                    {
                        return BuildProjectSetupFailureEnvelope(
                            "suite_title_block_apply",
                            "INVALID_REQUEST",
                            verification.Message,
                            stage: "acade_verify",
                            data: BuildProjectSetupTitleBlockApplyData(
                                new JsonArray(),
                                0,
                                acadeUpdateQueued,
                                acadeUpdateCompleted,
                                acadeProjectVerified,
                                acadeUpdateTimeoutMs
                            ),
                            warnings: verification.Warnings
                        );
                    }

                    warnings.AddRange(verification.Warnings);
                    if (!TryExecuteProjectSetupAcadeTitleBlockUpdate(out var commandFailure))
                    {
                        return BuildProjectSetupFailureEnvelope(
                            "suite_title_block_apply",
                            "ACADE_UPDATE_FAILED",
                            $"Unable to execute AEUPDATETITLEBLOCK automatically: {commandFailure}",
                            stage: "acade_execute",
                            data: BuildProjectSetupTitleBlockApplyData(
                                new JsonArray(),
                                0,
                                acadeUpdateQueued,
                                acadeUpdateCompleted,
                                acadeProjectVerified,
                                acadeUpdateTimeoutMs
                            ),
                            warnings: warnings
                        );
                    }

                    acadeUpdateQueued = true;
                    acadeUpdateCompleted = WaitForProjectSetupCommandToClear(
                        "AEUPDATETITLEBLOCK",
                        TimeSpan.FromMilliseconds(acadeUpdateTimeoutMs),
                        warnings
                    );
                    if (!acadeUpdateCompleted)
                    {
                        return BuildProjectSetupFailureEnvelope(
                            "suite_title_block_apply",
                            "ACADE_UPDATE_NOT_CONFIRMED",
                            "AEUPDATETITLEBLOCK did not complete within the confirmation window.",
                            stage: "acade_wait",
                            data: BuildProjectSetupTitleBlockApplyData(
                                new JsonArray(),
                                0,
                                acadeUpdateQueued,
                                acadeUpdateCompleted,
                                acadeProjectVerified,
                                acadeUpdateTimeoutMs
                            ),
                            warnings: warnings
                        );
                    }
                }

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

                        var path = NormalizeText(ReadProjectSetupString(entry, "path"));
                        var relativePath = NormalizeText(ReadProjectSetupString(entry, "relativePath"));
                        if (string.IsNullOrWhiteSpace(path))
                        {
                            continue;
                        }

                        var expectedAcadeValues = ReadProjectSetupStringMap(entry, "expectedAcadeValues");
                        if (expectedAcadeValues.Count <= 0)
                        {
                            continue;
                        }

                        var verificationWarnings = new List<string>();
                        JsonObject verificationResult;
                        try
                        {
                            verificationResult = VerifyProjectSetupTitleBlockAttributeMap(
                                path,
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
                        warnings.AddRange(verificationWarnings);

                        var verified = verificationResult["verified"]?.GetValue<bool>() ?? false;
                        if (!verified)
                        {
                            unverifiedCount += 1;
                        }

                        verificationFiles.Add(
                            new JsonObject
                            {
                                ["path"] = path,
                                ["relativePath"] = string.IsNullOrWhiteSpace(relativePath) ? null : relativePath,
                                ["verified"] = verified,
                                ["matched"] = verificationResult["matched"]?.GetValue<int>() ?? 0,
                                ["mismatched"] = verificationResult["mismatched"]?.GetValue<int>() ?? 0,
                                ["missing"] = verificationResult["missing"]?.GetValue<int>() ?? 0,
                                ["receipts"] = verificationResult["receipts"] as JsonArray ?? new JsonArray(),
                                ["warnings"] = ToProjectSetupJsonArray(verificationWarnings),
                            }
                        );
                    }

                    if (unverifiedCount > 0)
                    {
                        return BuildProjectSetupFailureEnvelope(
                            "suite_title_block_apply",
                            "ACADE_UPDATE_UNVERIFIED",
                            $"AEUPDATETITLEBLOCK did not produce the expected ACADE-owned values for {unverifiedCount} drawing(s).",
                            stage: "acade_verify_values",
                            data: BuildProjectSetupTitleBlockApplyData(
                                verificationFiles,
                                0,
                                acadeUpdateQueued,
                                acadeUpdateCompleted,
                                acadeProjectVerified,
                                acadeUpdateTimeoutMs
                            ),
                            warnings: warnings
                        );
                    }
                }

                foreach (var entryNode in filesNode)
                {
                    if (entryNode is not JsonObject entry)
                    {
                        continue;
                    }

                    var path = NormalizeText(ReadProjectSetupString(entry, "path"));
                    var relativePath = NormalizeText(ReadProjectSetupString(entry, "relativePath"));
                    if (string.IsNullOrWhiteSpace(path))
                    {
                        continue;
                    }

                    var updates = ReadProjectSetupStringMap(entry, "updates");
                    var rowWarnings = new List<string>();
                    JsonObject commitResult;
                    try
                    {
                        commitResult = CommitProjectSetupTitleBlockAttributeMap(
                            path,
                            blockNameHint,
                            updates,
                            rowWarnings
                        );
                        if (commitResult["wroteChanges"]?.GetValue<bool>() ?? false)
                        {
                            updatedCount += commitResult["updated"]?.GetValue<int>() ?? 0;
                        }

                        filesArray.Add(
                            new JsonObject
                            {
                                ["path"] = path,
                                ["relativePath"] = string.IsNullOrWhiteSpace(relativePath) ? null : relativePath,
                                ["wroteChanges"] = commitResult["wroteChanges"]?.GetValue<bool>() ?? false,
                                ["updated"] = commitResult["updated"]?.GetValue<int>() ?? 0,
                                ["unchanged"] = commitResult["unchanged"]?.GetValue<int>() ?? 0,
                                ["missing"] = commitResult["missing"]?.GetValue<int>() ?? 0,
                                ["failed"] = commitResult["failed"]?.GetValue<int>() ?? 0,
                                ["acadeVerification"] = acadeVerificationByPath.TryGetValue(path, out var verificationNode)
                                    ? verificationNode
                                    : null,
                                ["receipts"] = commitResult["receipts"] as JsonArray ?? new JsonArray(),
                                ["warnings"] = ToProjectSetupJsonArray(rowWarnings),
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
                                ["acadeVerification"] = acadeVerificationByPath.TryGetValue(path, out var verificationNode)
                                    ? verificationNode
                                    : null,
                                ["receipts"] = new JsonArray(),
                                ["warnings"] = ToProjectSetupJsonArray(
                                    new[] { $"Apply failed for '{path}': {ex.Message}" }
                                ),
                            }
                        );
                    }

                    warnings.AddRange(rowWarnings);
                }

                return BuildProjectSetupTitleBlockApplySuccessResponse(
                    filesArray,
                    updatedCount,
                    acadeUpdateQueued,
                    acadeUpdateCompleted,
                    acadeProjectVerified,
                    acadeUpdateTimeoutMs,
                    warnings
                );
            }
            finally
            {
                if (startingDocument != null)
                {
                    try
                    {
                        Application.DocumentManager.MdiActiveDocument = startingDocument;
                    }
                    catch
                    {
                        // Best effort restore only.
                    }
                }
            }
        }

        private static JsonObject BuildProjectSetupFailureEnvelope(
            string action,
            string code,
            string message,
            string? stage = null,
            JsonObject? data = null,
            IReadOnlyList<string>? warnings = null
        )
        {
            var meta = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet+inproc",
                ["action"] = action,
            };
            if (!string.IsNullOrWhiteSpace(stage))
            {
                meta["stage"] = stage;
            }

            return new JsonObject
            {
                ["success"] = false,
                ["code"] = code,
                ["message"] = message,
                ["data"] = data ?? new JsonObject(),
                ["meta"] = meta,
                ["warnings"] = ToProjectSetupJsonArray(warnings ?? Array.Empty<string>()),
            };
        }

        private static JsonObject BuildProjectSetupDrawingScanRow(
            string drawingPath,
            string blockNameHint,
            IReadOnlyList<string> attributeTags,
            List<string> warnings
        )
        {
            using var database = new Database(false, true);
            database.ReadDwgFile(drawingPath, FileShare.ReadWrite, true, string.Empty);
            database.CloseInput(true);

            using var transaction = database.TransactionManager.StartTransaction();
            if (
                !TryResolveProjectSetupTitleBlockCandidate(
                    database,
                    transaction,
                    attributeTags,
                    blockNameHint,
                    allowAmbiguousBestMatch: true,
                    warnings,
                    out var candidate
                )
            )
            {
                return BuildProjectSetupDrawingScanFailureRow(drawingPath, warnings);
            }

            var attributes = new JsonObject();
            foreach (
                var entry in candidate!.AttributesByTag.OrderBy(
                    item => item.Key,
                    StringComparer.OrdinalIgnoreCase
                )
            )
            {
                attributes[entry.Key] = NormalizeText(entry.Value.TextString);
            }

            transaction.Commit();

            return new JsonObject
            {
                ["path"] = drawingPath,
                ["titleBlockFound"] = true,
                ["blockName"] = string.IsNullOrWhiteSpace(candidate.BlockName) ? null : candidate.BlockName,
                ["layoutName"] = string.IsNullOrWhiteSpace(candidate.LayoutName) ? null : candidate.LayoutName,
                ["handle"] = string.IsNullOrWhiteSpace(candidate.Handle) ? null : candidate.Handle,
                ["hasWdTb"] = candidate.AttributesByTag.ContainsKey("WD_TB"),
                ["attributes"] = attributes,
                ["warnings"] = ToProjectSetupJsonArray(warnings),
            };
        }

        private static JsonObject BuildProjectSetupDrawingScanFailureRow(
            string drawingPath,
            IReadOnlyList<string> warnings
        )
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
                ["warnings"] = ToProjectSetupJsonArray(warnings),
            };
        }

        private static JsonObject BuildProjectSetupDrawingScanFailureRow(
            string drawingPath,
            string warning
        )
        {
            return BuildProjectSetupDrawingScanFailureRow(drawingPath, new[] { warning });
        }

        private static JsonObject BuildProjectSetupTitleBlockApplyData(
            JsonArray files,
            int updatedCount,
            bool acadeUpdateQueued,
            bool acadeUpdateCompleted,
            bool acadeProjectVerified,
            int acadeUpdateTimeoutMs
        )
        {
            return new JsonObject
            {
                ["files"] = files,
                ["updated"] = updatedCount,
                ["acadeUpdateQueued"] = acadeUpdateQueued,
                ["acadeUpdateCompleted"] = acadeUpdateCompleted,
                ["acadeProjectVerified"] = acadeProjectVerified,
                ["acadeUpdateTimeoutMs"] = acadeUpdateTimeoutMs,
            };
        }

        private static JsonObject VerifyProjectSetupTitleBlockAttributeMap(
            string drawingPath,
            string blockNameHint,
            IReadOnlyDictionary<string, string> expectedValues,
            List<string> warnings
        )
        {
            Document? document = null;
            var openedByPlugin = false;

            try
            {
                document = OpenOrReuseDocument(drawingPath, out openedByPlugin);
                Application.DocumentManager.MdiActiveDocument = document;

                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    if (
                        !TryResolveProjectSetupTitleBlockCandidate(
                            document.Database,
                            transaction,
                            expectedValues.Keys.ToArray(),
                            blockNameHint,
                            allowAmbiguousBestMatch: true,
                            warnings,
                            out var candidate
                        )
                    )
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
                        var attributeTag = NormalizeText(update.Key).ToUpperInvariant();
                        if (!candidate!.AttributesByTag.TryGetValue(attributeTag, out var attributeRef))
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

                        var currentValue = NormalizeText(attributeRef.TextString);
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

                    transaction.Commit();

                    return new JsonObject
                    {
                        ["verified"] = mismatched == 0 && missing == 0,
                        ["matched"] = matched,
                        ["mismatched"] = mismatched,
                        ["missing"] = missing,
                        ["receipts"] = receipts,
                    };
                }
            }
            finally
            {
                if (document != null && openedByPlugin)
                {
                    try
                    {
                        document.CloseAndDiscard();
                    }
                    catch
                    {
                        // Best effort cleanup only.
                    }
                }
            }
        }

        private static JsonObject CommitProjectSetupTitleBlockAttributeMap(
            string drawingPath,
            string blockNameHint,
            IReadOnlyDictionary<string, string> updates,
            List<string> warnings
        )
        {
            Document? document = null;
            var openedByPlugin = false;
            var drawingChanged = false;

            try
            {
                document = OpenOrReuseDocument(drawingPath, out openedByPlugin);
                Application.DocumentManager.MdiActiveDocument = document;

                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    if (
                        !TryResolveProjectSetupTitleBlockCandidate(
                            document.Database,
                            transaction,
                            updates.Keys.ToArray(),
                            blockNameHint,
                            allowAmbiguousBestMatch: true,
                            warnings,
                            out var candidate
                        )
                    )
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
                        var attributeTag = NormalizeText(update.Key).ToUpperInvariant();
                        var targetValue = update.Value ?? string.Empty;
                        if (!candidate!.AttributesByTag.TryGetValue(attributeTag, out var attribute))
                        {
                            missing += 1;
                            continue;
                        }

                        var previousValue = NormalizeText(attribute.TextString);
                        try
                        {
                            if (!ApplySharedTitleBlockAttributeValue(attribute, targetValue, warnings))
                            {
                                unchanged += 1;
                                continue;
                            }

                            drawingChanged = true;
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
                            warnings.Add($"Title block write failed for '{attributeTag}': {ex.Message}");
                        }
                    }

                    transaction.Commit();

                    if (drawingChanged)
                    {
                        document.Database.SaveAs(drawingPath, DwgVersion.Current);
                    }

                    return new JsonObject
                    {
                        ["wroteChanges"] = drawingChanged,
                        ["updated"] = updated,
                        ["unchanged"] = unchanged,
                        ["missing"] = missing,
                        ["failed"] = failed,
                        ["receipts"] = receipts,
                    };
                }
            }
            finally
            {
                if (document != null && openedByPlugin)
                {
                    try
                    {
                        document.CloseAndDiscard();
                    }
                    catch
                    {
                        // Best effort cleanup only.
                    }
                }
            }
        }

        private static bool TryResolveProjectSetupTitleBlockCandidate(
            Database database,
            Transaction transaction,
            IReadOnlyCollection<string> attributeTags,
            string blockNameHint,
            bool allowAmbiguousBestMatch,
            List<string> warnings,
            out TitleBlockCandidate? candidate
        )
        {
            candidate = null;
            var candidates = FindTitleBlockCandidates(database, transaction, attributeTags, blockNameHint);
            var selection = SelectTitleBlockCandidate(candidates);
            if (!selection.Found)
            {
                return false;
            }

            if (selection.HasAmbiguousBestMatch)
            {
                if (!allowAmbiguousBestMatch)
                {
                    warnings.Add("Title block candidate resolved to multiple in-process matches and was skipped.");
                    return false;
                }

                var selected = selection.Selected!;
                warnings.Add(
                    $"Multiple title block candidates matched '{blockNameHint}'. Using {(string.IsNullOrWhiteSpace(selected.Handle) ? "the best scored match" : $"handle {selected.Handle}")} in layout '{selected.LayoutName}'."
                );
            }

            candidate = selection.Selected;
            return candidate != null;
        }

        private static ProjectSetupAcadeVerificationResult VerifyProjectSetupAcadeUpdateContext(
            string projectRootPath,
            string expectedWdtPath
        )
        {
            var warnings = new List<string>();
            var activeDocument = Application.DocumentManager?.MdiActiveDocument;
            var activeFullName = GetDocumentPath(activeDocument);
            if (string.IsNullOrWhiteSpace(activeFullName))
            {
                return new ProjectSetupAcadeVerificationResult(
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
                    return new ProjectSetupAcadeVerificationResult(
                        false,
                        $"Unable to normalize the project root for ACADE verification: {ex.Message}",
                        warnings
                    );
                }

                if (!Directory.Exists(normalizedProjectRoot))
                {
                    return new ProjectSetupAcadeVerificationResult(
                        false,
                        "The selected project root does not exist on disk.",
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
                    return new ProjectSetupAcadeVerificationResult(
                        false,
                        "The active AutoCAD drawing is not inside the selected project root. Open a drawing from the target AutoCAD Electrical project first.",
                        warnings
                    );
                }

                if (
                    !Directory
                        .EnumerateFiles(normalizedProjectRoot, "*.wdp", SearchOption.TopDirectoryOnly)
                        .Any()
                )
                {
                    return new ProjectSetupAcadeVerificationResult(
                        false,
                        "No .WDP project file was found in the selected AutoCAD Electrical project root.",
                        warnings
                    );
                }
            }

            if (!string.IsNullOrWhiteSpace(expectedWdtPath) && !File.Exists(expectedWdtPath))
            {
                return new ProjectSetupAcadeVerificationResult(
                    false,
                    "The generated .WDT mapping file is missing from the selected project root.",
                    warnings
                );
            }

            return new ProjectSetupAcadeVerificationResult(true, "ACADE update context verified.", warnings);
        }

        private static bool TryExecuteProjectSetupAcadeTitleBlockUpdate(out string failureMessage)
        {
            failureMessage = string.Empty;

            var document = Application.DocumentManager?.MdiActiveDocument;
            var editor = document?.Editor;
            if (editor == null)
            {
                failureMessage = "AutoCAD does not have an active editor for AEUPDATETITLEBLOCK.";
                return false;
            }

            var commandMethod = editor
                .GetType()
                .GetMethod(
                    "Command",
                    BindingFlags.Public | BindingFlags.Instance,
                    binder: null,
                    types: new[] { typeof(object[]) },
                    modifiers: null
                );
            var commandAsyncMethod = editor
                .GetType()
                .GetMethod(
                    "CommandAsync",
                    BindingFlags.Public | BindingFlags.Instance,
                    binder: null,
                    types: new[] { typeof(object[]) },
                    modifiers: null
                );
            if (commandMethod == null && commandAsyncMethod == null)
            {
                failureMessage =
                    "AutoCAD does not expose Editor.Command or Editor.CommandAsync for AEUPDATETITLEBLOCK.";
                return false;
            }

            foreach (var commandVariant in new[] { new object[] { "_.AEUPDATETITLEBLOCK" }, new object[] { "_.AEUPDATETITLEBLOCK", "" } })
            {
                if (
                    TryExecuteInPreferredCommandContextQuiet(
                        () =>
                        {
                            if (commandAsyncMethod != null)
                            {
                                var commandResult = commandAsyncMethod.Invoke(
                                    editor,
                                    new object[] { commandVariant }
                                );
                                commandResult?
                                    .GetType()
                                    .GetMethod(
                                        "GetResult",
                                        BindingFlags.Public | BindingFlags.Instance
                                    )
                                    ?.Invoke(commandResult, null);
                                return true;
                            }

                            commandMethod!.Invoke(editor, new object[] { commandVariant });
                            return true;
                        },
                        out bool commandExecuted,
                        out var commandFailure
                    )
                    && commandExecuted
                )
                {
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(commandFailure))
                {
                    failureMessage = commandFailure;
                }
            }

            if (string.IsNullOrWhiteSpace(failureMessage))
            {
                failureMessage = "AEUPDATETITLEBLOCK command invocation did not complete.";
            }

            return false;
        }

        private static bool WaitForProjectSetupCommandToClear(
            string commandName,
            TimeSpan timeout,
            List<string> warnings
        )
        {
            var normalizedCommand = NormalizeText(commandName).ToUpperInvariant();
            if (normalizedCommand.Length <= 0)
            {
                return true;
            }

            var deadlineUtc = DateTime.UtcNow.Add(timeout);
            while (DateTime.UtcNow < deadlineUtc)
            {
                var activeCommands = ResolveActiveCommandNames();
                if (!activeCommands.Contains(normalizedCommand, StringComparison.Ordinal))
                {
                    return true;
                }

                Thread.Sleep(250);
            }

            warnings.Add(
                $"Timed out waiting for {normalizedCommand} to leave the AutoCAD command stack."
            );
            return false;
        }

        private static string ReadProjectSetupBlockNameHint(JsonObject payload)
        {
            var blockNameHint = ReadProjectSetupString(payload, "blockNameHint");
            return string.IsNullOrWhiteSpace(blockNameHint)
                ? DefaultProjectSetupBlockNameHint
                : blockNameHint;
        }

        private static IReadOnlyList<string> ReadProjectSetupAttributeTags(JsonObject payload)
        {
            var attributeTags = ReadProjectSetupStringList(payload["attributeTags"]);
            return attributeTags.Count <= 0 ? DefaultProjectSetupAttributeTags : attributeTags;
        }

        private static string ReadProjectSetupString(JsonObject payload, string propertyName)
        {
            if (
                payload.TryGetPropertyValue(propertyName, out var valueNode)
                && valueNode is JsonValue jsonValue
                && jsonValue.TryGetValue<string>(out var stringValue)
            )
            {
                return NormalizeText(stringValue);
            }

            return string.Empty;
        }

        private static bool ReadProjectSetupBool(
            JsonObject payload,
            string propertyName,
            bool fallback
        )
        {
            if (
                payload.TryGetPropertyValue(propertyName, out var valueNode)
                && valueNode is JsonValue jsonValue
                && jsonValue.TryGetValue<bool>(out var boolValue)
            )
            {
                return boolValue;
            }

            return fallback;
        }

        private static int ReadProjectSetupInt(
            JsonObject payload,
            string propertyName,
            int fallback
        )
        {
            if (
                payload.TryGetPropertyValue(propertyName, out var valueNode)
                && valueNode is JsonValue jsonValue
                && jsonValue.TryGetValue<int>(out var intValue)
            )
            {
                return intValue;
            }

            return fallback;
        }

        private static Dictionary<string, string> ReadProjectSetupStringMap(
            JsonObject payload,
            string propertyName
        )
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (
                !payload.TryGetPropertyValue(propertyName, out var valueNode)
                || valueNode is not JsonObject mapNode
            )
            {
                return map;
            }

            foreach (var entry in mapNode)
            {
                var key = NormalizeText(entry.Key);
                if (key.Length <= 0)
                {
                    continue;
                }

                map[key] = entry.Value?.ToString() ?? string.Empty;
            }

            return map;
        }

        private static List<string> ReadProjectSetupStringList(JsonNode? node)
        {
            var output = new List<string>();
            if (node is not JsonArray array)
            {
                return output;
            }

            foreach (var entry in array)
            {
                if (
                    entry is JsonValue jsonValue
                    && jsonValue.TryGetValue<string>(out var stringValue)
                    && !string.IsNullOrWhiteSpace(stringValue)
                )
                {
                    output.Add(NormalizeText(stringValue));
                }
            }

            return output;
        }

        private static JsonArray ToProjectSetupJsonArray(IEnumerable<string> values)
        {
            var array = new JsonArray();
            foreach (var value in values.Where(value => !string.IsNullOrWhiteSpace(value)))
            {
                array.Add(value);
            }

            return array;
        }

        private static int ClampProjectSetupInt(int value, int minimum, int maximum)
        {
            if (value < minimum)
            {
                return minimum;
            }

            if (value > maximum)
            {
                return maximum;
            }

            return value;
        }
    }
}
