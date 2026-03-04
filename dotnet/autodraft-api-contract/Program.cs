using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using AutoDraft.ApiContract.Services;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AutoDraftOptions>(
    builder.Configuration.GetSection("AutoDraft")
);
builder.Services.AddSingleton<IAutoDraftPlanner, RuleBasedAutoDraftPlanner>();
builder.Services.AddSingleton<IAutoDraftExecutor, MockAutoDraftExecutor>();

var app = builder.Build();

app.MapGet("/", () =>
    Results.Ok(
        new
        {
            app = "AutoDraft API Contract",
            endpoints = new[]
            {
                "GET /health",
                "GET /api/autodraft/rules",
                "POST /api/autodraft/plan",
                "POST /api/autodraft/execute",
            },
        }
    )
);

app.MapGet("/health", (IOptions<AutoDraftOptions> options) =>
    Results.Ok(
        new AutoDraftHealthResponse
        {
            Ok = true,
            App = "AutoDraft .NET API",
            Mode = "contract-stub",
            Version = options.Value.Version,
            PlannerReady = true,
            ExecutorReady = options.Value.EnableMockExecution,
            TimestampUtc = DateTimeOffset.UtcNow,
        }
    )
);

app.MapGet("/api/autodraft/rules", (IAutoDraftPlanner planner) =>
    Results.Ok(
        new AutoDraftRulesResponse
        {
            Ok = true,
            Rules = planner.GetRules(),
        }
    )
);

app.MapPost("/api/autodraft/plan", (AutoDraftPlanRequest request, IAutoDraftPlanner planner) =>
    Results.Ok(planner.Plan(request))
);

app.MapPost(
    "/api/autodraft/execute",
    async (
        AutoDraftExecuteRequest request,
        IAutoDraftExecutor executor,
        CancellationToken cancellationToken
    ) =>
    {
        var result = await executor.ExecuteAsync(request, cancellationToken);
        if (!result.Ok)
        {
            return Results.Json(result, statusCode: StatusCodes.Status501NotImplemented);
        }

        return Results.Ok(result);
    }
);

app.Run();
