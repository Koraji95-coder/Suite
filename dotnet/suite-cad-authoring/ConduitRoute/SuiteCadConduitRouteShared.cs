using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace SuiteCadAuthoring
{
    internal sealed class ConduitTerminalProfile
    {
        internal ConduitTerminalProfile(
            string[] panelIdKeys,
            string[] panelNameKeys,
            string[] sideKeys,
            string[] stripIdKeys,
            string[] stripNumberKeys,
            string[] terminalCountKeys,
            string[] terminalTagKeys,
            string[] terminalNameTokens,
            string[] blockNameAllowList,
            bool requireStripId,
            bool requireTerminalCount,
            bool requireSide,
            string defaultPanelPrefix,
            int defaultTerminalCount
        )
        {
            PanelIdKeys = panelIdKeys;
            PanelNameKeys = panelNameKeys;
            SideKeys = sideKeys;
            StripIdKeys = stripIdKeys;
            StripNumberKeys = stripNumberKeys;
            TerminalCountKeys = terminalCountKeys;
            TerminalTagKeys = terminalTagKeys;
            TerminalNameTokens = terminalNameTokens;
            BlockNameAllowList = blockNameAllowList;
            RequireStripId = requireStripId;
            RequireTerminalCount = requireTerminalCount;
            RequireSide = requireSide;
            DefaultPanelPrefix = string.IsNullOrWhiteSpace(defaultPanelPrefix)
                ? "PANEL"
                : defaultPanelPrefix.Trim().ToUpperInvariant();
            DefaultTerminalCount = Math.Max(1, Math.Min(2000, defaultTerminalCount));
        }

        internal string[] PanelIdKeys { get; }

        internal string[] PanelNameKeys { get; }

        internal string[] SideKeys { get; }

        internal string[] StripIdKeys { get; }

        internal string[] StripNumberKeys { get; }

        internal string[] TerminalCountKeys { get; }

        internal string[] TerminalTagKeys { get; }

        internal string[] TerminalNameTokens { get; }

        internal string[] BlockNameAllowList { get; }

        internal bool RequireStripId { get; }

        internal bool RequireTerminalCount { get; }

        internal bool RequireSide { get; }

        internal string DefaultPanelPrefix { get; }

        internal int DefaultTerminalCount { get; }
    }

    internal readonly record struct ConduitGeometryPoint(double X, double Y);

    internal sealed class ConduitJumperRecord
    {
        internal string JumperId { get; init; } = string.Empty;

        internal string PanelId { get; init; } = string.Empty;

        internal string FromStripId { get; init; } = string.Empty;

        internal int FromTerminal { get; init; }

        internal string ToStripId { get; init; } = string.Empty;

        internal int ToTerminal { get; init; }

        internal string SourceBlockName { get; init; } = string.Empty;

        internal string Resolution { get; init; } = "attribute";

        internal double? X { get; init; }

        internal double? Y { get; init; }
    }

    internal sealed class ConduitStripScanRecord
    {
        internal string PanelId { get; init; } = string.Empty;

        internal string Side { get; init; } = string.Empty;

        internal string StripId { get; init; } = string.Empty;

        internal int TerminalCount { get; init; }

        internal double X { get; init; }

        internal double Y { get; init; }

        internal double? MinY { get; init; }

        internal double? MaxY { get; init; }
    }

    internal sealed class ConduitPendingPositionalJumperCandidate
    {
        internal string JumperId { get; init; } = string.Empty;

        internal string PanelHint { get; init; } = string.Empty;

        internal string Handle { get; init; } = string.Empty;

        internal string BlockName { get; init; } = string.Empty;

        internal double X { get; init; }

        internal double Y { get; init; }
    }

    internal sealed class ConduitTerminalLabelWriteResult
    {
        internal int Updated { get; init; }

        internal int Unchanged { get; init; }

        internal int Missing { get; init; }

        internal int Failed { get; init; }
    }

    internal sealed class ConduitCadRoutePrimitive
    {
        internal string Kind { get; init; } = "line";

        internal ConduitGeometryPoint Start { get; init; }

        internal ConduitGeometryPoint End { get; init; }

        internal ConduitGeometryPoint Center { get; init; }

        internal double Radius { get; init; }

        internal double Turn { get; init; }
    }

    internal sealed class ConduitRawObstacle
    {
        internal string Type { get; init; } = string.Empty;

        internal string Label { get; init; } = string.Empty;

        internal double MinX { get; init; }

        internal double MinY { get; init; }

        internal double MaxX { get; init; }

        internal double MaxY { get; init; }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        private const double ConduitDefaultCanvasWidth = 980.0;
        private const double ConduitDefaultCanvasHeight = 560.0;
        private const double ConduitMinCanvasSize = 120.0;
        private const double ConduitViewportPadding = 20.0;
        private const double ConduitArcQuarterTurnTolerance = 1e-6;
        private const string ConduitRouteGeometryVersion = "v1.2";
        private const int MaxConduitRouteSessions = 96;

        private static readonly string[] ConduitDefaultPanelIdKeys =
        {
            "PANEL_ID",
            "PANEL",
            "PANEL_NAME",
            "CABINET",
            "BOARD",
        };

        private static readonly string[] ConduitDefaultPanelNameKeys =
        {
            "PANEL_NAME",
            "PANEL_DESC",
            "DESCRIPTION",
            "CABINET_NAME",
            "BOARD_NAME",
        };

        private static readonly string[] ConduitDefaultSideKeys =
        {
            "SIDE",
            "PANEL_SIDE",
            "SECTION",
            "LR",
        };

        private static readonly string[] ConduitDefaultStripNumberKeys =
        {
            "STRIP_NO",
            "STRIP_NUM",
            "STRIP_NUMBER",
            "NUMBER",
            "NO",
        };

        private static readonly string[] ConduitJumperNameTokens = { "JUMPER", "JMP" };

        private static readonly string[] ConduitJumperIdKeys =
        {
            "JUMPER_ID",
            "JUMPER",
            "JMP_ID",
            "JMP_REF",
            "JMP",
        };

        private static readonly string[] ConduitJumperPanelIdKeys = { "PANEL_ID", "PANEL" };

        private static readonly string[] ConduitJumperFromStripKeys =
        {
            "FROM_STRIP_ID",
            "FROM_STRIP",
            "FROM_TB",
            "FROM_TB_ID",
            "STRIP_ID_FROM",
        };

        private static readonly string[] ConduitJumperToStripKeys =
        {
            "TO_STRIP_ID",
            "TO_STRIP",
            "TO_TB",
            "TO_TB_ID",
            "STRIP_ID_TO",
        };

        private static readonly string[] ConduitJumperFromTermKeys =
        {
            "FROM_TERM",
            "FROM_TERMINAL",
            "FROM_POS",
            "FROM_POSITION",
            "TERM_FROM",
            "FROM",
        };

        private static readonly string[] ConduitJumperToTermKeys =
        {
            "TO_TERM",
            "TO_TERMINAL",
            "TO_POS",
            "TO_POSITION",
            "TERM_TO",
            "TO",
        };

        private static readonly HashSet<string> ConduitValidObstacleTypes = new(
            StringComparer.OrdinalIgnoreCase
        )
        {
            "foundation",
            "building",
            "equipment_pad",
            "trench",
            "fence",
            "road",
        };

        private static readonly object ConduitRouteBindingLock = new();

        private static readonly Dictionary<string, Dictionary<string, List<string>>>
            ConduitRouteBindings = new(StringComparer.OrdinalIgnoreCase);

        static SuiteCadAuthoringCommands()
        {
            ValidateConduitArcAngleNormalization();
        }

        private static JsonObject BuildConduitRouteFailure(
            string action,
            string code,
            string message,
            string requestId,
            Action<JsonObject>? configureMeta = null
        )
        {
            return BuildConduitRouteResult(
                action: action,
                success: false,
                code: code,
                message: message,
                data: new JsonObject(),
                warnings: Array.Empty<string>(),
                requestId: requestId,
                configureMeta: configureMeta
            );
        }

        private static JsonObject BuildConduitRouteResult(
            string action,
            bool success,
            string code,
            string message,
            JsonObject data,
            IEnumerable<string> warnings,
            string requestId,
            Action<JsonObject>? configureMeta = null
        )
        {
            var meta = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet+inproc",
                ["action"] = action,
            };

            if (!string.IsNullOrWhiteSpace(requestId))
            {
                meta["requestId"] = requestId;
            }

            configureMeta?.Invoke(meta);
            return new JsonObject
            {
                ["success"] = success,
                ["code"] = code,
                ["message"] = message,
                ["data"] = data,
                ["meta"] = meta,
                ["warnings"] = ToConduitJsonArray(warnings),
            };
        }

        private static string ReadConduitString(JsonObject payload, string key)
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is null)
            {
                return string.Empty;
            }

            return node switch
            {
                JsonValue value when value.TryGetValue<string>(out var text) => NormalizeText(text),
                _ => NormalizeText(node.ToJsonString()),
            };
        }

        private static bool ReadConduitBool(JsonObject payload, string key, bool fallback)
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is null)
            {
                return fallback;
            }

            if (node is JsonValue value)
            {
                if (value.TryGetValue<bool>(out var boolValue))
                {
                    return boolValue;
                }

                if (
                    value.TryGetValue<string>(out var text)
                    && bool.TryParse(text, out var parsedBool)
                )
                {
                    return parsedBool;
                }
            }

            return fallback;
        }

        private static int ReadConduitInt(JsonObject payload, string key, int fallback)
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is null)
            {
                return fallback;
            }

            if (node is JsonValue value)
            {
                if (value.TryGetValue<int>(out var intValue))
                {
                    return intValue;
                }

                if (value.TryGetValue<long>(out var longValue))
                {
                    return (int)longValue;
                }

                if (
                    value.TryGetValue<string>(out var text)
                    && int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                )
                {
                    return parsed;
                }
            }

            return fallback;
        }

        private static double ReadConduitDouble(JsonObject payload, string key, double fallback)
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is null)
            {
                return fallback;
            }

            if (node is JsonValue value)
            {
                if (value.TryGetValue<double>(out var doubleValue))
                {
                    return doubleValue;
                }

                if (value.TryGetValue<float>(out var floatValue))
                {
                    return floatValue;
                }

                if (value.TryGetValue<int>(out var intValue))
                {
                    return intValue;
                }

                if (
                    value.TryGetValue<string>(out var text)
                    && double.TryParse(
                        text,
                        NumberStyles.Float | NumberStyles.AllowThousands,
                        CultureInfo.InvariantCulture,
                        out var parsed
                    )
                )
                {
                    return parsed;
                }
            }

            return fallback;
        }

        private static List<string> ReadConduitStringArray(JsonObject payload, string key)
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
                    var trimmed = text.Trim();
                    if (!string.IsNullOrWhiteSpace(trimmed))
                    {
                        values.Add(trimmed);
                    }
                }
            }

            return values;
        }

        private static Dictionary<string, string> ReadConduitStringMap(JsonObject payload, string key)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (payload[key] is not JsonObject objectNode)
            {
                return map;
            }

            foreach (var entry in objectNode)
            {
                if (string.IsNullOrWhiteSpace(entry.Key) || entry.Value is not JsonValue valueNode)
                {
                    continue;
                }

                if (!valueNode.TryGetValue<string>(out var value) || string.IsNullOrWhiteSpace(value))
                {
                    continue;
                }

                map[entry.Key] = value.Trim().ToLowerInvariant();
            }

            return map;
        }

        private static JsonArray ToConduitJsonArray(IEnumerable<string> values)
        {
            var array = new JsonArray();
            foreach (var value in values.Where(value => !string.IsNullOrWhiteSpace(value)))
            {
                array.Add(value);
            }

            return array;
        }

        private static ConduitTerminalProfile ReadConduitTerminalProfile(JsonObject payload)
        {
            JsonObject? profileNode = null;
            if (
                payload.TryGetPropertyValue("terminalProfile", out var terminalProfileNode)
                && terminalProfileNode is JsonObject terminalProfile
            )
            {
                profileNode = terminalProfile;
            }
            else if (
                payload.TryGetPropertyValue("terminal_profile", out var terminalProfileSnakeNode)
                && terminalProfileSnakeNode is JsonObject terminalProfileSnake
            )
            {
                profileNode = terminalProfileSnake;
            }

            return new ConduitTerminalProfile(
                panelIdKeys: ReadConduitProfileArray(
                    profileNode,
                    "panelIdKeys",
                    ConduitDefaultPanelIdKeys
                ),
                panelNameKeys: ReadConduitProfileArray(
                    profileNode,
                    "panelNameKeys",
                    ConduitDefaultPanelNameKeys
                ),
                sideKeys: ReadConduitProfileArray(profileNode, "sideKeys", ConduitDefaultSideKeys),
                stripIdKeys: ReadConduitProfileArray(profileNode, "stripIdKeys", StripIdKeys),
                stripNumberKeys: ReadConduitProfileArray(
                    profileNode,
                    "stripNumberKeys",
                    ConduitDefaultStripNumberKeys
                ),
                terminalCountKeys: ReadConduitProfileArray(
                    profileNode,
                    "terminalCountKeys",
                    TerminalPreviewTerminalCountKeys
                ),
                terminalTagKeys: ReadConduitProfileArray(
                    profileNode,
                    "terminalTagKeys",
                    StripIdKeys.Concat(TerminalPreviewTerminalCountKeys)
                ),
                terminalNameTokens: ReadConduitProfileArray(
                    profileNode,
                    "terminalNameTokens",
                    TerminalPreviewNameTokens
                ),
                blockNameAllowList: ReadConduitProfileArray(
                    profileNode,
                    "blockNameAllowList",
                    Array.Empty<string>()
                ),
                requireStripId: profileNode is not null
                    && ReadConduitBool(profileNode, "requireStripId", fallback: false),
                requireTerminalCount: profileNode is not null
                    && ReadConduitBool(profileNode, "requireTerminalCount", fallback: false),
                requireSide: profileNode is not null
                    && ReadConduitBool(profileNode, "requireSide", fallback: false),
                defaultPanelPrefix: ReadConduitProfileString(
                    profileNode,
                    "defaultPanelPrefix",
                    "default_panel_prefix",
                    "PANEL"
                ),
                defaultTerminalCount: ReadConduitProfileInt(
                    profileNode,
                    "defaultTerminalCount",
                    "default_terminal_count",
                    12
                )
            );
        }

        private static JsonObject ConduitTerminalProfileToJson(ConduitTerminalProfile profile)
        {
            return new JsonObject
            {
                ["defaultPanelPrefix"] = profile.DefaultPanelPrefix,
                ["defaultTerminalCount"] = profile.DefaultTerminalCount,
                ["panelIdKeys"] = ToConduitJsonArray(profile.PanelIdKeys),
                ["panelNameKeys"] = ToConduitJsonArray(profile.PanelNameKeys),
                ["sideKeys"] = ToConduitJsonArray(profile.SideKeys),
                ["stripIdKeys"] = ToConduitJsonArray(profile.StripIdKeys),
                ["stripNumberKeys"] = ToConduitJsonArray(profile.StripNumberKeys),
                ["terminalCountKeys"] = ToConduitJsonArray(profile.TerminalCountKeys),
                ["terminalTagKeys"] = ToConduitJsonArray(profile.TerminalTagKeys),
                ["terminalNameTokens"] = ToConduitJsonArray(profile.TerminalNameTokens),
                ["blockNameAllowList"] = ToConduitJsonArray(profile.BlockNameAllowList),
                ["requireStripId"] = profile.RequireStripId,
                ["requireTerminalCount"] = profile.RequireTerminalCount,
                ["requireSide"] = profile.RequireSide,
            };
        }

        private static string[] ReadConduitProfileArray(
            JsonObject? profileNode,
            string key,
            IEnumerable<string> fallback
        )
        {
            if (profileNode is null)
            {
                return fallback
                    .Select(item => item.Trim().ToUpperInvariant())
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
            }

            var values = ReadConduitStringArray(profileNode, key)
                .Select(item => item.Trim().ToUpperInvariant())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return values.Length > 0
                ? values
                : fallback
                    .Select(item => item.Trim().ToUpperInvariant())
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
        }

        private static string ReadConduitProfileString(
            JsonObject? profileNode,
            string key,
            string fallbackKey,
            string fallback
        )
        {
            if (profileNode is null)
            {
                return fallback;
            }

            var direct = ReadConduitString(profileNode, key);
            if (!string.IsNullOrWhiteSpace(direct))
            {
                return direct;
            }

            var snake = ReadConduitString(profileNode, fallbackKey);
            return !string.IsNullOrWhiteSpace(snake) ? snake : fallback;
        }

        private static int ReadConduitProfileInt(
            JsonObject? profileNode,
            string key,
            string fallbackKey,
            int fallback
        )
        {
            if (profileNode is null)
            {
                return fallback;
            }

            var direct = ReadConduitInt(profileNode, key, int.MinValue);
            if (direct != int.MinValue)
            {
                return direct;
            }

            var snake = ReadConduitInt(profileNode, fallbackKey, int.MinValue);
            return snake != int.MinValue ? snake : fallback;
        }

        private static BlockTableRecord GetConduitModelSpace(Transaction transaction, Database database)
        {
            var blockTable = (BlockTable)transaction.GetObject(database.BlockTableId, OpenMode.ForRead);
            return (BlockTableRecord)
                transaction.GetObject(blockTable[BlockTableRecord.ModelSpace], OpenMode.ForRead);
        }

        private static string ResolveConduitDrawingName(Document document)
        {
            var documentPath = GetDocumentPath(document);
            var fileName = NormalizeText(System.IO.Path.GetFileName(documentPath));
            return string.IsNullOrWhiteSpace(fileName) ? NormalizeText(document.Name) : fileName;
        }

        private static string ResolveConduitUnits(Database database)
        {
            try
            {
                return database.Insunits switch
                {
                    UnitsValue.Inches => "Inches",
                    UnitsValue.Feet => "Feet",
                    UnitsValue.Miles => "Miles",
                    UnitsValue.Millimeters => "Millimeters",
                    UnitsValue.Centimeters => "Centimeters",
                    UnitsValue.Meters => "Meters",
                    UnitsValue.Kilometers => "Kilometers",
                    _ => "Unitless",
                };
            }
            catch
            {
                return "Unknown";
            }
        }

        private static Dictionary<string, string> ReadConduitAttributeMap(
            BlockReference blockReference,
            Transaction transaction
        )
        {
            var attrs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (ObjectId attributeId in blockReference.AttributeCollection)
            {
                if (
                    transaction.GetObject(attributeId, OpenMode.ForRead, false)
                    is not AttributeReference attribute
                )
                {
                    continue;
                }

                var tag = NormalizeText(attribute.Tag).ToUpperInvariant();
                var value = NormalizeText(attribute.TextString);
                if (!string.IsNullOrWhiteSpace(tag))
                {
                    attrs[tag] = value;
                }
            }

            return attrs;
        }

        private static string ReadConduitBlockName(
            BlockReference blockReference,
            Transaction transaction
        )
        {
            var blockName = NormalizeText(blockReference.Name);
            try
            {
                if (!blockReference.DynamicBlockTableRecord.IsNull)
                {
                    if (
                        transaction.GetObject(
                            blockReference.DynamicBlockTableRecord,
                            OpenMode.ForRead,
                            false
                        ) is BlockTableRecord dynamicBlock
                    )
                    {
                        var dynamicName = NormalizeText(dynamicBlock.Name);
                        if (!string.IsNullOrWhiteSpace(dynamicName))
                        {
                            blockName = dynamicName;
                        }
                    }
                }
            }
            catch
            {
                // Best effort block-name resolution only.
            }

            return blockName;
        }

        private static bool TryGetConduitEntityBounds(Entity entity, out Extents3d extents)
        {
            try
            {
                extents = entity.GeometricExtents;
                return true;
            }
            catch
            {
                extents = default;
                return false;
            }
        }

        private static string ResolveConduitEntityHandle(Entity entity)
        {
            try
            {
                return NormalizeText(entity.Handle.ToString()).ToUpperInvariant();
            }
            catch
            {
                return string.Empty;
            }
        }

        private static void EnsureConduitLayer(
            Database database,
            Transaction transaction,
            string layerName,
            int? colorAci
        )
        {
            EnsureLayer(database, transaction, layerName);
            if (!colorAci.HasValue || colorAci.Value < 1 || colorAci.Value > 255)
            {
                return;
            }

            var layerTable = (LayerTable)transaction.GetObject(database.LayerTableId, OpenMode.ForRead);
            if (!layerTable.Has(layerName))
            {
                return;
            }

            if (
                transaction.GetObject(layerTable[layerName], OpenMode.ForWrite, false)
                is LayerTableRecord record
            )
            {
                record.Color = Autodesk.AutoCAD.Colors.Color.FromColorIndex(
                    Autodesk.AutoCAD.Colors.ColorMethod.ByAci,
                    (short)colorAci.Value
                );
            }
        }

        private static void SetConduitEntityLayerAndColor(
            Entity entity,
            string layerName,
            int? colorAci
        )
        {
            entity.Layer = layerName;
            entity.ColorIndex = colorAci.HasValue && colorAci.Value >= 1 && colorAci.Value <= 255
                ? (short)colorAci.Value
                : (short)256;
        }

        private static int? ReadConduitOptionalColorAci(JsonObject payload)
        {
            var colorCandidate = ReadConduitInt(payload, "colorAci", 0);
            return colorCandidate >= 1 && colorCandidate <= 255 ? colorCandidate : null;
        }

        private static int ClampConduitInt(int value, int minValue, int maxValue)
        {
            if (value < minValue)
            {
                return minValue;
            }

            if (value > maxValue)
            {
                return maxValue;
            }

            return value;
        }

        private static string FirstConduitAttr(
            IReadOnlyDictionary<string, string> attrs,
            IEnumerable<string> keys
        )
        {
            foreach (var key in keys)
            {
                if (attrs.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }

            return string.Empty;
        }

        private static bool LooksLikeConduitTerminalBlock(
            string blockName,
            Dictionary<string, string> attrs,
            ConduitTerminalProfile profile
        )
        {
            var normalizedName = (blockName ?? string.Empty).Trim().ToUpperInvariant();
            if (
                profile.BlockNameAllowList.Length > 0
                && !profile.BlockNameAllowList.Contains(
                    normalizedName,
                    StringComparer.OrdinalIgnoreCase
                )
            )
            {
                return false;
            }

            if (
                profile.RequireStripId
                && string.IsNullOrWhiteSpace(FirstConduitAttr(attrs, profile.StripIdKeys))
            )
            {
                return false;
            }

            if (
                profile.RequireTerminalCount
                && string.IsNullOrWhiteSpace(FirstConduitAttr(attrs, profile.TerminalCountKeys))
            )
            {
                return false;
            }

            if (
                profile.RequireSide
                && string.IsNullOrWhiteSpace(FirstConduitAttr(attrs, profile.SideKeys))
            )
            {
                return false;
            }

            if (
                profile.TerminalNameTokens.Any(
                    token => normalizedName.Contains(token, StringComparison.Ordinal)
                )
                || normalizedName.Contains("TB", StringComparison.Ordinal)
                || normalizedName.Contains("TS", StringComparison.Ordinal)
            )
            {
                return true;
            }

            return attrs.Keys.Any(
                    key => profile.TerminalTagKeys.Contains(key, StringComparer.OrdinalIgnoreCase)
                )
                || attrs.Keys.Any(
                    key => profile.StripIdKeys.Contains(key, StringComparer.OrdinalIgnoreCase)
                )
                || attrs.Keys.Any(
                    key =>
                        profile.TerminalCountKeys.Contains(key, StringComparer.OrdinalIgnoreCase)
                );
        }

        private static int ParseConduitTerminalCount(
            IReadOnlyDictionary<string, string> attrs,
            IEnumerable<string> terminalCountKeys,
            int defaultTerminalCount
        )
        {
            foreach (var key in terminalCountKeys)
            {
                if (!attrs.TryGetValue(key, out var raw))
                {
                    continue;
                }

                var value = ExtractConduitFirstInt(raw);
                if (value.HasValue && value.Value > 0)
                {
                    return Math.Min(value.Value, 2000);
                }
            }

            return ClampConduitInt(defaultTerminalCount, 1, 2000);
        }

        private static int ParseConduitStripNumber(
            string stripId,
            IReadOnlyDictionary<string, string> attrs,
            IEnumerable<string> stripNumberKeys
        )
        {
            foreach (var key in stripNumberKeys)
            {
                if (!attrs.TryGetValue(key, out var raw))
                {
                    continue;
                }

                var value = ExtractConduitFirstInt(raw);
                if (value.HasValue)
                {
                    return value.Value;
                }
            }

            var sideSuffix = Regex.Match(stripId, "[LRC](\\d+)$", RegexOptions.IgnoreCase);
            if (
                sideSuffix.Success
                && int.TryParse(
                    sideSuffix.Groups[1].Value,
                    NumberStyles.Integer,
                    CultureInfo.InvariantCulture,
                    out var sideSuffixValue
                )
            )
            {
                return sideSuffixValue;
            }

            var trailingDigits = Regex.Match(stripId, "(\\d+)$");
            if (
                trailingDigits.Success
                && int.TryParse(
                    trailingDigits.Groups[1].Value,
                    NumberStyles.Integer,
                    CultureInfo.InvariantCulture,
                    out var trailingValue
                )
            )
            {
                return trailingValue;
            }

            return ExtractConduitFirstInt(stripId) ?? 1;
        }

        private static List<string> ParseConduitTerminalLabels(
            IReadOnlyDictionary<string, string> attrs,
            int terminalCount
        )
        {
            var labelsByIndex = new Dictionary<int, string>();
            foreach (var entry in attrs)
            {
                var match = TerminalLabelTagRegex.Match(entry.Key ?? string.Empty);
                if (
                    !match.Success
                    || !int.TryParse(
                        match.Groups[1].Value,
                        NumberStyles.Integer,
                        CultureInfo.InvariantCulture,
                        out var index
                    )
                    || index <= 0
                )
                {
                    continue;
                }

                var label = (entry.Value ?? string.Empty).Trim();
                if (!string.IsNullOrWhiteSpace(label))
                {
                    labelsByIndex[index] = label;
                }
            }

            var count = ClampConduitInt(terminalCount, 1, 2000);
            var labels = new List<string>(count);
            for (var index = 1; index <= count; index++)
            {
                labels.Add(labelsByIndex.TryGetValue(index, out var label) ? label : string.Empty);
            }

            return labels;
        }

        private static List<string> NormalizeConduitTerminalLabelValues(
            IReadOnlyList<string>? rawLabels,
            int terminalCount
        )
        {
            var count = ClampConduitInt(terminalCount <= 0 ? 1 : terminalCount, 1, 2000);
            var labels = new List<string>(count);
            for (var index = 0; index < count; index++)
            {
                var value = string.Empty;
                if (rawLabels is not null && index < rawLabels.Count)
                {
                    value = (rawLabels[index] ?? string.Empty).Trim();
                }

                labels.Add(string.IsNullOrWhiteSpace(value) ? (index + 1).ToString(CultureInfo.InvariantCulture) : value);
            }

            return labels;
        }

        private static ConduitTerminalLabelWriteResult WriteConduitTerminalLabels(
            BlockReference blockReference,
            Transaction transaction,
            IReadOnlyList<string> desiredLabels
        )
        {
            var labelAttributes = new Dictionary<int, AttributeReference>();
            foreach (ObjectId attributeId in blockReference.AttributeCollection)
            {
                if (
                    transaction.GetObject(attributeId, OpenMode.ForWrite, false)
                    is not AttributeReference attribute
                )
                {
                    continue;
                }

                var match = TerminalLabelTagRegex.Match(NormalizeText(attribute.Tag));
                if (
                    !match.Success
                    || !int.TryParse(
                        match.Groups[1].Value,
                        NumberStyles.Integer,
                        CultureInfo.InvariantCulture,
                        out var index
                    )
                    || index <= 0
                )
                {
                    continue;
                }

                labelAttributes[index] = attribute;
            }

            var updated = 0;
            var unchanged = 0;
            var missing = 0;
            var failed = 0;
            for (var terminalIndex = 1; terminalIndex <= desiredLabels.Count; terminalIndex++)
            {
                if (!labelAttributes.TryGetValue(terminalIndex, out var attribute))
                {
                    missing += 1;
                    continue;
                }

                var nextValue = desiredLabels[terminalIndex - 1] ?? string.Empty;
                if (
                    string.Equals(
                        NormalizeText(attribute.TextString),
                        NormalizeText(nextValue),
                        StringComparison.Ordinal
                    )
                )
                {
                    unchanged += 1;
                    continue;
                }

                try
                {
                    attribute.UpgradeOpen();
                    attribute.TextString = nextValue;
                    updated += 1;
                }
                catch
                {
                    failed += 1;
                }
            }

            return new ConduitTerminalLabelWriteResult
            {
                Updated = updated,
                Unchanged = unchanged,
                Missing = missing,
                Failed = failed,
            };
        }

        private static bool LooksLikeConduitJumperBlock(
            string blockName,
            IReadOnlyDictionary<string, string> attrs
        )
        {
            var normalizedName = (blockName ?? string.Empty).Trim().ToUpperInvariant();
            if (
                ConduitJumperNameTokens.Any(
                    token => normalizedName.Contains(token, StringComparison.Ordinal)
                )
            )
            {
                return true;
            }

            var hasFromStrip = !string.IsNullOrWhiteSpace(
                FirstConduitAttr(attrs, ConduitJumperFromStripKeys)
            );
            var hasToStrip = !string.IsNullOrWhiteSpace(
                FirstConduitAttr(attrs, ConduitJumperToStripKeys)
            );
            var hasFromTerm = !string.IsNullOrWhiteSpace(
                FirstConduitAttr(attrs, ConduitJumperFromTermKeys)
            );
            var hasToTerm = !string.IsNullOrWhiteSpace(
                FirstConduitAttr(attrs, ConduitJumperToTermKeys)
            );
            return hasFromStrip && hasToStrip && hasFromTerm && hasToTerm;
        }

        private static int? ParseConduitTerminalIndex(string rawValue)
        {
            var parsed = ExtractConduitFirstInt(rawValue ?? string.Empty);
            if (!parsed.HasValue || parsed.Value <= 0)
            {
                return null;
            }

            return ClampConduitInt(parsed.Value, 1, 2000);
        }

        private static int? ExtractConduitFirstInt(string input)
        {
            var match = Regex.Match(input ?? string.Empty, "(\\d+)");
            if (!match.Success)
            {
                return null;
            }

            return int.TryParse(
                match.Groups[1].Value,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var value
            )
                ? value
                : null;
        }

        private static string NormalizeConduitLayerName(string rawValue, string fallback)
        {
            var candidate = (rawValue ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(candidate))
            {
                candidate = fallback;
            }

            candidate = candidate.Replace("\t", "_").Replace("\r", "_").Replace("\n", "_");
            return candidate.Length <= 80 ? candidate : candidate[..80];
        }

        private static string DeriveConduitPanelId(string stripId)
        {
            var match = Regex.Match(stripId ?? string.Empty, "^([A-Z]+[0-9]+)", RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value.ToUpperInvariant() : string.Empty;
        }

        private static string NormalizeConduitSide(string side)
        {
            var normalized = (side ?? string.Empty).Trim().ToUpperInvariant();
            if (normalized.StartsWith("L", StringComparison.Ordinal) || normalized == "A")
            {
                return "L";
            }

            if (normalized.StartsWith("R", StringComparison.Ordinal) || normalized == "B")
            {
                return "R";
            }

            return "C";
        }

        private static string ResolveConduitPanelColor(string panelId)
        {
            var palette = new[] { "#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#14b8a6" };
            if (string.IsNullOrWhiteSpace(panelId))
            {
                return palette[0];
            }

            var checksum = panelId.ToUpperInvariant().ToCharArray().Sum(character => character);
            return palette[checksum % palette.Length];
        }
    }
}
