using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Runtime;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;
using Exception = System.Exception;

namespace SuiteCadAuthoring
{
    internal sealed class AcadeDebugStatusSnapshot
    {
        public string ActiveProfile { get; set; } = string.Empty;

        public string PipeName { get; set; } = string.Empty;

        public bool PipeHostEligible { get; set; }

        public bool PipeHostStarted { get; set; }

        public string ActiveDocumentName { get; set; } = string.Empty;

        public string ActiveDocumentPath { get; set; } = string.Empty;

        public int OpenDocumentCount { get; set; }

        public string ActiveCommandNames { get; set; } = string.Empty;

        public bool WdLoadReady { get; set; }

        public bool WdLoadArxReady { get; set; }

        public string ActiveProjectPath { get; set; } = string.Empty;

        public string ActiveProjectFilePath { get; set; } = string.Empty;

        public string ActiveProjectDatabasePath { get; set; } = string.Empty;

        public int DatabaseModified { get; set; }

        public bool SwitchEligible { get; set; }

        public string SwitchBlockedReason { get; set; } = string.Empty;

        public bool TrackerIsCreating { get; set; }

        public string TrackerRequestId { get; set; } = string.Empty;

        public string TrackerTargetPath { get; set; } = string.Empty;

        public string TraceRoot { get; set; } = string.Empty;
    }

    internal static class SuiteCadAcadeTraceLog
    {
        private static readonly object SyncRoot = new object();
        private static readonly JsonSerializerOptions TraceJsonOptions = new JsonSerializerOptions(
            JsonSerializerDefaults.Web
        );

        internal static string ResolveTraceRoot()
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var root = Path.Combine(localAppData, "Suite", "logs", "acade");
            Directory.CreateDirectory(root);
            return root;
        }

        internal static string ResolveTracePath(string requestId)
        {
            var safeRequestId = SanitizeFileStem(requestId);
            var datedDirectory = Path.Combine(ResolveTraceRoot(), DateTime.UtcNow.ToString("yyyy-MM-dd"));
            Directory.CreateDirectory(datedDirectory);
            return Path.Combine(datedDirectory, $"{safeRequestId}.jsonl");
        }

        internal static void WriteTrace(
            string requestId,
            string action,
            string stage,
            object? data = null,
            Exception? exception = null
        )
        {
            try
            {
                var payload = new JsonObject
                {
                    ["timestampUtc"] = DateTime.UtcNow.ToString("O"),
                    ["requestId"] = string.IsNullOrWhiteSpace(requestId) ? "unknown" : requestId.Trim(),
                    ["action"] = string.IsNullOrWhiteSpace(action) ? "unknown" : action.Trim(),
                    ["stage"] = string.IsNullOrWhiteSpace(stage) ? "unknown" : stage.Trim(),
                    ["threadId"] = Environment.CurrentManagedThreadId,
                    ["processId"] = Environment.ProcessId,
                    ["isOnApplicationThread"] = SuiteCadPipeHost.IsOnApplicationThread,
                };

                if (data != null)
                {
                    payload["data"] = JsonSerializer.SerializeToNode(data, TraceJsonOptions);
                }

                if (exception != null)
                {
                    payload["exception"] = JsonSerializer.SerializeToNode(
                        new
                        {
                            type = exception.GetType().FullName ?? exception.GetType().Name,
                            message = exception.Message,
                            stackTrace = exception.StackTrace ?? string.Empty,
                        },
                        TraceJsonOptions
                    );
                }

                var line = payload.ToJsonString(TraceJsonOptions) + Environment.NewLine;
                var path = ResolveTracePath(requestId);
                lock (SyncRoot)
                {
                    File.AppendAllText(path, line);
                }
            }
            catch
            {
                // Diagnostics must never break the ACADE command flow.
            }
        }

        private static string SanitizeFileStem(string requestId)
        {
            var value = string.IsNullOrWhiteSpace(requestId) ? "unknown" : requestId.Trim();
            foreach (var invalidCharacter in Path.GetInvalidFileNameChars())
            {
                value = value.Replace(invalidCharacter, '-');
            }

            return value.Length == 0 ? "unknown" : value;
        }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        [CommandMethod("SUITEACADEDEBUGSTATUS", CommandFlags.Session)]
        public void WriteAcadeDebugStatus()
        {
            var editor = Application.DocumentManager?.MdiActiveDocument?.Editor;
            if (editor == null)
            {
                return;
            }

            var snapshot = CaptureAcadeDebugStatus();
            editor.WriteMessage("\n═══ SUITE ACADE DEBUG STATUS ═══");
            editor.WriteMessage($"\n  Profile:          {snapshot.ActiveProfile}");
            editor.WriteMessage(
                $"\n  Pipe Host:        {(snapshot.PipeHostStarted ? "Running" : "Stopped")} ({snapshot.PipeName})"
            );
            editor.WriteMessage($"\n  Pipe Eligible:    {snapshot.PipeHostEligible}");
            editor.WriteMessage(
                $"\n  Active Doc:       {(snapshot.ActiveDocumentName.Length == 0 ? "(none)" : snapshot.ActiveDocumentName)}"
            );
            editor.WriteMessage(
                $"\n  Active Doc Path:  {(snapshot.ActiveDocumentPath.Length == 0 ? "(unsaved)" : snapshot.ActiveDocumentPath)}"
            );
            editor.WriteMessage($"\n  Open Docs:        {snapshot.OpenDocumentCount}");
            editor.WriteMessage(
                $"\n  CMDNAMES:         {(snapshot.ActiveCommandNames.Length == 0 ? "(idle)" : snapshot.ActiveCommandNames)}"
            );
            editor.WriteMessage($"\n  wd_load:          {snapshot.WdLoadReady}");
            editor.WriteMessage($"\n  wd_load_arx:      {snapshot.WdLoadArxReady}");
            editor.WriteMessage(
                $"\n  Active Project:   {(snapshot.ActiveProjectPath.Length == 0 ? "(none)" : snapshot.ActiveProjectPath)}"
            );
            editor.WriteMessage(
                $"\n  Active .wdp:      {(snapshot.ActiveProjectFilePath.Length == 0 ? "(none)" : snapshot.ActiveProjectFilePath)}"
            );
            editor.WriteMessage(
                $"\n  Active .mdb:      {(snapshot.ActiveProjectDatabasePath.Length == 0 ? "(none)" : snapshot.ActiveProjectDatabasePath)}"
            );
            editor.WriteMessage($"\n  DBMOD:            {snapshot.DatabaseModified}");
            editor.WriteMessage($"\n  Switch Eligible:  {snapshot.SwitchEligible}");
            if (snapshot.SwitchBlockedReason.Length > 0)
            {
                editor.WriteMessage($"\n  Switch Blocked:   {snapshot.SwitchBlockedReason}");
            }
            editor.WriteMessage($"\n  Tracker Creating: {snapshot.TrackerIsCreating}");
            if (snapshot.TrackerRequestId.Length > 0)
            {
                editor.WriteMessage($"\n  Tracker Request:  {snapshot.TrackerRequestId}");
            }
            if (snapshot.TrackerTargetPath.Length > 0)
            {
                editor.WriteMessage($"\n  Tracker Target:   {snapshot.TrackerTargetPath}");
            }
            editor.WriteMessage($"\n  Trace Root:       {snapshot.TraceRoot}");
        }

        internal static AcadeDebugStatusSnapshot CaptureAcadeDebugStatus()
        {
            var snapshot = new AcadeDebugStatusSnapshot
            {
                ActiveProfile = SuiteCadPipeHost.ResolveCurrentProfileName(),
                TraceRoot = SuiteCadAcadeTraceLog.ResolveTraceRoot(),
            };

            try
            {
                var pipeStatus = SuiteCadPipeHost.GetStatus();
                snapshot.PipeName = pipeStatus.PipeName;
                snapshot.PipeHostEligible = pipeStatus.HostEligible;
                snapshot.PipeHostStarted = pipeStatus.HostStarted;
            }
            catch
            {
                // Best effort diagnostics only.
            }

            try
            {
                var documentManager = Application.DocumentManager;
                if (documentManager != null)
                {
                    foreach (Document _ in documentManager)
                    {
                        snapshot.OpenDocumentCount += 1;
                    }

                    var activeDocument = documentManager.MdiActiveDocument;
                    if (activeDocument != null)
                    {
                        snapshot.ActiveDocumentName = NormalizeText(activeDocument.Name);
                        snapshot.ActiveDocumentPath = NormalizeText(activeDocument.Database?.Filename);
                    }
                }
            }
            catch
            {
                // Best effort diagnostics only.
            }

            snapshot.ActiveCommandNames = ResolveActiveCommandNames();

            try
            {
                TryWarmAcadeProjectFunctionsViaLispQuiet(
                    out var wdLoadReady,
                    out var wdLoadArxReady,
                    out _
                );
                snapshot.WdLoadReady = wdLoadReady;
                snapshot.WdLoadArxReady = wdLoadArxReady;
            }
            catch
            {
                // Best effort diagnostics only.
            }

            try
            {
                var assembly = LoadAcePageManAssembly(out _);
                if (TryGetActiveProjectIdentity(assembly, out var activeProjectIdentity))
                {
                    snapshot.ActiveProjectPath = NormalizeText(activeProjectIdentity.PreferredPath);
                    snapshot.ActiveProjectFilePath = NormalizeText(activeProjectIdentity.ProjectFilePath);
                    snapshot.ActiveProjectDatabasePath = NormalizeText(activeProjectIdentity.DatabasePath);
                }
            }
            catch
            {
                // Best effort diagnostics only.
            }

            try
            {
                if (SuiteCadTrackerOperationStateStore.TryReadState(out var trackerState))
                {
                    snapshot.TrackerIsCreating = trackerState.IsCreating;
                    snapshot.TrackerRequestId = trackerState.RequestId ?? string.Empty;
                    snapshot.TrackerTargetPath = trackerState.TargetPath ?? string.Empty;
                }
            }
            catch
            {
                // Best effort diagnostics only.
            }

            snapshot.DatabaseModified = ResolveDatabaseModifiedState();
            var switchEligibility = EvaluateAcadeProjectSwitchEligibility(
                new AcadeWorkingDocumentContext
                {
                    Document = Application.DocumentManager?.MdiActiveDocument,
                }
            );
            snapshot.SwitchEligible = switchEligibility.Eligible;
            snapshot.SwitchBlockedReason = NormalizeText(switchEligibility.BlockedReason);

            return snapshot;
        }
    }
}
