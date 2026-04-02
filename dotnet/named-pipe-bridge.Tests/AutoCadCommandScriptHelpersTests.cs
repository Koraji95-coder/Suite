using Xunit;

public class AutoCadCommandScriptHelpersTests
{
    [Fact]
    public void BuildAutoCadLispInvocationScript_appends_trailing_newline()
    {
        var script = ConduitRouteStubHandlers.BuildAutoCadLispInvocationScript(
            "(SUITEACADEPROJECTOPENRUN \"C:/Temp/payload.json\" \"C:/Temp/result.json\")"
        );

        Assert.Equal(
            "(SUITEACADEPROJECTOPENRUN \"C:/Temp/payload.json\" \"C:/Temp/result.json\")\n",
            script
        );
    }

    [Fact]
    public void BuildSuitePluginLispInvocationScript_netloads_then_invokes_lisp_entrypoint()
    {
        var script = ConduitRouteStubHandlers.BuildSuitePluginLispInvocationScript(
            @"C:\Suite\SuiteCadAuthoring.dll",
            "SUITEACADEPROJECTOPENRUN",
            @"C:/Temp/payload.json",
            @"C:/Temp/result.json"
        );

        var expected =
            "_.NETLOAD \"C:\\Suite\\SuiteCadAuthoring.dll\"\n"
            + "(SUITEACADEPROJECTOPENRUN \"C:/Temp/payload.json\" \"C:/Temp/result.json\")\n";

        Assert.Equal(expected, script);
    }

    [Fact]
    public void BuildSuitePluginCommandScript_uses_inline_command_arguments()
    {
        var script = ConduitRouteStubHandlers.BuildSuitePluginCommandScript(
            @"C:\Suite\SuiteCadAuthoring.dll",
            "SUITEACADEPROJECTOPEN",
            @"C:\Temp\payload.json",
            @"C:\Temp\result.json"
        );

        var expected =
            "_.NETLOAD \"C:\\Suite\\SuiteCadAuthoring.dll\"\n"
            + "_.SUITEACADEPROJECTOPEN \"C:\\Temp\\payload.json\" \"C:\\Temp\\result.json\"\n";

        Assert.Equal(expected, script);
    }

    [Fact]
    public void BuildSuitePluginCommandScript_escapes_embedded_quotes()
    {
        var script = ConduitRouteStubHandlers.BuildSuitePluginCommandScript(
            "C:\\Suite\\plug\"in.dll",
            "SUITECOMMAND",
            "C:\\Temp\\pay\"load.json"
        );

        Assert.Contains("_.NETLOAD \"C:\\Suite\\plug\"\"in.dll\"\n", script);
        Assert.Contains("_.SUITECOMMAND \"C:\\Temp\\pay\"\"load.json\"\n", script);
    }

    [Fact]
    public void BuildAutoCadCommandScript_quotes_all_inline_inputs()
    {
        var script = ConduitRouteStubHandlers.BuildAutoCadCommandScript(
            "_.SUITEACADEPROJECTOPEN",
            @"C:\Temp\payload one.json",
            @"C:\Temp\result.json"
        );

        Assert.Equal(
            "_.SUITEACADEPROJECTOPEN \"C:\\Temp\\payload one.json\" \"C:\\Temp\\result.json\"\n",
            script
        );
    }
}
