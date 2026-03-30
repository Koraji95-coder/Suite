using System.Text.Json;
using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class RuntimeCatalogTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void LoadFromFile_UsesCatalogValuesWhenPresent()
    {
        var tempPath = Path.GetTempFileName();
        try
        {
            File.WriteAllText(
                tempPath,
                """
                {
                  "serviceOrder": ["frontend", "backend"],
                  "services": {
                    "frontend": { "shortLabel": "UI", "bootLabel": "Suite Frontend", "description": "Shell" },
                    "backend": { "shortLabel": "BE", "bootLabel": "Backend", "description": "API" }
                  },
                  "bootstrapStepOrder": ["frontend"],
                  "bootstrapSteps": {
                    "frontend": { "label": "Suite Frontend", "shortLabel": "UI" }
                  },
                  "workshopRouteShortcuts": {
                    "developer-portal": { "title": "Developer Portal", "path": "/app/developer", "description": "Portal" }
                  },
                  "supportActions": [
                    { "id": "copy-summary", "label": "Copy summary", "description": "Copy support summary." },
                    { "id": "apply-workstation-profile", "label": "Apply workstation profile", "description": "Re-stamp the workstation profile." }
                  ]
                }
                """);

            var catalog = RuntimeCatalog.LoadFromFile(tempPath, JsonOptions, out var rawJson);

            Assert.Contains("\"serviceOrder\"", rawJson);
            Assert.Equal(["frontend", "backend"], catalog.ServiceOrder);
            Assert.Equal("Suite Frontend", catalog.GetServiceLabel("frontend"));
            Assert.True(catalog.TryResolveRoutePath("developer-portal", out var routePath));
            Assert.Equal("/app/developer", routePath);
            Assert.Equal(2, catalog.SupportActions.Length);
            Assert.Contains(catalog.SupportActions, action => action.Id == "apply-workstation-profile");
        }
        finally
        {
            File.Delete(tempPath);
        }
    }

    [Fact]
    public void LoadFromFile_FallsBackWhenCatalogIsMissing()
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json");

        var catalog = RuntimeCatalog.LoadFromFile(tempPath, JsonOptions, out var rawJson);

        Assert.Contains("\"supabase\"", rawJson);
        Assert.Contains("supabase", catalog.ServiceOrder);
        Assert.True(catalog.TryResolveRoutePath("command-center", out var routePath));
        Assert.Equal("/app/command-center", routePath);
        Assert.True(catalog.SupportActions.Length >= 5);
        Assert.Contains(catalog.SupportActions, action => action.Id == "apply-workstation-profile");
    }
}
