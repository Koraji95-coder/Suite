using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using AutoDraft.ApiContract.Services;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AutoDraftOptions>(
    builder.Configuration.GetSection("AutoDraft")
);
builder.Services.AddSingleton<IAutoDraftPlanner, RuleBasedAutoDraftPlanner>();
builder.Services.AddSingleton<IAutoDraftExecutor, DeterministicAutoDraftExecutor>();
builder.Services.AddSingleton<IAutoDraftBackchecker, MockAutoDraftBackchecker>();
builder.Services.AddSingleton<IAutoDraftComparer, RuleBasedAutoDraftComparer>();

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
                "POST /api/autodraft/backcheck",
                "POST /api/autodraft/compare",
            },
        }
    )
);

app.MapGet("/health", (IOptions<AutoDraftOptions> options) =>
{
    var executorEnabled = options.Value.EnableMockExecution;
    return Results.Ok(
        new AutoDraftHealthResponse
        {
            Ok = true,
            App = "AutoDraft .NET API",
            Mode = executorEnabled ? "deterministic-preflight" : "deterministic-disabled",
            Version = options.Value.Version,
            PlannerReady = true,
            ExecutorReady = executorEnabled,
            TimestampUtc = DateTimeOffset.UtcNow,
        }
    );
});

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

app.MapPost(
    "/api/autodraft/backcheck",
    (
        AutoDraftBackcheckRequest request,
        IAutoDraftBackchecker backchecker,
        CancellationToken cancellationToken
    ) => Results.Ok(backchecker.Backcheck(request, cancellationToken))
);

app.MapPost(
    "/api/autodraft/compare",
    (
        AutoDraftCompareRequest request,
        IAutoDraftComparer comparer,
        CancellationToken cancellationToken
    ) => Results.Ok(comparer.Compare(request, cancellationToken))
);

app.Run();
