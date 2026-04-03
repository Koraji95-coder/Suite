using System;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace SuiteCadAuthoring.Tests;

internal static class AutoCadAssemblyResolver
{
    private static readonly string[] ManagedAssemblyNames = { "accoremgd", "acdbmgd", "acmgd" };

    [ModuleInitializer]
    internal static void Initialize()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveAutoCadAssembly;
    }

    private static Assembly? ResolveAutoCadAssembly(object? sender, ResolveEventArgs args)
    {
        var requestedName = new AssemblyName(args.Name).Name;
        if (string.IsNullOrWhiteSpace(requestedName))
        {
            return null;
        }

        if (Array.IndexOf(ManagedAssemblyNames, requestedName) < 0)
        {
            return null;
        }

        var installDir = ResolveAutoCadInstallDir();
        if (string.IsNullOrWhiteSpace(installDir))
        {
            return null;
        }

        var candidatePath = Path.Combine(installDir, $"{requestedName}.dll");
        return File.Exists(candidatePath) ? Assembly.LoadFrom(candidatePath) : null;
    }

    private static string ResolveAutoCadInstallDir()
    {
        var envPath = Environment.GetEnvironmentVariable("AUTOCAD_INSTALL_DIR");
        if (!string.IsNullOrWhiteSpace(envPath) && File.Exists(Path.Combine(envPath, "accoremgd.dll")))
        {
            return envPath;
        }

        foreach (var year in new[] { "2026", "2025", "2024", "2023", "2022" })
        {
            var candidate = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Autodesk",
                $"AutoCAD {year}"
            );
            if (File.Exists(Path.Combine(candidate, "accoremgd.dll")))
            {
                return candidate;
            }
        }

        return string.Empty;
    }
}
