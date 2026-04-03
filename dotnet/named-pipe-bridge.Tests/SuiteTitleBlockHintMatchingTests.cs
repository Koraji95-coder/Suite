using System.Reflection;
using Xunit;

public sealed class SuiteTitleBlockHintMatchingTests
{
    private static Type ResolveHandlerType()
    {
        return typeof(PipeRouter).Assembly.GetType("ConduitRouteStubHandlers")
            ?? throw new InvalidOperationException("ConduitRouteStubHandlers type was not found.");
    }

    private static bool InvokeMatches(string blockName, string blockNameHint)
    {
        var method = ResolveHandlerType().GetMethod(
            "MatchesAutoDraftTitleBlockNameHint",
            BindingFlags.Static | BindingFlags.NonPublic
        );
        Assert.NotNull(method);
        return (bool)(method!.Invoke(null, [blockName, blockNameHint]) ?? false);
    }

    private static int InvokeScore(string blockName, string blockNameHint)
    {
        var method = ResolveHandlerType().GetMethod(
            "GetAutoDraftTitleBlockHintScore",
            BindingFlags.Static | BindingFlags.NonPublic
        );
        Assert.NotNull(method);
        return (int)(method!.Invoke(null, [blockName, blockNameHint]) ?? 0);
    }

    [Fact]
    public void Matches_multiple_block_name_hints_from_wdt_sections()
    {
        Assert.True(InvokeMatches("TB", "TB,TITLE-D"));
        Assert.True(InvokeMatches("TITLE-D", "TB,TITLE-D"));
        Assert.True(InvokeMatches("Title D", "TB,TITLE-D"));
        Assert.False(InvokeMatches("LEGEND", "TB,TITLE-D"));
    }

    [Fact]
    public void Scores_against_the_best_matching_hint()
    {
        Assert.Equal(50, InvokeScore("TB", "TB,TITLE-D"));
        Assert.Equal(50, InvokeScore("TITLE-D", "TB,TITLE-D"));
        Assert.Equal(20, InvokeScore("TITLE-D-WIDE", "TB,TITLE-D"));
        Assert.Equal(0, InvokeScore("LEGEND", "TB,TITLE-D"));
    }
}
