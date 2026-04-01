using Xunit;
using System.IO;

namespace SuiteCadAuthoring.Tests;

public sealed class SuiteCadAcadeProjectCommandsTests
{
    [Fact]
    public void BuildAcadeProjectIdentity_PrefersWdpOverMdb()
    {
        var identity = SuiteCadAuthoringCommands.BuildAcadeProjectIdentity(
            new[]
            {
                @"C:\Projects\Demo\DemoProject.mdb",
                @"C:\Projects\Demo\DemoProject.wdp",
            },
            string.Empty
        );

        Assert.Equal(@"C:\Projects\Demo\DemoProject.wdp", identity.ProjectFilePath);
        Assert.Equal(@"C:\Projects\Demo\DemoProject.mdb", identity.DatabasePath);
        Assert.Equal(@"C:\Projects\Demo\DemoProject.wdp", identity.PreferredPath);
        Assert.Equal("DemoProject", identity.DisplayName);
    }

    [Fact]
    public void LooksLikeSameAcadeProjectPath_TreatsMatchingWdpAndMdbAsSameProject()
    {
        Assert.True(
            SuiteCadAuthoringCommands.LooksLikeSameAcadeProjectPath(
                @"C:\Projects\Demo\DemoProject.mdb",
                @"C:\Projects\Demo\DemoProject.wdp"
            )
        );
    }

    [Fact]
    public void LooksLikeSameAcadeProjectPath_RejectsDifferentProjectNames()
    {
        Assert.False(
            SuiteCadAuthoringCommands.LooksLikeSameAcadeProjectPath(
                @"C:\Projects\Demo\DemoProject.mdb",
                @"C:\Projects\Demo\OtherProject.wdp"
            )
        );
    }

    [Fact]
    public void BuildAcadeProjectIdentity_DerivesWdpFromKnownProjectRoots()
    {
        var root = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName());
        var projectRoot = Path.Combine(root, "Proj", "EXTRA LIBRARY DEMO");
        Directory.CreateDirectory(projectRoot);
        var expectedWdpPath = Path.Combine(projectRoot, "extra library demo.wdp");
        File.WriteAllText(expectedWdpPath, string.Empty);

        try
        {
            var resolvedWdpPath = SuiteCadAuthoringCommands.TryResolveDerivedAcadeProjectFilePath(
                new[]
                {
                    @"C:\Users\koraj\AppData\Roaming\Autodesk\AutoCAD Electrical 2026\R25.1\enu\Support\user\EXTRA LIBRARY DEMO.mdb",
                },
                "EXTRA LIBRARY DEMO",
                new[] { Path.Combine(root, "Proj") }
            );

            Assert.Equal(expectedWdpPath, resolvedWdpPath, ignoreCase: true);

            var identity = SuiteCadAuthoringCommands.BuildAcadeProjectIdentity(
                new[]
                {
                    @"C:\Users\koraj\AppData\Roaming\Autodesk\AutoCAD Electrical 2026\R25.1\enu\Support\user\EXTRA LIBRARY DEMO.mdb",
                },
                "EXTRA LIBRARY DEMO"
            );

            Assert.Equal("EXTRA LIBRARY DEMO", identity.DisplayName);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void EvaluateAcadeProjectSwitchEligibilityCore_BlocksActiveCommands()
    {
        var eligibility = SuiteCadAuthoringCommands.EvaluateAcadeProjectSwitchEligibilityCore(
            "LINE",
            0,
            trackerIsCreating: false,
            temporaryDocumentPending: false
        );

        Assert.False(eligibility.Eligible);
        Assert.Contains("commands are active", eligibility.BlockedReason);
    }

    [Fact]
    public void EvaluateAcadeProjectSwitchEligibilityCore_BlocksDirtyDrawing()
    {
        var eligibility = SuiteCadAuthoringCommands.EvaluateAcadeProjectSwitchEligibilityCore(
            string.Empty,
            8,
            trackerIsCreating: false,
            temporaryDocumentPending: false
        );

        Assert.False(eligibility.Eligible);
        Assert.Contains("DBMOD=8", eligibility.BlockedReason);
    }

    [Fact]
    public void EvaluateAcadeProjectSwitchEligibilityCore_AllowsCleanIdleSession()
    {
        var eligibility = SuiteCadAuthoringCommands.EvaluateAcadeProjectSwitchEligibilityCore(
            string.Empty,
            0,
            trackerIsCreating: false,
            temporaryDocumentPending: false
        );

        Assert.True(eligibility.Eligible);
        Assert.Equal(string.Empty, eligibility.BlockedReason);
    }
}
