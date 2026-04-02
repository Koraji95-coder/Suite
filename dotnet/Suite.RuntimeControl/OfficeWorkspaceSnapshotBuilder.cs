using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Suite.RuntimeControl;

internal static class OfficeWorkspaceSnapshotBuilder
{
    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(4),
    };

    private static readonly string[] KnowledgeExtensions =
    [
        ".md",
        ".txt",
        ".pdf",
        ".docx",
        ".pptx",
        ".onepkg",
    ];

    public static async Task<OfficeWorkspaceSnapshot> BuildAsync(string suiteRepoRoot, CancellationToken cancellationToken = default)
    {
        var companionConfigPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Suite",
            "runtime-bootstrap",
            "companion-config",
            "office.json");

        var companionConfig = ReadJsonObject(companionConfigPath);
        var brokerConfiguration = OfficeBrokerConfigResolver.Resolve(suiteRepoRoot);
        var officeRoot = ResolveOfficeRoot(companionConfig, suiteRepoRoot);
        var publishedExecutablePath = TryGetString(companionConfig, "executablePath");
        var settingsPaths = ResolveSettingsPaths(publishedExecutablePath, officeRoot);
        var settingsPath = settingsPaths.FirstOrDefault(File.Exists) ?? settingsPaths.FirstOrDefault();
        var settings = ReadMergedJsonObject(settingsPaths);
        var knowledgeLibraryPath = ResolveKnowledgeLibraryPath(settings, companionConfig);
        var stateRootPath = ResolveStateRootPath(settings, companionConfig);
        var trainingHistoryPath = Path.Combine(stateRootPath, "training-history.json");
        var operatorMemoryPath = Path.Combine(stateRootPath, "operator-memory.json");
        var primaryProviderId = GetTrimmedString(settings, "primaryModelProvider") ?? "ollama";
        var officeTitle = GetTrimmedString(settings, "officeName") ?? "Office";
        var providerEndpoint = GetTrimmedString(settings, "ollamaEndpoint") ?? "http://127.0.0.1:11434";
        var huggingFaceTokenEnvVar = GetTrimmedString(settings, "huggingFaceTokenEnvVar") ?? "HF_TOKEN";
        var installedModels = await TryGetInstalledModelsAsync(providerEndpoint, cancellationToken);

        var roleModels = BuildRoleModels(settings, installedModels);
        var knowledge = BuildKnowledgeSummary(settings, knowledgeLibraryPath);
        var training = BuildTrainingSummary(trainingHistoryPath);
        var operatorState = BuildOperatorSummary(operatorMemoryPath);
        var growth = BuildGrowthSummary(settings);
        var today = BuildTodaySummary(training, operatorState);
        var inboxItems = BuildInboxItems(training, operatorState, roleModels, knowledge);

        return new OfficeWorkspaceSnapshot
        {
            SchemaVersion = "suite.operator-shell.office.v1",
            GeneratedAt = DateTimeOffset.Now,
            Available = !string.IsNullOrWhiteSpace(officeRoot) || !string.IsNullOrWhiteSpace(publishedExecutablePath),
            WorkspaceId = "office",
            Title = officeTitle,
            SuiteRepoPath = GetTrimmedString(settings, "suiteRepoPath") ?? suiteRepoRoot,
            Companion = new OfficeCompanionSnapshot
            {
                ConfigPath = companionConfigPath,
                ConfigExists = File.Exists(companionConfigPath),
                ExecutablePath = publishedExecutablePath,
                ExecutableExists = !string.IsNullOrWhiteSpace(publishedExecutablePath) && File.Exists(publishedExecutablePath),
                WorkingDirectory = TryGetString(companionConfig, "workingDirectory"),
                OfficeRoot = officeRoot,
                SettingsPath = settingsPath,
                SettingsExists = !string.IsNullOrWhiteSpace(settingsPath) && File.Exists(settingsPath),
                BrokerBaseUrl = brokerConfiguration.BaseUrl,
                BrokerPublishPath = brokerConfiguration.PublishPath,
                BrokerConfigEnabled = brokerConfiguration.Enabled,
            },
            Broker = new OfficeBrokerSummary
            {
                Enabled = brokerConfiguration.Enabled,
                ConfigExists = brokerConfiguration.ConfigExists,
                BaseUrl = brokerConfiguration.BaseUrl,
                HealthPath = brokerConfiguration.HealthPath,
                StatePath = brokerConfiguration.StatePath,
                PublishPath = brokerConfiguration.PublishPath,
                Healthy = false,
                Reachable = false,
                StateAvailable = false,
                LastError = "Office broker state has not been queried yet.",
                LastCheckedAt = DateTimeOffset.Now,
            },
            Provider = new OfficeProviderSummary
            {
                PrimaryProviderId = primaryProviderId,
                PrimaryProviderLabel = ResolveProviderLabel(primaryProviderId),
                Endpoint = providerEndpoint,
                Ready = installedModels.Count > 0,
                InstalledModelCount = installedModels.Count,
                InstalledModels = installedModels,
                HuggingFaceCatalogEnabled = GetBoolean(settings, "enableHuggingFaceCatalog", defaultValue: false),
                HuggingFaceTokenEnvVar = huggingFaceTokenEnvVar,
                HuggingFaceTokenPresent = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(huggingFaceTokenEnvVar)),
                HuggingFaceMcpUrl = GetTrimmedString(settings, "huggingFaceMcpUrl") ?? "https://huggingface.co/mcp",
                RoleModels = roleModels,
            },
            Knowledge = knowledge,
            Training = training,
            Operator = operatorState,
            Growth = growth,
            Today = today,
            InboxItems = inboxItems,
            Actions = BuildActions(knowledge, training, operatorState, settingsPath),
        };
    }

    private static OfficeKnowledgeSummary BuildKnowledgeSummary(JsonElement? settings, string knowledgeLibraryPath)
    {
        var additionalRoots = GetStringArray(settings, "additionalKnowledgePaths")
            .Select(path => BuildKnowledgeRoot(path, isPrimary: false))
            .ToList();
        var primaryRoot = BuildKnowledgeRoot(knowledgeLibraryPath, isPrimary: true);

        return new OfficeKnowledgeSummary
        {
            LibraryPath = knowledgeLibraryPath,
            LibraryExists = primaryRoot.Exists,
            PrimaryRoot = primaryRoot,
            AdditionalRoots = additionalRoots,
            TotalDocumentCount = primaryRoot.DocumentCount + additionalRoots.Sum(item => item.DocumentCount),
            RecentDocuments = primaryRoot.RecentDocuments
                .Concat(additionalRoots.SelectMany(item => item.RecentDocuments))
                .OrderByDescending(item => item.LastWriteTime)
                .Take(8)
                .ToList(),
        };
    }

    private static OfficeTrainingSummary BuildTrainingSummary(string trainingHistoryPath)
    {
        var document = ReadJsonObject(trainingHistoryPath);
        var practiceAttempts = CountArray(document, "practiceAttempts");
        if (practiceAttempts == 0)
        {
            practiceAttempts = CountArray(document, "attempts");
        }

        return new OfficeTrainingSummary
        {
            HistoryPath = trainingHistoryPath,
            HistoryExists = File.Exists(trainingHistoryPath),
            LastWriteAt = File.Exists(trainingHistoryPath) ? File.GetLastWriteTime(trainingHistoryPath) : null,
            PracticeAttemptCount = practiceAttempts,
            DefenseAttemptCount = CountArray(document, "defenseAttempts"),
            ReflectionCount = CountArray(document, "reflections"),
            LatestReflection = TryDescribeLatestReflection(document),
        };
    }

    private static OfficeOperatorSummary BuildOperatorSummary(string operatorMemoryPath)
    {
        var document = ReadJsonObject(operatorMemoryPath);
        var suggestions = ReadArray(document, "suggestions");
        var watchlists = ReadArray(document, "watchlists");
        var dailyRuns = ReadArray(document, "dailyRuns");
        var activities = ReadArray(document, "activities");
        var deskThreads = ReadArray(document, "deskThreads");
        var pendingApprovals = 0;
        var queuedSuggestions = 0;

        foreach (var suggestion in suggestions)
        {
            var requiresApproval = TryGetBoolean(suggestion, "requiresApproval");
            var status = TryGetNestedString(suggestion, "outcome", "status") ?? "pending";
            var executionStatus = TryGetString(suggestion, "executionStatus") ?? "not_queued";

            if (requiresApproval && status.Equals("pending", StringComparison.OrdinalIgnoreCase))
            {
                pendingApprovals += 1;
            }

            if (executionStatus is "queued" or "running" or "failed")
            {
                queuedSuggestions += 1;
            }
        }

        var dueWatchlists = 0;
        foreach (var watchlist in watchlists)
        {
            if (!TryGetBoolean(watchlist, "isEnabled", defaultValue: true))
            {
                continue;
            }

            var lastRunAt = TryGetDateTimeOffset(watchlist, "lastRunAt");
            var frequency = TryGetString(watchlist, "frequency") ?? "Weekly";
            var nextDueAt = (lastRunAt ?? DateTimeOffset.MinValue).Add(GetWatchlistInterval(frequency));
            if (nextDueAt <= DateTimeOffset.Now)
            {
                dueWatchlists += 1;
            }
        }

        return new OfficeOperatorSummary
        {
            MemoryPath = operatorMemoryPath,
            MemoryExists = File.Exists(operatorMemoryPath),
            LastWriteAt = File.Exists(operatorMemoryPath) ? File.GetLastWriteTime(operatorMemoryPath) : null,
            SuggestionCount = suggestions.Count,
            PendingApprovalCount = pendingApprovals,
            DueWatchlistCount = dueWatchlists,
            WatchlistCount = watchlists.Count,
            DailyRunCount = dailyRuns.Count,
            DeskThreadCount = deskThreads.Count,
            ActivityCount = activities.Count,
            QueuedSuggestionCount = queuedSuggestions,
            LatestDailyObjective = TryDescribeLatestDailyObjective(dailyRuns),
        };
    }

    private static OfficeGrowthSummary BuildGrowthSummary(JsonElement? settings)
    {
        return new OfficeGrowthSummary
        {
            SuiteFocus = GetTrimmedString(settings, "suiteFocus") ?? string.Empty,
            EngineeringFocus = GetTrimmedString(settings, "engineeringFocus") ?? string.Empty,
            CadFocus = GetTrimmedString(settings, "cadFocus") ?? string.Empty,
            BusinessFocus = GetTrimmedString(settings, "businessFocus") ?? string.Empty,
            CareerFocus = GetTrimmedString(settings, "careerFocus") ?? string.Empty,
            ProofTracks =
            [
                "Turn study work into proof-of-growth artifacts tied to real engineering judgment.",
                "Keep Suite handoffs read-only and evidence-backed until an automation path is explicitly approved.",
                "Treat ACADE references, standards work, and production reliability as portfolio-quality signals.",
            ],
        };
    }

    private static OfficeTodaySummary BuildTodaySummary(OfficeTrainingSummary training, OfficeOperatorSummary operatorState)
    {
        var highlights = new List<string>();
        if (!string.IsNullOrWhiteSpace(operatorState.LatestDailyObjective))
        {
            highlights.Add(operatorState.LatestDailyObjective);
        }

        if (training.ReflectionCount > 0 && !string.IsNullOrWhiteSpace(training.LatestReflection))
        {
            highlights.Add(training.LatestReflection);
        }

        if (operatorState.PendingApprovalCount > 0)
        {
            highlights.Add($"{operatorState.PendingApprovalCount} Office approvals still need review.");
        }

        if (operatorState.DueWatchlistCount > 0)
        {
            highlights.Add($"{operatorState.DueWatchlistCount} research watchlists are due.");
        }

        if (highlights.Count == 0)
        {
            highlights.Add("Generate the first operator plan in Office to seed Today.");
        }

        return new OfficeTodaySummary
        {
            Objective = string.IsNullOrWhiteSpace(operatorState.LatestDailyObjective)
                ? "Use Office as the private operator desk for study, planning, and proof-of-growth."
                : operatorState.LatestDailyObjective,
            Highlights = highlights,
        };
    }

    private static List<OfficeInboxItem> BuildInboxItems(
        OfficeTrainingSummary training,
        OfficeOperatorSummary operatorState,
        IReadOnlyList<OfficeRoleModelSummary> roleModels,
        OfficeKnowledgeSummary knowledge)
    {
        var items = new List<OfficeInboxItem>();

        if (operatorState.PendingApprovalCount > 0)
        {
            items.Add(new OfficeInboxItem
            {
                Id = "office-approvals",
                Tone = "warn",
                Title = "Office approvals are waiting.",
                Summary = $"{operatorState.PendingApprovalCount} suggestion approvals are pending review.",
                WorkspaceView = "inbox",
            });
        }

        if (operatorState.DueWatchlistCount > 0)
        {
            items.Add(new OfficeInboxItem
            {
                Id = "office-watchlists",
                Tone = "pending",
                Title = "Research watchlists are due.",
                Summary = $"{operatorState.DueWatchlistCount} watchlists are due for a fresh research pass.",
                WorkspaceView = "research",
            });
        }

        if (training.PracticeAttemptCount == 0)
        {
            items.Add(new OfficeInboxItem
            {
                Id = "office-training-empty",
                Tone = "info",
                Title = "Training history has not started yet.",
                Summary = "Generate and score a first practice session so Office can build review memory.",
                WorkspaceView = "study",
            });
        }

        if (knowledge.TotalDocumentCount == 0)
        {
            items.Add(new OfficeInboxItem
            {
                Id = "office-library-empty",
                Tone = "warn",
                Title = "Knowledge library is still empty.",
                Summary = "Drop study files into the knowledge roots so Office can ground its coaching in your material.",
                WorkspaceView = "library",
            });
        }

        foreach (var roleModel in roleModels.Where(static item => !item.Installed).Take(3))
        {
            items.Add(new OfficeInboxItem
            {
                Id = $"office-model-{roleModel.Role.ToLowerInvariant()}",
                Tone = "warn",
                Title = $"{roleModel.Role} model is missing locally.",
                Summary = $"{roleModel.ModelName} is configured for {roleModel.Role} but was not found in the active local provider.",
                WorkspaceView = "study",
            });
        }

        return items;
    }

    private static List<OfficePathAction> BuildActions(
        OfficeKnowledgeSummary knowledge,
        OfficeTrainingSummary training,
        OfficeOperatorSummary operatorState,
        string? settingsPath)
    {
        var actions = new List<OfficePathAction>();

        if (!string.IsNullOrWhiteSpace(knowledge.LibraryPath))
        {
            actions.Add(new OfficePathAction
            {
                Id = "open-knowledge-library",
                Label = "Open Knowledge Library",
                TargetPath = knowledge.LibraryPath,
            });
        }

        if (training.HistoryExists)
        {
            actions.Add(new OfficePathAction
            {
                Id = "open-training-history",
                Label = "Open Training History",
                TargetPath = training.HistoryPath,
            });
        }

        if (operatorState.MemoryExists)
        {
            actions.Add(new OfficePathAction
            {
                Id = "open-operator-memory",
                Label = "Open Operator Memory",
                TargetPath = operatorState.MemoryPath,
            });
        }

        if (!string.IsNullOrWhiteSpace(settingsPath))
        {
            actions.Add(new OfficePathAction
            {
                Id = "open-office-settings",
                Label = "Open Office Settings",
                TargetPath = settingsPath,
            });
        }

        return actions;
    }

    private static IReadOnlyList<OfficeRoleModelSummary> BuildRoleModels(JsonElement? settings, IReadOnlyList<string> installedModels)
    {
        var models = new List<OfficeRoleModelSummary>();
        AddRole(models, installedModels, "Chief", GetTrimmedString(settings, "chiefModel"));
        AddRole(models, installedModels, "Mentor", GetTrimmedString(settings, "mentorModel"));
        AddRole(models, installedModels, "Repo", GetTrimmedString(settings, "repoModel"));
        AddRole(models, installedModels, "Training", GetTrimmedString(settings, "trainingModel"));
        AddRole(models, installedModels, "Business", GetTrimmedString(settings, "businessModel"));
        return models;
    }

    private static void AddRole(List<OfficeRoleModelSummary> models, IReadOnlyList<string> installedModels, string role, string? modelName)
    {
        if (string.IsNullOrWhiteSpace(modelName))
        {
            return;
        }

        models.Add(new OfficeRoleModelSummary
        {
            Role = role,
            ModelName = modelName,
            Installed = installedModels.Contains(modelName, StringComparer.OrdinalIgnoreCase),
        });
    }

    private static string ResolveProviderLabel(string providerId)
    {
        return providerId.Equals("ollama", StringComparison.OrdinalIgnoreCase)
            ? "Ollama (local)"
            : providerId;
    }

    private static async Task<IReadOnlyList<string>> TryGetInstalledModelsAsync(string endpoint, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            return Array.Empty<string>();
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, BuildOllamaTagsUri(endpoint));
            using var response = await HttpClient.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();

            var payload = await response.Content.ReadAsStringAsync(cancellationToken);
            using var document = JsonDocument.Parse(payload);
            if (!document.RootElement.TryGetProperty("models", out var modelsElement) || modelsElement.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<string>();
            }

            return modelsElement
                .EnumerateArray()
                .Select(model => TryGetString(model, "model") ?? TryGetString(model, "name"))
                .Where(static model => !string.IsNullOrWhiteSpace(model))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Cast<string>()
                .ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static Uri BuildOllamaTagsUri(string endpoint)
    {
        var normalized = endpoint.EndsWith("/", StringComparison.Ordinal) ? endpoint : $"{endpoint}/";
        return new Uri(new Uri(normalized), "api/tags");
    }

    private static TimeSpan GetWatchlistInterval(string frequency)
    {
        return frequency switch
        {
            "Daily" => TimeSpan.FromDays(1),
            "Twice Weekly" => TimeSpan.FromDays(3),
            _ => TimeSpan.FromDays(7),
        };
    }

    private static string ResolveKnowledgeLibraryPath(JsonElement? settings, JsonElement? companionConfig)
    {
        var explicitPath = GetTrimmedString(settings, "knowledgeLibraryPath");
        if (!string.IsNullOrWhiteSpace(explicitPath))
        {
            return explicitPath;
        }

        var companionPath = GetTrimmedString(companionConfig, "knowledgeLibraryPath");
        if (!string.IsNullOrWhiteSpace(companionPath))
        {
            return companionPath;
        }

        return ResolveDefaultOfficeWorkspacePath("Knowledge");
    }

    private static string ResolveStateRootPath(JsonElement? settings, JsonElement? companionConfig)
    {
        var explicitPath = GetTrimmedString(settings, "stateRootPath");
        if (!string.IsNullOrWhiteSpace(explicitPath))
        {
            return explicitPath;
        }

        var companionPath = GetTrimmedString(companionConfig, "stateRootPath");
        if (!string.IsNullOrWhiteSpace(companionPath))
        {
            return companionPath;
        }

        return ResolveDefaultOfficeWorkspacePath("State");
    }

    private static string ResolveDefaultOfficeWorkspacePath(string childName)
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrWhiteSpace(userProfile))
        {
            return Path.Combine(userProfile, "Dropbox", "SuiteWorkspace", "Office", childName);
        }

        return Path.Combine("C:\\Users\\Public", "Dropbox", "SuiteWorkspace", "Office", childName);
    }

    private static OfficeKnowledgeRoot BuildKnowledgeRoot(string? path, bool isPrimary)
    {
        var exists = !string.IsNullOrWhiteSpace(path) && Directory.Exists(path);
        if (!exists || string.IsNullOrWhiteSpace(path))
        {
            return new OfficeKnowledgeRoot
            {
                Path = path,
                Exists = false,
                IsPrimary = isPrimary,
            };
        }

        var recentFiles = new List<OfficeKnowledgeDocument>();
        var count = 0;
        try
        {
            var files = Directory.EnumerateFiles(
                path,
                "*.*",
                new EnumerationOptions
                {
                    RecurseSubdirectories = true,
                    IgnoreInaccessible = true,
                    AttributesToSkip = FileAttributes.System,
                });

            foreach (var filePath in files)
            {
                var extension = Path.GetExtension(filePath);
                if (!KnowledgeExtensions.Contains(extension, StringComparer.OrdinalIgnoreCase))
                {
                    continue;
                }

                count += 1;
                recentFiles.Add(new OfficeKnowledgeDocument
                {
                    Name = Path.GetFileName(filePath),
                    Path = filePath,
                    Extension = extension,
                    LastWriteTime = File.GetLastWriteTime(filePath),
                });
            }
        }
        catch
        {
        }

        return new OfficeKnowledgeRoot
        {
            Path = path,
            Exists = true,
            IsPrimary = isPrimary,
            DocumentCount = count,
            RecentDocuments = recentFiles
                .OrderByDescending(static item => item.LastWriteTime)
                .Take(6)
                .ToList(),
        };
    }

    private static string? ResolveOfficeRoot(JsonElement? companionConfig, string suiteRepoRoot)
    {
        var officeRoot = GetTrimmedString(companionConfig, "rootDirectory")
            ?? GetTrimmedString(companionConfig, "dailyRoot");
        if (!string.IsNullOrWhiteSpace(officeRoot))
        {
            return officeRoot;
        }

        var candidate = Path.GetFullPath(Path.Combine(suiteRepoRoot, "..", "Office"));
        return Directory.Exists(candidate) ? candidate : null;
    }

    private static IReadOnlyList<string> ResolveSettingsPaths(string? publishedExecutablePath, string? officeRoot)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(publishedExecutablePath))
        {
            var publishedDirectory = Path.GetDirectoryName(publishedExecutablePath);
            if (!string.IsNullOrWhiteSpace(publishedDirectory))
            {
                candidates.Add(Path.Combine(publishedDirectory, "dailydesk.settings.json"));
                candidates.Add(Path.Combine(publishedDirectory, "dailydesk.settings.local.json"));
            }
        }

        if (!string.IsNullOrWhiteSpace(officeRoot))
        {
            candidates.Add(Path.Combine(officeRoot, "DailyDesk", "dailydesk.settings.json"));
            candidates.Add(Path.Combine(officeRoot, "DailyDesk", "dailydesk.settings.local.json"));
        }

        return candidates
            .Where(static path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static JsonElement? ReadJsonObject(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            return document.RootElement.Clone();
        }
        catch
        {
            return null;
        }
    }

    private static JsonElement? ReadMergedJsonObject(IEnumerable<string> paths)
    {
        var rootNode = new JsonObject();
        var mergedAny = false;

        foreach (var path in paths)
        {
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            {
                continue;
            }

            try
            {
                if (JsonNode.Parse(File.ReadAllText(path)) is not JsonObject parsed)
                {
                    continue;
                }

                foreach (var property in parsed)
                {
                    rootNode[property.Key] = property.Value?.DeepClone();
                }

                mergedAny = true;
            }
            catch
            {
            }
        }

        if (!mergedAny)
        {
            return null;
        }

        using var document = JsonDocument.Parse(rootNode.ToJsonString());
        return document.RootElement.Clone();
    }

    private static List<JsonElement> ReadArray(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || !element.Value.TryGetProperty(propertyName, out var arrayElement) || arrayElement.ValueKind != JsonValueKind.Array)
        {
            return new List<JsonElement>();
        }

        return arrayElement.EnumerateArray().Select(static item => item.Clone()).ToList();
    }

    private static int CountArray(JsonElement? element, string propertyName)
    {
        return ReadArray(element, propertyName).Count;
    }

    private static string? TryDescribeLatestReflection(JsonElement? element)
    {
        var latest = ReadArray(element, "reflections").FirstOrDefault();
        if (latest.ValueKind == JsonValueKind.Undefined)
        {
            return null;
        }

        var mode = TryGetString(latest, "mode");
        var focus = TryGetString(latest, "focus");
        var reflection = TryGetString(latest, "reflection");
        if (string.IsNullOrWhiteSpace(mode) && string.IsNullOrWhiteSpace(focus) && string.IsNullOrWhiteSpace(reflection))
        {
            return null;
        }

        var condensed = Truncate(reflection, 120);
        return string.Join(" | ", new[] { mode, focus, condensed }.Where(static part => !string.IsNullOrWhiteSpace(part)));
    }

    private static string? TryDescribeLatestDailyObjective(IReadOnlyList<JsonElement> dailyRuns)
    {
        var latest = dailyRuns
            .OrderByDescending(static item => TryGetDateTimeOffset(item, "generatedAt") ?? DateTimeOffset.MinValue)
            .FirstOrDefault();

        if (latest.ValueKind == JsonValueKind.Undefined)
        {
            return null;
        }

        return TryGetString(latest, "objective");
    }

    private static string Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.Length <= maxLength ? value : $"{value[..Math.Max(0, maxLength - 3)]}...";
    }

    private static string? GetTrimmedString(JsonElement? element, string propertyName)
    {
        var value = TryGetString(element, propertyName);
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static IReadOnlyList<string> GetStringArray(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || !element.Value.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return property
            .EnumerateArray()
            .Where(static item => item.ValueKind == JsonValueKind.String)
            .Select(static item => item.GetString())
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .Cast<string>()
            .ToList();
    }

    private static string? TryGetString(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || !element.Value.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return property.GetString();
    }

    private static string? TryGetNestedString(JsonElement element, string objectName, string propertyName)
    {
        return element.TryGetProperty(objectName, out var nested) ? TryGetString(nested, propertyName) : null;
    }

    private static bool GetBoolean(JsonElement? element, string propertyName, bool defaultValue)
    {
        return TryGetBoolean(element, propertyName, defaultValue);
    }

    private static bool TryGetBoolean(JsonElement? element, string propertyName, bool defaultValue = false)
    {
        if (!element.HasValue || !element.Value.TryGetProperty(propertyName, out var property))
        {
            return defaultValue;
        }

        return property.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String when bool.TryParse(property.GetString(), out var parsed) => parsed,
            _ => defaultValue,
        };
    }

    private static DateTimeOffset? TryGetDateTimeOffset(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return DateTimeOffset.TryParse(property.GetString(), out var parsed) ? parsed : null;
    }

    internal sealed class OfficeWorkspaceSnapshot
    {
        public string SchemaVersion { get; init; } = string.Empty;
        public DateTimeOffset GeneratedAt { get; init; }
        public bool Available { get; init; }
        public string WorkspaceId { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public string SuiteRepoPath { get; init; } = string.Empty;
        public required OfficeCompanionSnapshot Companion { get; init; }
        public required OfficeBrokerSummary Broker { get; init; }
        public required OfficeProviderSummary Provider { get; init; }
        public required OfficeKnowledgeSummary Knowledge { get; init; }
        public required OfficeTrainingSummary Training { get; init; }
        public required OfficeOperatorSummary Operator { get; init; }
        public required OfficeGrowthSummary Growth { get; init; }
        public required OfficeTodaySummary Today { get; init; }
        public required IReadOnlyList<OfficeInboxItem> InboxItems { get; init; }
        public required IReadOnlyList<OfficePathAction> Actions { get; init; }
    }

    internal sealed class OfficeCompanionSnapshot
    {
        public string? ConfigPath { get; init; }
        public bool ConfigExists { get; init; }
        public string? ExecutablePath { get; init; }
        public bool ExecutableExists { get; init; }
        public string? WorkingDirectory { get; init; }
        public string? OfficeRoot { get; init; }
        public string? SettingsPath { get; init; }
        public bool SettingsExists { get; init; }
        public string? BrokerBaseUrl { get; init; }
        public string? BrokerPublishPath { get; init; }
        public bool BrokerConfigEnabled { get; init; }
    }

    internal sealed class OfficeBrokerSummary
    {
        public bool Enabled { get; init; }
        public bool ConfigExists { get; init; }
        public string BaseUrl { get; init; } = string.Empty;
        public string HealthPath { get; init; } = string.Empty;
        public string StatePath { get; init; } = string.Empty;
        public string? PublishPath { get; init; }
        public bool Healthy { get; init; }
        public bool Reachable { get; init; }
        public bool StateAvailable { get; init; }
        public string? LastError { get; init; }
        public DateTimeOffset? LastCheckedAt { get; init; }
    }

    internal sealed class OfficeProviderSummary
    {
        public string PrimaryProviderId { get; init; } = string.Empty;
        public string PrimaryProviderLabel { get; init; } = string.Empty;
        public string Endpoint { get; init; } = string.Empty;
        public bool Ready { get; init; }
        public int InstalledModelCount { get; init; }
        public IReadOnlyList<string> InstalledModels { get; init; } = Array.Empty<string>();
        public bool HuggingFaceCatalogEnabled { get; init; }
        public string HuggingFaceTokenEnvVar { get; init; } = string.Empty;
        public bool HuggingFaceTokenPresent { get; init; }
        public string HuggingFaceMcpUrl { get; init; } = string.Empty;
        public IReadOnlyList<OfficeRoleModelSummary> RoleModels { get; init; } = Array.Empty<OfficeRoleModelSummary>();
    }

    internal sealed class OfficeRoleModelSummary
    {
        public string Role { get; init; } = string.Empty;
        public string ModelName { get; init; } = string.Empty;
        public bool Installed { get; init; }
    }

    internal sealed class OfficeKnowledgeSummary
    {
        public string LibraryPath { get; init; } = string.Empty;
        public bool LibraryExists { get; init; }
        public required OfficeKnowledgeRoot PrimaryRoot { get; init; }
        public IReadOnlyList<OfficeKnowledgeRoot> AdditionalRoots { get; init; } = Array.Empty<OfficeKnowledgeRoot>();
        public int TotalDocumentCount { get; init; }
        public IReadOnlyList<OfficeKnowledgeDocument> RecentDocuments { get; init; } = Array.Empty<OfficeKnowledgeDocument>();
    }

    internal sealed class OfficeKnowledgeRoot
    {
        public string? Path { get; init; }
        public bool Exists { get; init; }
        public bool IsPrimary { get; init; }
        public int DocumentCount { get; init; }
        public IReadOnlyList<OfficeKnowledgeDocument> RecentDocuments { get; init; } = Array.Empty<OfficeKnowledgeDocument>();
    }

    internal sealed class OfficeKnowledgeDocument
    {
        public string Name { get; init; } = string.Empty;
        public string Path { get; init; } = string.Empty;
        public string Extension { get; init; } = string.Empty;
        public DateTimeOffset LastWriteTime { get; init; }
    }

    internal sealed class OfficeTrainingSummary
    {
        public string HistoryPath { get; init; } = string.Empty;
        public bool HistoryExists { get; init; }
        public DateTimeOffset? LastWriteAt { get; init; }
        public int PracticeAttemptCount { get; init; }
        public int DefenseAttemptCount { get; init; }
        public int ReflectionCount { get; init; }
        public string? LatestReflection { get; init; }
    }

    internal sealed class OfficeOperatorSummary
    {
        public string MemoryPath { get; init; } = string.Empty;
        public bool MemoryExists { get; init; }
        public DateTimeOffset? LastWriteAt { get; init; }
        public int SuggestionCount { get; init; }
        public int PendingApprovalCount { get; init; }
        public int DueWatchlistCount { get; init; }
        public int WatchlistCount { get; init; }
        public int DailyRunCount { get; init; }
        public int DeskThreadCount { get; init; }
        public int ActivityCount { get; init; }
        public int QueuedSuggestionCount { get; init; }
        public string? LatestDailyObjective { get; init; }
    }

    internal sealed class OfficeGrowthSummary
    {
        public string SuiteFocus { get; init; } = string.Empty;
        public string EngineeringFocus { get; init; } = string.Empty;
        public string CadFocus { get; init; } = string.Empty;
        public string BusinessFocus { get; init; } = string.Empty;
        public string CareerFocus { get; init; } = string.Empty;
        public IReadOnlyList<string> ProofTracks { get; init; } = Array.Empty<string>();
    }

    internal sealed class OfficeTodaySummary
    {
        public string Objective { get; init; } = string.Empty;
        public IReadOnlyList<string> Highlights { get; init; } = Array.Empty<string>();
    }

    internal sealed class OfficeInboxItem
    {
        public string Id { get; init; } = string.Empty;
        public string Tone { get; init; } = "info";
        public string Title { get; init; } = string.Empty;
        public string Summary { get; init; } = string.Empty;
        public string WorkspaceView { get; init; } = "today";
    }

    internal sealed class OfficePathAction
    {
        public string Id { get; init; } = string.Empty;
        public string Label { get; init; } = string.Empty;
        public string TargetPath { get; init; } = string.Empty;
    }
}
