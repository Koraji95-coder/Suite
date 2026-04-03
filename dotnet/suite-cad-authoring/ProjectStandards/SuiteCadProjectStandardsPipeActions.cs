using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SuiteCadAuthoring
{
    internal static class SuiteCadProjectStandardsPipeActions
    {
        private const int MaxInspectedDrawings = 12;
        private static readonly string[] NativeCommandHints =
        {
            "CHECKSTANDARDS",
            "STANDARDS",
            "STANDARDSVIOLATION",
            "AEAUDIT",
            "AEAUDITDWG",
            "AUDIT",
        };

        internal static JsonObject? HandleAction(string action, JsonObject payload)
        {
            switch (action)
            {
                case "suite_project_standards_review":
                    return RunProjectStandardsReview(payload);
                default:
                    return null;
            }
        }

        private static JsonObject RunProjectStandardsReview(JsonObject payload)
        {
            var selectedStandardIds = ReadStringList(payload["selectedStandardIds"]);
            if (selectedStandardIds.Count == 0)
            {
                return BuildFailure(
                    "INVALID_REQUEST",
                    "selectedStandardIds must include at least one standard.");
            }

            var drawingPaths = ReadStringList(payload["drawingPaths"])
                .Where(path => Path.IsPathRooted(path) && File.Exists(path))
                .Distinct(System.StringComparer.OrdinalIgnoreCase)
                .ToList();
            var dwsPaths = ReadStringList(payload["dwsPaths"])
                .Where(path => Path.IsPathRooted(path) && File.Exists(path))
                .Distinct(System.StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (drawingPaths.Count == 0)
            {
                var failureMessage = "Native standards review could not find any DWG files under the configured project root.";
                return BuildReviewResult(
                    selectedStandardIds,
                    status: "fail",
                    message: failureMessage,
                    warnings: new List<string>(),
                    summary: new Dictionary<string, object>
                    {
                        ["drawingCount"] = 0,
                        ["inspectedDrawingCount"] = 0,
                        ["dwsFileCount"] = dwsPaths.Count,
                        ["suspiciousLayerCount"] = 0,
                        ["openFailureCount"] = 0,
                        ["activeDocumentName"] = NormalizeText(Application.DocumentManager.MdiActiveDocument?.Name),
                        ["providerPath"] = "dotnet+inproc",
                    },
                    dwsPaths: dwsPaths.Select(Path.GetFileName).ToList(),
                    inspectedDrawings: new List<string>(),
                    layerAlerts: new List<string>());
            }

            var inspectedDrawings = new List<string>();
            var warnings = new List<string>();
            var layerAlerts = new List<string>();
            var suspiciousLayerCount = 0;
            var openFailureCount = 0;
            var inspectedCount = 0;
            var detectedElectricalLayers = false;

            foreach (var drawingPath in drawingPaths.Take(MaxInspectedDrawings))
            {
                try
                {
                    using (var database = new Database(false, true))
                    {
                        database.ReadDwgFile(drawingPath, FileShare.ReadWrite, true, string.Empty);
                        database.CloseInput(true);

                        using (var transaction = database.TransactionManager.StartTransaction())
                        {
                            if (!database.LayerTableId.IsNull)
                            {
                                var layerTable = (LayerTable)transaction.GetObject(
                                    database.LayerTableId,
                                    OpenMode.ForRead);
                                foreach (ObjectId layerId in layerTable)
                                {
                                    var layerRecord = (LayerTableRecord)transaction.GetObject(
                                        layerId,
                                        OpenMode.ForRead);
                                    var layerName = NormalizeText(layerRecord.Name);
                                    if (layerName.Length == 0)
                                    {
                                        continue;
                                    }

                                    if (LooksLikeElectricalLayer(layerName))
                                    {
                                        detectedElectricalLayers = true;
                                    }

                                    if (LooksSuspiciousLayerName(layerName))
                                    {
                                        suspiciousLayerCount += 1;
                                        if (layerAlerts.Count < 10)
                                        {
                                            layerAlerts.Add(
                                                $"{Path.GetFileName(drawingPath)} | {layerName}");
                                        }
                                    }
                                }
                            }

                            transaction.Commit();
                        }
                    }

                    inspectedCount += 1;
                    inspectedDrawings.Add(Path.GetFileName(drawingPath));
                }
                catch (System.Exception ex)
                {
                    openFailureCount += 1;
                    if (warnings.Count < 10)
                    {
                        warnings.Add(
                            $"Unable to inspect {Path.GetFileName(drawingPath)}: {ex.Message}");
                    }
                }
            }

            if (dwsPaths.Count == 0)
            {
                warnings.Add(
                    "No .dws standards files were found under the project root. CHECKSTANDARDS-style enforcement is not yet anchored to a project DWS file.");
            }

            if (!detectedElectricalLayers)
            {
                warnings.Add(
                    "The inspected drawings did not expose obvious electrical layer markers. Review the project package before issue.");
            }

            string status;
            string message;
            if (inspectedCount == 0)
            {
                status = "fail";
                message = "Native standards review could not inspect any project drawings.";
            }
            else if (openFailureCount > 0 || suspiciousLayerCount > 0 || dwsPaths.Count == 0)
            {
                status = "warning";
                message =
                    $"Native standards review inspected {inspectedCount} drawing(s) and found follow-up items before issue.";
            }
            else
            {
                status = "pass";
                message =
                    $"Native standards review inspected {inspectedCount} drawing(s) with no obvious layer or project-standards blockers.";
            }

            return BuildReviewResult(
                selectedStandardIds,
                status,
                message,
                warnings,
                new Dictionary<string, object>
                {
                    ["drawingCount"] = drawingPaths.Count,
                    ["inspectedDrawingCount"] = inspectedCount,
                    ["dwsFileCount"] = dwsPaths.Count,
                    ["suspiciousLayerCount"] = suspiciousLayerCount,
                    ["openFailureCount"] = openFailureCount,
                    ["activeDocumentName"] = NormalizeText(Application.DocumentManager.MdiActiveDocument?.Name),
                    ["providerPath"] = "dotnet+inproc",
                },
                dwsPaths.Select(Path.GetFileName).ToList(),
                inspectedDrawings,
                layerAlerts);
        }

        private static JsonObject BuildReviewResult(
            IReadOnlyList<string> selectedStandardIds,
            string status,
            string message,
            IReadOnlyList<string> warnings,
            IReadOnlyDictionary<string, object> summary,
            IReadOnlyList<string> dwsPaths,
            IReadOnlyList<string> inspectedDrawings,
            IReadOnlyList<string> layerAlerts)
        {
            var results = new JsonArray();
            foreach (var standardId in selectedStandardIds)
            {
                results.Add(new JsonObject
                {
                    ["standardId"] = standardId,
                    ["status"] = status,
                    ["message"] = message,
                });
            }

            var warningArray = new JsonArray();
            foreach (var warning in warnings.Where(item => !string.IsNullOrWhiteSpace(item)))
            {
                warningArray.Add(warning);
            }

            var summaryNode = new JsonObject();
            foreach (var pair in summary)
            {
                switch (pair.Value)
                {
                    case int intValue:
                        summaryNode[pair.Key] = intValue;
                        break;
                    case string stringValue when !string.IsNullOrWhiteSpace(stringValue):
                        summaryNode[pair.Key] = stringValue;
                        break;
                }
            }

            return new JsonObject
            {
                ["success"] = true,
                ["code"] = string.Empty,
                ["message"] = message,
                ["warnings"] = warningArray,
                ["data"] = new JsonObject
                {
                    ["results"] = results,
                    ["summary"] = summaryNode,
                    ["dwsPaths"] = ToJsonArray(dwsPaths),
                    ["inspectedDrawings"] = ToJsonArray(inspectedDrawings),
                    ["layerAlerts"] = ToJsonArray(layerAlerts),
                },
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet+inproc",
                    ["nativeReview"] = true,
                    ["nativeCommandHints"] = ToJsonArray(NativeCommandHints),
                },
            };
        }

        private static JsonObject BuildFailure(string code, string message)
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = code,
                ["message"] = message,
                ["warnings"] = new JsonArray(),
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet+inproc",
                },
            };
        }

        private static bool LooksLikeElectricalLayer(string layerName)
        {
            var upper = layerName.Trim().ToUpperInvariant();
            return upper.StartsWith("WD_")
                || upper.StartsWith("ACE_")
                || upper.StartsWith("E-")
                || upper.StartsWith("WIRE")
                || upper.Contains("PANEL")
                || upper.Contains("TERM");
        }

        private static bool LooksSuspiciousLayerName(string layerName)
        {
            if (string.IsNullOrWhiteSpace(layerName))
            {
                return false;
            }

            if (layerName.Contains("  ") || layerName.Any(char.IsWhiteSpace))
            {
                return true;
            }

            return false;
        }

        private static List<string> ReadStringList(JsonNode node)
        {
            var output = new List<string>();
            if (node is not JsonArray array)
            {
                return output;
            }

            foreach (var entry in array)
            {
                var value = NormalizeText(entry?.GetValue<string>());
                if (value.Length > 0)
                {
                    output.Add(value);
                }
            }

            return output;
        }

        private static JsonArray ToJsonArray(IEnumerable<string> values)
        {
            var array = new JsonArray();
            foreach (var value in values)
            {
                array.Add(value);
            }
            return array;
        }

        private static string NormalizeText(string value)
        {
            return (value ?? string.Empty).Trim();
        }
    }
}
