using System.Text;

static partial class ConduitRouteStubHandlers
{
    internal static string BuildAutoCadLispInvocationScript(
        string lispExpression
    )
    {
        var normalizedExpression = (lispExpression ?? "").Trim();
        if (string.IsNullOrWhiteSpace(normalizedExpression))
        {
            throw new ArgumentException("lispExpression is required.", nameof(lispExpression));
        }

        return normalizedExpression.EndsWith('\n')
            ? normalizedExpression
            : normalizedExpression + "\n";
    }

    internal static string BuildAutoCadCommandScript(
        string command,
        params string[] promptInputs
    )
    {
        var normalizedCommand = (command ?? "").Trim();
        if (string.IsNullOrWhiteSpace(normalizedCommand))
        {
            throw new ArgumentException("command is required.", nameof(command));
        }

        var script = new StringBuilder();
        AppendAutoCadCommandInvocation(script, normalizedCommand, promptInputs);
        return script.ToString();
    }

    internal static string BuildSuitePluginLispInvocationScript(
        string pluginDllPath,
        string lispFunctionName,
        params string[] lispArguments
    )
    {
        var normalizedPluginPath = (pluginDllPath ?? "").Trim();
        var normalizedLispFunctionName = (lispFunctionName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(normalizedPluginPath))
        {
            throw new ArgumentException("pluginDllPath is required.", nameof(pluginDllPath));
        }
        if (string.IsNullOrWhiteSpace(normalizedLispFunctionName))
        {
            throw new ArgumentException("lispFunctionName is required.", nameof(lispFunctionName));
        }

        var script = new StringBuilder();
        AppendAutoCadCommandInvocation(script, "_.NETLOAD", normalizedPluginPath);
        script.Append(BuildAutoCadLispExpression(normalizedLispFunctionName, lispArguments));
        script.Append('\n');
        return script.ToString();
    }

    internal static string BuildSuitePluginCommandScript(
        string pluginDllPath,
        string pluginCommand,
        params string[] promptInputs
    )
    {
        var normalizedPluginPath = (pluginDllPath ?? "").Trim();
        var normalizedPluginCommand = (pluginCommand ?? "").Trim();
        if (string.IsNullOrWhiteSpace(normalizedPluginPath))
        {
            throw new ArgumentException("pluginDllPath is required.", nameof(pluginDllPath));
        }
        if (string.IsNullOrWhiteSpace(normalizedPluginCommand))
        {
            throw new ArgumentException("pluginCommand is required.", nameof(pluginCommand));
        }

        var script = new StringBuilder();
        AppendAutoCadCommandInvocation(script, "_.NETLOAD", normalizedPluginPath);
        AppendAutoCadCommandInvocation(
            script,
            $"_.{normalizedPluginCommand}",
            promptInputs
        );
        return script.ToString();
    }

    internal static string BuildAutoCadLispExpression(
        string functionName,
        params string[] arguments
    )
    {
        var normalizedFunctionName = (functionName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(normalizedFunctionName))
        {
            throw new ArgumentException("functionName is required.", nameof(functionName));
        }

        var expression = new StringBuilder();
        expression.Append('(');
        expression.Append(normalizedFunctionName);
        foreach (var argument in arguments ?? Array.Empty<string>())
        {
            expression.Append(' ');
            AppendAutoCadQuotedToken(expression, argument ?? "");
        }

        expression.Append(')');
        return expression.ToString();
    }

    private static void AppendAutoCadCommandInvocation(
        StringBuilder script,
        string command,
        params string[] promptInputs
    )
    {
        script.Append(command.Trim());
        foreach (var promptInput in promptInputs)
        {
            script.Append(' ');
            AppendAutoCadQuotedToken(script, promptInput ?? "");
        }

        script.Append('\n');
    }

    private static void AppendAutoCadQuotedToken(StringBuilder script, string value)
    {
        script.Append('"');
        script.Append((value ?? "").Replace("\"", "\"\""));
        script.Append('"');
    }
}
