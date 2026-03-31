using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;
using Exception = System.Exception;

namespace SuiteCadAuthoring
{
    internal sealed class AcadeProjectOpenPayload
    {
        public string RequestId { get; set; }
        public string ProjectRootPath { get; set; }
        public string WdpPath { get; set; }
        public string UiMode { get; set; }
    }

    internal sealed class AcadeProjectOpenResultEnvelope
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public AcadeProjectOpenResultData Data { get; set; } = new AcadeProjectOpenResultData();
        public List<string> Warnings { get; set; } = new List<string>();
        public Dictionary<string, object> Meta { get; set; } = new Dictionary<string, object>();
    }

    internal sealed class AcadeProjectOpenResultData
    {
        public string WdpPath { get; set; }
        public bool ProjectActivated { get; set; }
        public string Strategy { get; set; }
    }

    internal sealed class AcadeProjectOpenInvocationResult
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public string Strategy { get; set; }
        public string AssemblyPath { get; set; }
        public int InvocationAttempts { get; set; }
        public string ActiveProjectPath { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        [CommandMethod("SUITEACADEPROJECTOPEN", CommandFlags.Session)]
        public void OpenAcadeProject()
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            var editor = document?.Editor;
            if (editor == null)
            {
                return;
            }

            var payloadPrompt = editor.GetString("\nSuite ACADE project-open payload JSON path: ");
            if (payloadPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(payloadPrompt.StringResult))
            {
                return;
            }

            var resultPrompt = editor.GetString("\nSuite ACADE project-open result JSON path: ");
            if (resultPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(resultPrompt.StringResult))
            {
                return;
            }

            var envelope = ExecuteAcadeProjectOpen(
                payloadPrompt.StringResult.Trim(),
                resultPrompt.StringResult.Trim()
            );
            try
            {
                File.WriteAllText(
                    resultPrompt.StringResult.Trim(),
                    JsonSerializer.Serialize(envelope, JsonOptions)
                );
            }
            catch (Exception ex)
            {
                editor.WriteMessage($"\n[Suite] Failed to write ACADE project-open result file: {ex.Message}");
            }

            editor.WriteMessage($"\n[Suite] {envelope.Message}");
        }

        private static AcadeProjectOpenResultEnvelope ExecuteAcadeProjectOpen(
            string payloadPath,
            string resultPath
        )
        {
            if (!Path.IsPathRooted(payloadPath))
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "Payload path must be absolute.");
            }
            if (!File.Exists(payloadPath))
            {
                return BuildAcadeProjectOpenFailure(
                    "INVALID_REQUEST",
                    $"Payload file was not found: {payloadPath}"
                );
            }
            if (!Path.IsPathRooted(resultPath))
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "Result path must be absolute.");
            }

            AcadeProjectOpenPayload payload;
            try
            {
                payload = JsonSerializer.Deserialize<AcadeProjectOpenPayload>(
                    File.ReadAllText(payloadPath),
                    JsonOptions
                );
            }
            catch (Exception ex)
            {
                return BuildAcadeProjectOpenFailure(
                    "INVALID_REQUEST",
                    $"Unable to parse payload JSON: {ex.Message}"
                );
            }

            if (payload == null)
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "Payload was empty.");
            }

            var wdpPath = NormalizeText(payload.WdpPath);
            if (wdpPath.Length == 0)
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "wdpPath is required.");
            }
            if (!Path.IsPathRooted(wdpPath))
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "wdpPath must be absolute.");
            }

            try
            {
                wdpPath = Path.GetFullPath(wdpPath);
            }
            catch (Exception ex)
            {
                return BuildAcadeProjectOpenFailure(
                    "INVALID_REQUEST",
                    $"wdpPath is invalid: {ex.Message}"
                );
            }

            if (!File.Exists(wdpPath))
            {
                return BuildAcadeProjectOpenFailure(
                    "INVALID_REQUEST",
                    $"wdpPath was not found: {wdpPath}"
                );
            }

            var invocation = TryInvokeAcadeProjectOpen(wdpPath);
            var envelope = new AcadeProjectOpenResultEnvelope
            {
                Success = invocation.Success,
                Code = invocation.Success ? string.Empty : NormalizeText(invocation.Code),
                Message = invocation.Success
                    ? "ACADE project open command completed."
                    : NormalizeText(invocation.Message),
                Data = new AcadeProjectOpenResultData
                {
                    WdpPath = wdpPath,
                    ProjectActivated = invocation.Success,
                    Strategy = NormalizeText(invocation.Strategy),
                },
                Warnings = invocation.Warnings,
                Meta = new Dictionary<string, object>
                {
                    ["providerPath"] = "plugin",
                    ["payloadPath"] = payloadPath,
                    ["resultPath"] = resultPath,
                    ["strategy"] = NormalizeText(invocation.Strategy),
                    ["assemblyPath"] = NormalizeText(invocation.AssemblyPath),
                    ["invocationAttempts"] = invocation.InvocationAttempts,
                },
            };

            if (!string.IsNullOrWhiteSpace(invocation.ActiveProjectPath))
            {
                envelope.Meta["activeProjectPath"] = invocation.ActiveProjectPath;
            }

            if (!envelope.Success && envelope.Message.Length == 0)
            {
                envelope.Message = "ACADE project open failed.";
            }

            return envelope;
        }

        private static AcadeProjectOpenResultEnvelope BuildAcadeProjectOpenFailure(
            string code,
            string message
        )
        {
            return new AcadeProjectOpenResultEnvelope
            {
                Success = false,
                Code = code,
                Message = message,
                Meta = new Dictionary<string, object>
                {
                    ["providerPath"] = "plugin",
                },
            };
        }

        private static AcadeProjectOpenInvocationResult TryInvokeAcadeProjectOpen(string wdpPath)
        {
            var result = new AcadeProjectOpenInvocationResult();
            Assembly acePageManAssembly;
            try
            {
                acePageManAssembly = LoadAcePageManAssembly(out var assemblyPath);
                result.AssemblyPath = assemblyPath;
            }
            catch (Exception ex)
            {
                result.Code = "ACADE_PROJECT_OPEN_FAILED";
                result.Message = $"Unable to load AcePageManMgd.dll: {ex.Message}";
                return result;
            }

            if (!TryOpenProjectViaAcePmWdpFiler(acePageManAssembly, wdpPath, result))
            {
                if (NormalizeText(result.Code).Length == 0)
                {
                    result.Code = "ACADE_PROJECT_OPEN_FAILED";
                }
                if (NormalizeText(result.Message).Length == 0)
                {
                    result.Message = "ACADE internal project-open API did not accept the request.";
                }
                return result;
            }

            result.Success = true;
            if (TryGetActiveProjectPath(acePageManAssembly, out var activeProjectPath))
            {
                result.ActiveProjectPath = NormalizeText(activeProjectPath);
                if (
                    !string.IsNullOrWhiteSpace(activeProjectPath)
                    && !string.Equals(
                        NormalizePathToken(activeProjectPath),
                        NormalizePathToken(wdpPath),
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                {
                    result.Warnings.Add(
                        $"ACADE reported active project '{activeProjectPath}', which does not exactly match the requested '{wdpPath}'."
                    );
                }
            }

            return result;
        }

        private static Assembly LoadAcePageManAssembly(out string assemblyPath)
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    if (string.Equals(
                        Path.GetFileName(assembly.Location),
                        "AcePageManMgd.dll",
                        StringComparison.OrdinalIgnoreCase
                    ))
                    {
                        assemblyPath = assembly.Location;
                        return assembly;
                    }
                }
                catch
                {
                    // Skip dynamic assemblies without a stable location.
                }
            }

            var currentProcessPath = Process.GetCurrentProcess().MainModule?.FileName ?? "";
            var installRoot = Path.GetDirectoryName(currentProcessPath) ?? "";
            var candidates = new[]
            {
                Path.Combine(installRoot, "Acade", "AcePageManMgd.dll"),
                Path.Combine(installRoot, "AcePageManMgd.dll"),
            };
            foreach (var candidate in candidates)
            {
                if (!File.Exists(candidate))
                {
                    continue;
                }

                assemblyPath = candidate;
                return Assembly.LoadFrom(candidate);
            }

            throw new FileNotFoundException("AcePageManMgd.dll was not found under the running AutoCAD install.");
        }

        private static bool TryOpenProjectViaAcePmWdpFiler(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            var candidateTypes = GetLoadableTypes(assembly)
                .Where(
                    type =>
                        string.Equals(type.Name, "AcePmUtilsWDPFiler", StringComparison.OrdinalIgnoreCase)
                        || type.Name.IndexOf("WDPFiler", StringComparison.OrdinalIgnoreCase) >= 0
                )
                .OrderByDescending(
                    type => string.Equals(type.Name, "AcePmUtilsWDPFiler", StringComparison.OrdinalIgnoreCase)
                )
                .ToList();

            foreach (var type in candidateTypes)
            {
                var methods = type
                    .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance)
                    .Where(
                        method =>
                            string.Equals(method.Name, "openProject", StringComparison.OrdinalIgnoreCase)
                    )
                    .OrderBy(method => method.GetParameters().Length)
                    .ToList();

                foreach (var method in methods)
                {
                    if (!TryBuildOpenProjectArguments(method, wdpPath, out var args))
                    {
                        continue;
                    }

                    object instance = null;
                    if (!method.IsStatic)
                    {
                        if (type.IsAbstract)
                        {
                            continue;
                        }

                        try
                        {
                            instance = Activator.CreateInstance(type, true);
                        }
                        catch (Exception ex)
                        {
                            result.Warnings.Add(
                                $"Skipped {type.FullName}.{method.Name}: {ex.GetType().Name} {ex.Message}"
                            );
                            continue;
                        }
                    }

                    result.InvocationAttempts += 1;
                    try
                    {
                        var returnValue = method.Invoke(instance, args);
                        var accepted = returnValue is bool boolValue ? boolValue : true;
                        if (!accepted)
                        {
                            result.Warnings.Add(
                                $"{FormatMethodSignature(type, method)} returned false for '{wdpPath}'."
                            );
                            continue;
                        }

                        result.Strategy = $"{type.FullName}.{method.Name}";
                        result.Message = "ACADE project open command completed.";
                        return true;
                    }
                    catch (TargetInvocationException ex)
                    {
                        var detail = ex.InnerException?.Message ?? ex.Message;
                        result.Warnings.Add($"{FormatMethodSignature(type, method)} failed: {detail}");
                        result.Code = "ACADE_PROJECT_OPEN_FAILED";
                        result.Message = detail;
                    }
                    catch (Exception ex)
                    {
                        result.Warnings.Add($"{FormatMethodSignature(type, method)} failed: {ex.Message}");
                        result.Code = "ACADE_PROJECT_OPEN_FAILED";
                        result.Message = ex.Message;
                    }
                }
            }

            return false;
        }

        private static bool TryGetActiveProjectPath(Assembly assembly, out string activeProjectPath)
        {
            activeProjectPath = string.Empty;
            var projectManagerType = GetLoadableTypes(assembly)
                .FirstOrDefault(
                    type =>
                        string.Equals(
                            type.FullName,
                            "Autodesk.Electrical.Project.ProjectManager",
                            StringComparison.Ordinal
                        )
                        || string.Equals(type.Name, "ProjectManager", StringComparison.Ordinal)
                );
            if (projectManagerType != null)
            {
                object projectManager = null;
                var getInstanceMethod = projectManagerType.GetMethods(
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static
                    )
                    .FirstOrDefault(
                        candidate =>
                            string.Equals(candidate.Name, "GetInstance", StringComparison.OrdinalIgnoreCase)
                            && candidate.GetParameters().Length == 0
                    );
                if (getInstanceMethod != null)
                {
                    try
                    {
                        projectManager = getInstanceMethod.Invoke(null, null);
                    }
                    catch
                    {
                        projectManager = null;
                    }
                }

                var getActiveProjectMethod = projectManagerType.GetMethods(
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static
                    )
                    .FirstOrDefault(
                        candidate =>
                            string.Equals(
                                candidate.Name,
                                "GetActiveProject",
                                StringComparison.OrdinalIgnoreCase
                            )
                            && candidate.GetParameters().Length == 0
                    );
                if (getActiveProjectMethod != null)
                {
                    try
                    {
                        var activeProject = getActiveProjectMethod.IsStatic
                            ? getActiveProjectMethod.Invoke(null, null)
                            : projectManager == null
                                ? null
                                : getActiveProjectMethod.Invoke(projectManager, null);
                        if (TryReadAcadeProjectPath(activeProject, out activeProjectPath))
                        {
                            return true;
                        }
                    }
                    catch
                    {
                        // Fall through to legacy discovery for older installs.
                    }
                }
            }

            var legacyProjectType = GetLoadableTypes(assembly)
                .FirstOrDefault(
                    type =>
                        string.Equals(type.FullName, "Autodesk.Electrical.Project", StringComparison.Ordinal)
                        || string.Equals(type.Name, "Project", StringComparison.Ordinal)
                );
            if (legacyProjectType == null)
            {
                return false;
            }

            var legacyGetActiveProject = legacyProjectType.GetMethods(
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static
                )
                .FirstOrDefault(
                    candidate =>
                        string.Equals(candidate.Name, "GetActiveProject", StringComparison.OrdinalIgnoreCase)
                        && candidate.GetParameters().Length == 0
                );
            if (legacyGetActiveProject == null)
            {
                return false;
            }

            try
            {
                return TryReadAcadeProjectPath(
                    legacyGetActiveProject.Invoke(null, null),
                    out activeProjectPath
                );
            }
            catch
            {
                return false;
            }
        }

        private static bool TryReadAcadeProjectPath(object activeProject, out string activeProjectPath)
        {
            activeProjectPath = string.Empty;
            if (activeProject == null)
            {
                return false;
            }

            foreach (
                var methodName in new[] { "GetDbFullPath", "GetProjectFile", "GetFilePath", "GetFullName" }
            )
            {
                try
                {
                    var method = activeProject
                        .GetType()
                        .GetMethod(
                            methodName,
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance,
                            null,
                            Type.EmptyTypes,
                            null
                        );
                    var value = NormalizeText(Convert.ToString(method?.Invoke(activeProject, null)));
                    if (value.Length > 0)
                    {
                        activeProjectPath = value;
                        return true;
                    }
                }
                catch
                {
                    // Best effort metadata inspection.
                }
            }

            foreach (var propertyName in new[] { "WdpPath", "ProjectFile", "FilePath", "Path", "FullName", "FileName" })
            {
                try
                {
                    var property = activeProject
                        .GetType()
                        .GetProperty(
                            propertyName,
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance
                        );
                    var value = NormalizeText(Convert.ToString(property?.GetValue(activeProject, null)));
                    if (value.Length > 0)
                    {
                        activeProjectPath = value;
                        return true;
                    }
                }
                catch
                {
                    // Best effort metadata inspection.
                }
            }

            activeProjectPath = NormalizeText(activeProject.ToString());
            return activeProjectPath.Length > 0;
        }

        private static IEnumerable<Type> GetLoadableTypes(Assembly assembly)
        {
            try
            {
                return assembly.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                return ex.Types.Where(type => type != null);
            }
        }

        private static bool TryBuildOpenProjectArguments(
            MethodInfo method,
            string wdpPath,
            out object[] args
        )
        {
            var parameters = method.GetParameters();
            args = new object[parameters.Length];
            var assignedPath = false;

            for (var index = 0; index < parameters.Length; index++)
            {
                var parameter = parameters[index];
                var parameterType = parameter.ParameterType;
                if (parameterType.IsByRef || parameter.IsOut)
                {
                    return false;
                }

                if (parameterType == typeof(string))
                {
                    if (!assignedPath)
                    {
                        args[index] = wdpPath;
                        assignedPath = true;
                    }
                    else if (parameter.HasDefaultValue)
                    {
                        args[index] = parameter.DefaultValue;
                    }
                    else
                    {
                        args[index] = string.Empty;
                    }
                    continue;
                }

                if (parameterType == typeof(bool))
                {
                    args[index] = false;
                    continue;
                }

                if (
                    parameterType == typeof(int)
                    || parameterType == typeof(short)
                    || parameterType == typeof(long)
                    || parameterType == typeof(double)
                    || parameterType == typeof(float)
                    || parameterType == typeof(decimal)
                )
                {
                    args[index] = Convert.ChangeType(0, parameterType);
                    continue;
                }

                if (parameterType.IsEnum)
                {
                    var values = Enum.GetValues(parameterType);
                    args[index] = values.Length > 0 ? values.GetValue(0) : Activator.CreateInstance(parameterType);
                    continue;
                }

                if (parameter.HasDefaultValue)
                {
                    args[index] = parameter.DefaultValue;
                    continue;
                }

                args[index] = parameterType.IsValueType
                    ? Activator.CreateInstance(parameterType)
                    : null;
            }

            return assignedPath;
        }

        private static string FormatMethodSignature(Type type, MethodInfo method)
        {
            return $"{type.FullName}.{method.Name}({method.GetParameters().Length})";
        }

        private static string NormalizePathToken(string path)
        {
            try
            {
                path = Path.GetFullPath(path);
            }
            catch
            {
                // Keep the original token when normalization fails.
            }

            return NormalizeText(path).Replace('\\', '/').ToUpperInvariant();
        }
    }
}
