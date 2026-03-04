namespace AutoDraft.ApiContract.Options;

public sealed class AutoDraftOptions
{
    public string SourceLabel { get; set; } = "dotnet-contract";

    public bool EnableMockExecution { get; set; } = true;

    public string Version { get; set; } = "v1-contract";
}
