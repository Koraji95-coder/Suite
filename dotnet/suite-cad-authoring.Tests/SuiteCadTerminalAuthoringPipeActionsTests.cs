using System.Text.Json.Nodes;
using Xunit;

namespace SuiteCadAuthoring.Tests;

public sealed class SuiteCadTerminalAuthoringPipeActionsTests
{
    [Fact]
    public void HandleAction_RoutesTerminalApplyAndValidatesPayload()
    {
        var result = SuiteCadTerminalAuthoringPipeActions.HandleAction(
            "suite_terminal_authoring_project_apply",
            new JsonObject()
        );

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal(
            "suite_terminal_authoring_project_apply",
            result["meta"]?["action"]?.GetValue<string>()
        );
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
    }

    [Fact]
    public void HandleAction_RequiresScheduleSnapshotId()
    {
        var result = SuiteCadTerminalAuthoringPipeActions.HandleAction(
            "suite_terminal_authoring_project_apply",
            new JsonObject
            {
                ["requestId"] = "wire-req-1",
                ["projectId"] = "project-1",
                ["issueSetId"] = "issue-1",
                ["operations"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["operationType"] = "label-upsert",
                        ["drawingPath"] = @"C:\dwg\A-100.dwg",
                    },
                },
            }
        );

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal("scheduleSnapshotId is required.", result["message"]?.GetValue<string>());
        Assert.Equal("wire-req-1", result["meta"]?["requestId"]?.GetValue<string>());
    }

    [Fact]
    public void HandleAction_RejectsUnresolvedOperations()
    {
        var result = SuiteCadTerminalAuthoringPipeActions.HandleAction(
            "suite_terminal_authoring_project_apply",
            new JsonObject
            {
                ["requestId"] = "wire-req-2",
                ["projectId"] = "project-1",
                ["issueSetId"] = "issue-1",
                ["scheduleSnapshotId"] = "schedule-1",
                ["operations"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["operationType"] = "unresolved",
                        ["drawingPath"] = @"C:\dwg\A-100.dwg",
                    },
                },
            }
        );

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal(
            "operations cannot include unresolved preview rows.",
            result["message"]?.GetValue<string>()
        );
        Assert.Equal("wire-req-2", result["meta"]?["requestId"]?.GetValue<string>());
    }
}
