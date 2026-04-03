using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Text.Json.Nodes;
using Xunit;

namespace SuiteCadAuthoring.Tests;

public sealed class SuiteCadConduitRoutePipeActionsTests
{
    [Fact]
    public void HandleAction_UnknownActionReturnsNull()
    {
        var result = SuiteCadConduitRoutePipeActions.HandleAction(
            "conduit_route_unknown_action",
            new JsonObject()
        );

        Assert.Null(result);
    }

    [Fact]
    public void BuildConduitRouteFailure_IncludesEnvelopeMetaAndRequestId()
    {
        var result = InvokePrivate<JsonObject>(
            "BuildConduitRouteFailure",
            "conduit_route_terminal_scan",
            "INVALID_REQUEST",
            "bad request",
            "conduit-req-1",
            null
        );

        Assert.False(result["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal("bad request", result["message"]?.GetValue<string>());
        Assert.Equal(
            "conduit_route_terminal_scan",
            result["meta"]?["action"]?.GetValue<string>()
        );
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
        Assert.Equal("conduit-req-1", result["meta"]?["requestId"]?.GetValue<string>());
    }

    [Fact]
    public void ReadConduitPathPoints_NormalizesDuplicatesAndRoundsCoordinates()
    {
        var result = (IList)
            InvokePrivate<object>(
                "ReadConduitPathPoints",
                new JsonArray
                {
                    new JsonObject { ["x"] = 10.12349, ["y"] = 20.12349 },
                    new JsonObject { ["x"] = 10.1235, ["y"] = 20.1235 },
                    new JsonObject { ["x"] = "bad", ["y"] = 40 },
                    new JsonObject { ["x"] = 30.9999, ["y"] = 40.0001 },
                }
            );

        Assert.Equal(3, result.Count);
        var firstPoint = result[0];
        var secondPoint = result[1];
        var thirdPoint = result[2];
        Assert.NotNull(firstPoint);
        Assert.NotNull(secondPoint);
        Assert.NotNull(thirdPoint);
        Assert.Equal(10.123, ReadPointCoordinate(firstPoint!, "X"));
        Assert.Equal(20.123, ReadPointCoordinate(firstPoint!, "Y"));
        Assert.Equal(10.124, ReadPointCoordinate(secondPoint!, "X"));
        Assert.Equal(20.124, ReadPointCoordinate(secondPoint!, "Y"));
        Assert.Equal(31.0, ReadPointCoordinate(thirdPoint!, "X"));
        Assert.Equal(40.0, ReadPointCoordinate(thirdPoint!, "Y"));
    }

    [Fact]
    public void ParseConduitCadRoutePrimitives_ParsesSupportedKindsAndWarnsOnUnsupportedKinds()
    {
        var warnings = new List<string>();
        var routeNode = new JsonObject
        {
            ["primitives"] = new JsonArray
            {
                new JsonObject
                {
                    ["kind"] = "line",
                    ["start"] = new JsonObject { ["x"] = 1, ["y"] = 2 },
                    ["end"] = new JsonObject { ["x"] = 5, ["y"] = 2 },
                },
                new JsonObject
                {
                    ["kind"] = "arc",
                    ["start"] = new JsonObject { ["x"] = 5, ["y"] = 2 },
                    ["end"] = new JsonObject { ["x"] = 5, ["y"] = 6 },
                    ["center"] = new JsonObject { ["x"] = 3, ["y"] = 4 },
                    ["radius"] = 2.828427,
                    ["turn"] = -1,
                },
                new JsonObject
                {
                    ["kind"] = "bezier",
                },
            },
        };

        var result = (IList)
            InvokePrivate<object>(
                "ParseConduitCadRoutePrimitives",
                routeNode,
                warnings
            );

        Assert.Equal(2, result.Count);
        var firstPrimitive = result[0];
        var secondPrimitive = result[1];
        Assert.NotNull(firstPrimitive);
        Assert.NotNull(secondPrimitive);
        Assert.Equal("line", ReadPrimitiveString(firstPrimitive!, "Kind"));
        Assert.Equal("arc", ReadPrimitiveString(secondPrimitive!, "Kind"));
        Assert.Equal(-1.0, ReadPrimitiveDouble(secondPrimitive!, "Turn"));
        Assert.Single(warnings);
        Assert.Contains("unsupported primitive kind", warnings[0]);
    }

    [Fact]
    public void BuildConduitTargetStripLabelMap_NormalizesStripEntries()
    {
        var result = (IDictionary)
            InvokePrivate<object>(
                "BuildConduitTargetStripLabelMap",
                new JsonObject
                {
                    ["strips"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["strip_id"] = "rp1l1",
                            ["terminal_count"] = 3,
                            ["labels"] = new JsonArray("1", "", "3"),
                        },
                    },
                },
                12
            );

        Assert.True(result.Contains("RP1L1"));
        var labels = Assert.IsAssignableFrom<IList>(result["RP1L1"]);
        Assert.Equal(3, labels.Count);
        Assert.Equal("1", labels[0]?.ToString());
        Assert.Equal("2", labels[1]?.ToString());
        Assert.Equal("3", labels[2]?.ToString());
    }

    private static T InvokePrivate<T>(string methodName, params object?[] args)
    {
        var method = typeof(SuiteCadAuthoringCommands).GetMethod(
            methodName,
            BindingFlags.NonPublic | BindingFlags.Static
        );

        Assert.NotNull(method);
        return (T)method!.Invoke(null, args)!;
    }

    private static double ReadPointCoordinate(object point, string propertyName)
    {
        var property = point.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(property);
        return (double)(property!.GetValue(point) ?? 0.0);
    }

    private static string ReadPrimitiveString(object primitive, string propertyName)
    {
        var property = primitive.GetType().GetProperty(propertyName, BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(property);
        return property!.GetValue(primitive)?.ToString() ?? string.Empty;
    }

    private static double ReadPrimitiveDouble(object primitive, string propertyName)
    {
        var property = primitive.GetType().GetProperty(propertyName, BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(property);
        return (double)(property!.GetValue(primitive) ?? 0.0);
    }
}
