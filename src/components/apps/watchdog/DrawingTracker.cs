// ═══════════════════════════════════════════════════════════════════════════
// DrawingTracker.cs — AutoCAD .NET Plugin
// Tracks active drawing time with idle detection, drawing swap awareness,
// and folder monitoring. Outputs JSON state for the UI dashboard to consume.
// ═══════════════════════════════════════════════════════════════════════════
//
// REFERENCES NEEDED:
//   - AcDbMgd.dll  (ObjectARX - Database services)
//   - AcMgd.dll    (ObjectARX - Application/Editor services)
//   - AcCoreMgd.dll
//   - System.IO
//   - System.Text.Json (or Newtonsoft.Json)
//
// LOAD IN AUTOCAD:
//   Command: NETLOAD → browse to compiled DrawingTracker.dll
//   Or add to startup via registry/acad.lsp
//
// COMMANDS:
//   STARTTRACKER   - Initialize tracking + folder watchers
//   STOPTRACKER    - Shut down everything cleanly
//   TRACKERSTATUS  - Print current session info to command line
//   TRACKEREXPORT  - Export full session log to JSON
//   TRACKERCONFIG  - Configure idle timeout + watched folders
// ═══════════════════════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Timers;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;
using DiagnosticTrace = System.Diagnostics.Trace;

[assembly: CommandClass(typeof(CadCommandCenter.DrawingTracker))]
[assembly: ExtensionApplication(typeof(CadCommandCenter.DrawingTrackerApplication))]

namespace CadCommandCenter
{
    public class DrawingTrackerApplication : IExtensionApplication
    {
        private static readonly string PluginLogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "CadCommandCenter",
            "tracker-plugin.log"
        );

        public void Initialize()
        {
            WriteLifecycleEvent("initialize");
            TryAutoStartTracker();
        }

        public void Terminate()
        {
            DrawingTracker.ReleaseAutoloadAnnouncementHook();
            WriteLifecycleEvent("terminate");
        }

        internal static void WriteLifecycleEvent(string stage, string detail = null)
        {
            try
            {
                var directory = Path.GetDirectoryName(PluginLogPath);
                if (!string.IsNullOrWhiteSpace(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                File.AppendAllText(
                    PluginLogPath,
                    $"{DateTimeOffset.UtcNow:O} {stage}{(string.IsNullOrWhiteSpace(detail) ? string.Empty : $" {detail}")}{Environment.NewLine}"
                );
            }
            catch (System.Exception ex)
            {
                DiagnosticTrace.TraceError($"Suite Watchdog plugin lifecycle log failed during {stage}: {ex}");
            }
        }

        private static void TryAutoStartTracker()
        {
            try
            {
                var started = DrawingTracker.TryAutoStart();
                WriteLifecycleEvent(started ? "tracker_autostart_started" : "tracker_autostart_skipped");
            }
            catch (System.Exception ex)
            {
                WriteLifecycleEvent("tracker_autostart_failed", $"{ex.GetType().Name}: {ex.Message}");
                DiagnosticTrace.TraceError($"Suite Watchdog tracker autostart failed: {ex}");
            }
        }
    }

    // ─── Data Models ───

    public class DrawingSession
    {
        public string SessionId { get; set; }
        public string DrawingName { get; set; }
        public string FullPath { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public TimeSpan ActiveTime { get; set; }
        public TimeSpan IdleTime { get; set; }
        public int CommandCount { get; set; }
        public List<string> CommandsUsed { get; set; } = new List<string>();
        public bool IsActive { get; set; }
        public long TrackedMilliseconds => Math.Max(0L, (long)Math.Round(ActiveTime.TotalMilliseconds));
        public long IdleMilliseconds => Math.Max(0L, (long)Math.Round(IdleTime.TotalMilliseconds));
        public string WorkDate => (EndedAt ?? StartedAt).ToString("yyyy-MM-dd");
    }

    public class FolderEvent
    {
        public string Type { get; set; }        // "added", "modified", "removed"
        public string FileName { get; set; }
        public string FolderPath { get; set; }
        public string FolderAlias { get; set; }
        public DateTime Timestamp { get; set; }
    }

    public class TrackerConfig
    {
        public int IdleTimeoutSeconds { get; set; } = 300; // default 5 min
        public Dictionary<string, string> WatchedFolders { get; set; } = new Dictionary<string, string>();
        public string OutputJsonPath { get; set; } = "";
        public bool AutoExportEnabled { get; set; } = true;
        public int AutoExportIntervalSeconds { get; set; } = 30;

        public static TrackerConfig LoadOrDefault(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    return JsonSerializer.Deserialize<TrackerConfig>(json) ?? new TrackerConfig();
                }
            }
            catch { /* fall through */ }
            return new TrackerConfig();
        }

        public void Save(string path)
        {
            var opts = new JsonSerializerOptions { WriteIndented = true };
            File.WriteAllText(path, JsonSerializer.Serialize(this, opts));
        }
    }

    public class TrackerState
    {
        public string ActiveDrawing { get; set; }
        public string ActiveDrawingPath { get; set; }
        public bool IsTracking { get; set; }
        public bool IsPaused { get; set; }
        public double ActiveTimeSeconds { get; set; }
        public double IdleTimeSeconds { get; set; }
        public int IdleTimeoutSeconds { get; set; }
        public List<string> RecentCommands { get; set; } = new List<string>();
        public DrawingSession CurrentSession { get; set; }
        public List<DrawingSession> Sessions { get; set; } = new List<DrawingSession>();
        public List<FolderEvent> FolderEvents { get; set; } = new List<FolderEvent>();
        public DateTime LastActivityAt { get; set; }
        public DateTime LastUpdated { get; set; }
        public long CurrentSessionTrackedMilliseconds { get; set; }
        public long CurrentSessionIdleMilliseconds { get; set; }
        public string CurrentSessionStartedAt { get; set; }
    }

    // ─── Main Plugin Class ───

    public class DrawingTracker
    {
        // --- State ---
        private static bool _initialized = false;
        private static TrackerConfig _config;
        private static string _configPath;

        // Drawing tracking
        private static DrawingSession _currentSession;
        private static List<DrawingSession> _allSessions = new List<DrawingSession>();
        private static DateTime _lastActivityTime;
        private static bool _isPaused = false;
        private static Timer _idleCheckTimer;
        private static Timer _autoExportTimer;
        private static List<string> _recentCommands = new List<string>();

        // Folder watching
        private static List<FileSystemWatcher> _watchers = new List<FileSystemWatcher>();
        private static List<FolderEvent> _folderEvents = new List<FolderEvent>();
        private static readonly object _eventLock = new object();
        private static readonly HashSet<string> _attachedDocumentKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private static readonly HashSet<string> _attachedDatabaseKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private static readonly HashSet<string> SaveCommandNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "QSAVE",
            "SAVE",
            "SAVEAS",
            "SAVEALL",
        };
        private static readonly TimeSpan SaveCommandCorrelationWindow = TimeSpan.FromSeconds(4);
        private static readonly TimeSpan SaveSignalDedupeWindow = TimeSpan.FromSeconds(2);
        private static readonly TimeSpan SyntheticSaveDelay = TimeSpan.FromSeconds(2);
        private static readonly TimeSpan DuplicateSaveCommandWindow = TimeSpan.FromSeconds(2);
        private static DateTime _lastCommandEndedAt = DateTime.MinValue;
        private static string _lastCommandEndedName = string.Empty;
        private static DateTime _lastSaveSignalAt = DateTime.MinValue;
        private static string _lastSaveSignalDocumentKey = string.Empty;
        private static DateTime _lastRecordedSaveCommandAt = DateTime.MinValue;
        private static string _lastRecordedSaveCommandName = string.Empty;
        private static string _lastRecordedSaveCommandDocumentKey = string.Empty;
        private static DateTime _pendingSyntheticSaveReadyAtUtc = DateTime.MinValue;
        private static string _pendingSyntheticSaveDocumentKey = string.Empty;
        private static string _pendingSyntheticSavePath = string.Empty;

        // JSON output
        private static string _jsonOutputPath;
        private static bool _pendingAutoloadAnnouncement = false;
        private static bool _autoloadAnnouncementHooked = false;
        private static DateTime _autoloadAnnouncementReadyAtUtc = DateTime.MinValue;
        private static readonly TimeSpan AutoloadAnnouncementDelay = TimeSpan.FromSeconds(8);
        private const string AutoloadAnnouncementMessage =
            "\n[CAD Tracker] Watchdog auto-loaded on startup. Tracking is active. Use TRACKERSTATUS for details.\n";


        // ═══════════════════════════════════════════════════
        // COMMANDS
        // ═══════════════════════════════════════════════════

        internal static bool TryAutoStart()
        {
            return new DrawingTracker().StartTrackerCore(silent: true, startReason: "autoload");
        }

        private static void TryWritePendingAutoloadAnnouncement(Editor ed = null, bool force = false)
        {
            if (!_pendingAutoloadAnnouncement)
            {
                return;
            }

            if (!force && DateTime.UtcNow < _autoloadAnnouncementReadyAtUtc)
            {
                return;
            }

            ed ??= Application.DocumentManager.MdiActiveDocument?.Editor;
            if (ed == null)
            {
                return;
            }

            try
            {
                ed.WriteMessage(AutoloadAnnouncementMessage);
                _pendingAutoloadAnnouncement = false;
                _autoloadAnnouncementReadyAtUtc = DateTime.MinValue;
                ReleaseAutoloadAnnouncementHook();
                DrawingTrackerApplication.WriteLifecycleEvent("tracker_autostart_announced");
            }
            catch (System.Exception ex)
            {
                DiagnosticTrace.TraceWarning($"Suite Watchdog tracker autostart announcement failed: {ex}");
            }
        }

        private static void QueueAutoloadAnnouncement()
        {
            _pendingAutoloadAnnouncement = true;
            _autoloadAnnouncementReadyAtUtc = DateTime.UtcNow.Add(AutoloadAnnouncementDelay);
            EnsureAutoloadAnnouncementHook();
            DrawingTrackerApplication.WriteLifecycleEvent(
                "tracker_autostart_queued",
                _autoloadAnnouncementReadyAtUtc.ToString("O")
            );
        }

        internal static void ReleaseAutoloadAnnouncementHook()
        {
            if (!_autoloadAnnouncementHooked)
            {
                return;
            }

            try
            {
                Application.Idle -= OnApplicationIdle;
            }
            catch
            {
                // Ignore Idle unhook failures during shutdown.
            }

            _autoloadAnnouncementHooked = false;
        }

        private static void EnsureAutoloadAnnouncementHook()
        {
            if (_autoloadAnnouncementHooked)
            {
                return;
            }

            Application.Idle += OnApplicationIdle;
            _autoloadAnnouncementHooked = true;
        }

        private static void OnApplicationIdle(object sender, EventArgs e)
        {
            if (!_pendingAutoloadAnnouncement)
            {
                ReleaseAutoloadAnnouncementHook();
                return;
            }

            TryWritePendingAutoloadAnnouncement();
        }

        [CommandMethod("STARTTRACKER")]
        public void StartTracker()
        {
            StartTrackerCore(silent: false, startReason: "command");
        }

        private bool StartTrackerCore(bool silent, string startReason)
        {
            var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
            if (_initialized)
            {
                if (!silent)
                    ed?.WriteMessage("\n[CAD Tracker] Already running. Use STOPTRACKER to reset.\n");
                return false;
            }

            // Config path next to the plugin DLL or in user profile
            var baseDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "CadCommandCenter"
            );
            Directory.CreateDirectory(baseDir);
            _configPath = Path.Combine(baseDir, "tracker-config.json");
            _jsonOutputPath = Path.Combine(baseDir, "tracker-state.json");
            _config = TrackerConfig.LoadOrDefault(_configPath);
            var configChanged = false;

            if (string.IsNullOrEmpty(_config.OutputJsonPath))
            {
                _config.OutputJsonPath = _jsonOutputPath;
                configChanged = true;
            }
            else
                _jsonOutputPath = _config.OutputJsonPath;

            // If no folders configured, add defaults
            if (_config.WatchedFolders.Count == 0)
            {
                _config.WatchedFolders["Active"] = @"C:\Users\" + Environment.UserName + @"\Desktop\Active";
                configChanged = true;
                if (!silent)
                {
                    ed?.WriteMessage("\n[CAD Tracker] No folders configured. Added Desktop\\Active as default.");
                    ed?.WriteMessage("\n  Use TRACKERCONFIG to set up your watched folders.\n");
                }
            }

            if (configChanged)
            {
                try
                {
                    _config.Save(_configPath);
                }
                catch (System.Exception ex)
                {
                    if (!silent)
                        ed?.WriteMessage($"\n[CAD Tracker] Could not persist tracker defaults: {ex.Message}\n");
                    DiagnosticTrace.TraceWarning($"Suite Watchdog tracker config save skipped: {ex}");
                }
            }

            // Hook into AutoCAD events
            AttachEvents();

            // Start idle checker (runs every second)
            _lastActivityTime = DateTime.Now;
            _idleCheckTimer = new Timer(1000);
            _idleCheckTimer.Elapsed += IdleCheckTick;
            _idleCheckTimer.Start();

            // Start auto-export timer
            if (_config.AutoExportEnabled)
            {
                _autoExportTimer = new Timer(_config.AutoExportIntervalSeconds * 1000);
                _autoExportTimer.Elapsed += (s, e) => ExportStateJson();
                _autoExportTimer.Start();
            }

            // Start folder watchers
            InitFolderWatchers();

            // Begin first session
            BeginSession();

            _initialized = true;
            ExportStateJson();
            DrawingTrackerApplication.WriteLifecycleEvent($"tracker_started_{startReason}");

            if (silent && string.Equals(startReason, "autoload", StringComparison.OrdinalIgnoreCase))
            {
                QueueAutoloadAnnouncement();
            }

            if (!silent)
            {
                ed?.WriteMessage($"\n[CAD Tracker] ✓ Started. Idle timeout: {_config.IdleTimeoutSeconds}s");
                ed?.WriteMessage($"\n[CAD Tracker]   Monitoring {_config.WatchedFolders.Count} folder(s)");
                ed?.WriteMessage($"\n[CAD Tracker]   State JSON: {_jsonOutputPath}\n");
            }

            return true;
        }

        [CommandMethod("STOPTRACKER")]
        public void StopTracker()
        {
            var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
            if (!_initialized) { ed?.WriteMessage("\n[CAD Tracker] Not running.\n"); return; }

            EndCurrentSession();
            DetachEvents();
            _idleCheckTimer?.Stop();
            _idleCheckTimer?.Dispose();
            _autoExportTimer?.Stop();
            _autoExportTimer?.Dispose();

            foreach (var w in _watchers) { w.EnableRaisingEvents = false; w.Dispose(); }
            _watchers.Clear();

            ExportStateJson();
            _initialized = false;
            _pendingAutoloadAnnouncement = false;
            _autoloadAnnouncementReadyAtUtc = DateTime.MinValue;
            ClearPendingSyntheticSaveSignal();
            ResetSaveSignalTracking();
            ReleaseAutoloadAnnouncementHook();
            ed?.WriteMessage("\n[CAD Tracker] ■ Stopped. Final state exported.\n");
        }

        [CommandMethod("TRACKERSTATUS")]
        public void TrackerStatus()
        {
            var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
            if (!_initialized) { ed?.WriteMessage("\n[CAD Tracker] Not running. Use STARTTRACKER.\n"); return; }

            var session = _currentSession;
            ed.WriteMessage("\n═══ CAD TRACKER STATUS ═══");
            ed.WriteMessage($"\n  Drawing:    {session?.DrawingName ?? "None"}");
            ed.WriteMessage($"\n  Active:     {!_isPaused}");
            ed.WriteMessage($"\n  Session:    {session?.ActiveTime:hh\\:mm\\:ss}");
            ed.WriteMessage($"\n  Commands:   {session?.CommandCount ?? 0}");
            ed.WriteMessage($"\n  Idle Limit: {_config.IdleTimeoutSeconds}s");
            ed.WriteMessage($"\n  Sessions:   {_allSessions.Count} completed");

            var today = _allSessions
                .Where(s => s.StartedAt.Date == DateTime.Today)
                .Sum(s => s.ActiveTime.TotalMinutes);
            if (session != null) today += session.ActiveTime.TotalMinutes;
            ed.WriteMessage($"\n  Today:      {today:F1} min total");
            ed.WriteMessage($"\n  Folders:    {_config.WatchedFolders.Count} watched");
            ed.WriteMessage($"\n  Events:     {_folderEvents.Count} file changes\n");
        }

        [CommandMethod("TRACKEREXPORT")]
        public void TrackerExport()
        {
            var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
            ExportStateJson();
            ed?.WriteMessage($"\n[CAD Tracker] Exported to: {_jsonOutputPath}\n");
        }

        [CommandMethod("TRACKERCONFIG")]
        public void TrackerConfigure()
        {
            var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
            if (ed == null) return;

            // Idle timeout
            var prTimeout = new PromptIntegerOptions("\nEnter idle timeout in seconds [120-600]");
            prTimeout.DefaultValue = _config.IdleTimeoutSeconds;
            prTimeout.LowerLimit = 60;
            prTimeout.UpperLimit = 600;
            var resTimeout = ed.GetInteger(prTimeout);
            if (resTimeout.Status == PromptStatus.OK)
                _config.IdleTimeoutSeconds = resTimeout.Value;

            // Add a folder
            var prFolder = new PromptStringOptions("\nAdd watched folder path (or press Enter to skip)");
            prFolder.AllowSpaces = true;
            var resFolder = ed.GetString(prFolder);
            if (resFolder.Status == PromptStatus.OK && !string.IsNullOrWhiteSpace(resFolder.StringResult))
            {
                var path = resFolder.StringResult.Trim();
                if (Directory.Exists(path))
                {
                    var prAlias = new PromptStringOptions($"\nAlias for '{Path.GetFileName(path)}'");
                    prAlias.DefaultValue = Path.GetFileName(path);
                    var resAlias = ed.GetString(prAlias);
                    var alias = resAlias.Status == PromptStatus.OK ? resAlias.StringResult : Path.GetFileName(path);

                    _config.WatchedFolders[alias] = path;
                    ed.WriteMessage($"\n[CAD Tracker] Added: {alias} → {path}");

                    // Hot-add watcher if running
                    if (_initialized) AddFolderWatcher(path, alias);
                }
                else
                {
                    ed.WriteMessage($"\n[CAD Tracker] Folder not found: {path}");
                }
            }

            // JSON output path
            var prJson = new PromptStringOptions("\nJSON output path (Enter to keep current)");
            prJson.AllowSpaces = true;
            prJson.DefaultValue = _config.OutputJsonPath;
            var resJson = ed.GetString(prJson);
            if (resJson.Status == PromptStatus.OK && !string.IsNullOrWhiteSpace(resJson.StringResult))
            {
                _config.OutputJsonPath = resJson.StringResult.Trim();
                _jsonOutputPath = _config.OutputJsonPath;
            }

            _config.Save(_configPath);
            ed.WriteMessage("\n[CAD Tracker] ✓ Config saved.\n");
        }


        // ═══════════════════════════════════════════════════
        // EVENT HOOKS
        // ═══════════════════════════════════════════════════

        private void AttachEvents()
        {
            var dm = Application.DocumentManager;

            // Document switching
            dm.DocumentActivated += OnDocumentActivated;
            dm.DocumentCreated += OnDocumentCreated;
            dm.DocumentToBeDestroyed += OnDocumentClosing;

            // Command activity (this is how we detect "user is working")
            if (dm.MdiActiveDocument != null)
            {
                AttachDocEvents(dm.MdiActiveDocument);
            }
        }

        private void DetachEvents()
        {
            var dm = Application.DocumentManager;
            dm.DocumentActivated -= OnDocumentActivated;
            dm.DocumentCreated -= OnDocumentCreated;
            dm.DocumentToBeDestroyed -= OnDocumentClosing;

            foreach (Document doc in dm)
            {
                try { DetachDocEvents(doc); } catch { }
            }
            _attachedDocumentKeys.Clear();
            _attachedDatabaseKeys.Clear();
        }

        private void AttachDocEvents(Document doc)
        {
            if (doc == null) return;
            var documentKey = GetDocumentSubscriptionKey(doc);
            if (!string.IsNullOrWhiteSpace(documentKey) && _attachedDocumentKeys.Contains(documentKey))
                return;
            doc.CommandEnded += OnCommandEnded;
            doc.CommandWillStart += OnCommandWillStart;
            AttachDatabaseEvents(doc);

            // Additional activity signals
            doc.Editor.PointMonitor += OnPointMonitor;
            if (!string.IsNullOrWhiteSpace(documentKey))
                _attachedDocumentKeys.Add(documentKey);
        }

        private void DetachDocEvents(Document doc)
        {
            if (doc == null) return;
            doc.CommandEnded -= OnCommandEnded;
            doc.CommandWillStart -= OnCommandWillStart;
            DetachDatabaseEvents(doc);
            try { doc.Editor.PointMonitor -= OnPointMonitor; } catch { }
            var documentKey = GetDocumentSubscriptionKey(doc);
            if (!string.IsNullOrWhiteSpace(documentKey))
                _attachedDocumentKeys.Remove(documentKey);
        }

        private void AttachDatabaseEvents(Document doc)
        {
            var database = doc?.Database;
            if (database == null) return;
            var databaseKey = GetDatabaseSubscriptionKey(database);
            if (!string.IsNullOrWhiteSpace(databaseKey) && _attachedDatabaseKeys.Contains(databaseKey))
                return;
            database.SaveComplete += OnDatabaseSaveComplete;
            if (!string.IsNullOrWhiteSpace(databaseKey))
                _attachedDatabaseKeys.Add(databaseKey);
        }

        private void DetachDatabaseEvents(Document doc)
        {
            var database = doc?.Database;
            if (database == null) return;
            try
            {
                database.SaveComplete -= OnDatabaseSaveComplete;
            }
            catch
            {
                // Ignore database event detach failures while a document is closing.
            }

            var databaseKey = GetDatabaseSubscriptionKey(database);
            if (!string.IsNullOrWhiteSpace(databaseKey))
                _attachedDatabaseKeys.Remove(databaseKey);
        }

        // ─── Document Events ───

        private void OnDocumentActivated(object sender, DocumentCollectionEventArgs e)
        {
            // Drawing swap detected!
            var newDoc = e.Document;
            if (newDoc == null) return;

            AttachDocEvents(newDoc);
            TryWritePendingAutoloadAnnouncement(newDoc.Editor);

            var newPath = newDoc.Name;
            if (_currentSession == null)
            {
                BeginSession(newDoc);
            }
            else if (!string.Equals(_currentSession.FullPath, newPath, StringComparison.OrdinalIgnoreCase))
            {
                EndCurrentSession();
                BeginSession(newDoc);
            }

            RecordActivity();
        }

        private void OnDocumentCreated(object sender, DocumentCollectionEventArgs e)
        {
            if (e.Document != null)
            {
                AttachDocEvents(e.Document);
                TryWritePendingAutoloadAnnouncement(e.Document.Editor);
                RecordActivity();
            }
        }

        private void OnDocumentClosing(object sender, DocumentCollectionEventArgs e)
        {
            if (e.Document != null)
            {
                DetachDocEvents(e.Document);
                if (_currentSession?.FullPath == e.Document.Name)
                    EndCurrentSession();
            }
        }

        // ─── Command Events (primary activity signal) ───

        private void OnCommandWillStart(object sender, CommandEventArgs e)
        {
            RecordActivity();
        }

        private void OnCommandEnded(object sender, CommandEventArgs e)
        {
            RecordActivity();

            if (_currentSession != null)
            {
                var cmd = e.GlobalCommandName.ToUpperInvariant();
                var documentKey = GetDocumentSubscriptionKey(sender as Document);
                var now = DateTime.Now;
                _lastCommandEndedName = cmd;
                _lastCommandEndedAt = now;
                if (ShouldSkipDuplicateSaveCommand(cmd, documentKey, now))
                    return;
                AppendCommandToCurrentSession(cmd);
                if (SaveCommandNames.Contains(cmd))
                {
                    _lastRecordedSaveCommandAt = now;
                    _lastRecordedSaveCommandName = cmd;
                    _lastRecordedSaveCommandDocumentKey = documentKey ?? string.Empty;
                    _lastSaveSignalAt = now;
                    _lastSaveSignalDocumentKey = documentKey ?? string.Empty;
                    ClearPendingSyntheticSaveSignal();
                    ExportStateJson();
                }
            }
        }

        private void OnDatabaseSaveComplete(object sender, DatabaseIOEventArgs e)
        {
            RecordSaveSignal(
                FindDocumentForDatabase(sender as Database),
                e?.FileName
            );
        }

        private void AppendCommandToCurrentSession(string commandName)
        {
            if (_currentSession == null || string.IsNullOrWhiteSpace(commandName))
                return;

            _currentSession.CommandCount++;

            if (_recentCommands.Count == 0 || _recentCommands[0] != commandName)
            {
                _recentCommands.Insert(0, commandName);
                if (_recentCommands.Count > 20) _recentCommands.RemoveAt(20);
            }

            if (!_currentSession.CommandsUsed.Contains(commandName))
                _currentSession.CommandsUsed.Add(commandName);
        }

        private void RecordSaveSignal(Document doc, string savedPath)
        {
            if (_currentSession == null)
                return;

            var activeDocument = Application.DocumentManager.MdiActiveDocument;
            if (doc != null && activeDocument != null && !ReferenceEquals(doc, activeDocument))
            {
                return;
            }

            var normalizedPath = string.IsNullOrWhiteSpace(savedPath)
                ? string.Empty
                : Path.GetFullPath(savedPath).Trim();
            var documentKey = GetDocumentSubscriptionKey(doc ?? activeDocument);
            var correlatedSaveCommand = ResolveCorrelatedSaveCommand();
            var now = DateTime.Now;

            if (
                !string.IsNullOrWhiteSpace(documentKey)
                && string.Equals(documentKey, _lastSaveSignalDocumentKey, StringComparison.OrdinalIgnoreCase)
                && (now - _lastSaveSignalAt) <= SaveSignalDedupeWindow
            )
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(normalizedPath))
            {
                _currentSession.FullPath = normalizedPath;
                _currentSession.DrawingName = Path.GetFileName(normalizedPath);
            }

            if (!string.IsNullOrWhiteSpace(correlatedSaveCommand))
            {
                _lastSaveSignalAt = now;
                _lastSaveSignalDocumentKey = documentKey ?? string.Empty;
                ClearPendingSyntheticSaveSignal();
                ExportStateJson();
                return;
            }

            QueueSyntheticSaveSignal(documentKey, normalizedPath);
        }

        private static string ResolveCorrelatedSaveCommand()
        {
            if (string.IsNullOrWhiteSpace(_lastCommandEndedName))
                return string.Empty;

            if (!SaveCommandNames.Contains(_lastCommandEndedName))
                return string.Empty;

            if ((DateTime.Now - _lastCommandEndedAt) > SaveCommandCorrelationWindow)
                return string.Empty;

            return _lastCommandEndedName;
        }

        private static bool ShouldSkipDuplicateSaveCommand(string commandName, string documentKey, DateTime observedAt)
        {
            if (!SaveCommandNames.Contains(commandName))
                return false;

            if (string.IsNullOrWhiteSpace(_lastRecordedSaveCommandName))
                return false;

            if (!string.Equals(commandName, _lastRecordedSaveCommandName, StringComparison.OrdinalIgnoreCase))
                return false;

            if (!string.Equals(documentKey ?? string.Empty, _lastRecordedSaveCommandDocumentKey, StringComparison.OrdinalIgnoreCase))
                return false;

            return (observedAt - _lastRecordedSaveCommandAt) <= DuplicateSaveCommandWindow;
        }

        private static void QueueSyntheticSaveSignal(string documentKey, string normalizedPath)
        {
            _pendingSyntheticSaveDocumentKey = documentKey ?? string.Empty;
            _pendingSyntheticSavePath = normalizedPath ?? string.Empty;
            _pendingSyntheticSaveReadyAtUtc = DateTime.UtcNow.Add(SyntheticSaveDelay);
        }

        private static void ClearPendingSyntheticSaveSignal()
        {
            _pendingSyntheticSaveDocumentKey = string.Empty;
            _pendingSyntheticSavePath = string.Empty;
            _pendingSyntheticSaveReadyAtUtc = DateTime.MinValue;
        }

        private static void ResetSaveSignalTracking()
        {
            _lastCommandEndedAt = DateTime.MinValue;
            _lastCommandEndedName = string.Empty;
            _lastSaveSignalAt = DateTime.MinValue;
            _lastSaveSignalDocumentKey = string.Empty;
            _lastRecordedSaveCommandAt = DateTime.MinValue;
            _lastRecordedSaveCommandName = string.Empty;
            _lastRecordedSaveCommandDocumentKey = string.Empty;
        }

        private void TryFlushPendingSyntheticSaveSignal(bool force = false)
        {
            if (_currentSession == null || string.IsNullOrWhiteSpace(_pendingSyntheticSaveDocumentKey))
                return;

            if (!force && DateTime.UtcNow < _pendingSyntheticSaveReadyAtUtc)
                return;

            if (!string.IsNullOrWhiteSpace(_pendingSyntheticSavePath))
            {
                _currentSession.FullPath = _pendingSyntheticSavePath;
                _currentSession.DrawingName = Path.GetFileName(_pendingSyntheticSavePath);
            }

            AppendCommandToCurrentSession("SAVE");
            _lastSaveSignalAt = DateTime.Now;
            _lastSaveSignalDocumentKey = _pendingSyntheticSaveDocumentKey;
            ClearPendingSyntheticSaveSignal();
            ExportStateJson();
        }

        // ─── Mouse movement = activity ───

        private void OnPointMonitor(object sender, PointMonitorEventArgs e)
        {
            // Fires on mouse movement in the drawing area.
            // We throttle by only updating if > 5 seconds since last activity record
            // to avoid excessive processing.
            if ((DateTime.Now - _lastActivityTime).TotalSeconds > 5)
            {
                RecordActivity();
            }
        }


        // ═══════════════════════════════════════════════════
        // SESSION MANAGEMENT
        // ═══════════════════════════════════════════════════

        private void RecordActivity()
        {
            TryWritePendingAutoloadAnnouncement();

            var wasPaused = _isPaused;
            _lastActivityTime = DateTime.Now;
            _isPaused = false;

            if (wasPaused && _currentSession != null)
            {
                // Resuming from idle — log it
                var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
                ed?.WriteMessage("\n[CAD Tracker] ▶ Resumed tracking.\n");
            }
        }

        private void BeginSession(Document doc = null)
        {
            doc ??= Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            _currentSession = new DrawingSession
            {
                SessionId = Guid.NewGuid().ToString("N"),
                DrawingName = Path.GetFileName(doc.Name),
                FullPath = doc.Name,
                StartedAt = DateTime.Now,
                IsActive = true,
                ActiveTime = TimeSpan.Zero,
                IdleTime = TimeSpan.Zero,
                CommandCount = 0,
                CommandsUsed = new List<string>(),
            };

            _lastActivityTime = DateTime.Now;
            _isPaused = false;
            ResetSaveSignalTracking();
        }

        private static string GetDocumentSubscriptionKey(Document doc)
        {
            if (doc == null) return string.Empty;
            try
            {
                if (doc.Database != null)
                    return $"db:{doc.Database.GetHashCode()}";
            }
            catch
            {
                // Ignore disposed document/database handles during detach.
            }
            return $"doc:{doc.GetHashCode()}";
        }

        private static string GetDatabaseSubscriptionKey(Database database)
        {
            if (database == null) return string.Empty;
            return $"db:{database.GetHashCode()}";
        }

        private static Document FindDocumentForDatabase(Database database)
        {
            if (database == null) return null;
            foreach (Document doc in Application.DocumentManager)
            {
                try
                {
                    if (ReferenceEquals(doc.Database, database))
                        return doc;
                }
                catch
                {
                    // Ignore documents that are mid-disposal.
                }
            }
            return null;
        }

        private void EndCurrentSession()
        {
            if (_currentSession == null) return;

            TryFlushPendingSyntheticSaveSignal(force: true);
            _currentSession.EndedAt = DateTime.Now;
            _currentSession.IsActive = false;
            _allSessions.Insert(0, _currentSession);

            // Keep last 100 sessions
            if (_allSessions.Count > 100)
                _allSessions.RemoveRange(100, _allSessions.Count - 100);

            _currentSession = null;
            ResetSaveSignalTracking();
        }

        private void IdleCheckTick(object sender, ElapsedEventArgs e)
        {
            if (_currentSession == null) return;

            TryFlushPendingSyntheticSaveSignal();
            var idleSec = (DateTime.Now - _lastActivityTime).TotalSeconds;

            if (idleSec < _config.IdleTimeoutSeconds)
            {
                // Still active → accumulate active time
                _currentSession.ActiveTime += TimeSpan.FromSeconds(1);
            }

            if (idleSec >= _config.IdleTimeoutSeconds)
            {
                if (!_isPaused)
                    _isPaused = true;
                _currentSession.IdleTime += TimeSpan.FromSeconds(1);
                return;
            }

            _isPaused = false;
        }


        // ═══════════════════════════════════════════════════
        // FOLDER WATCHING
        // ═══════════════════════════════════════════════════

        private void InitFolderWatchers()
        {
            foreach (var kvp in _config.WatchedFolders)
            {
                AddFolderWatcher(kvp.Value, kvp.Key);
            }
        }

        private void AddFolderWatcher(string path, string alias)
        {
            if (!Directory.Exists(path)) return;

            try
            {
                var watcher = new FileSystemWatcher(path)
                {
                    NotifyFilter = NotifyFilters.FileName
                                 | NotifyFilters.LastWrite
                                 | NotifyFilters.Size
                                 | NotifyFilters.DirectoryName,
                    IncludeSubdirectories = true,
                    EnableRaisingEvents = true,
                };

                // Wire up events
                watcher.Created += (s, e) => RecordFolderEvent("added", e.Name, path, alias);
                watcher.Changed += (s, e) => RecordFolderEvent("modified", e.Name, path, alias);
                watcher.Deleted += (s, e) => RecordFolderEvent("removed", e.Name, path, alias);
                watcher.Renamed += (s, e) =>
                {
                    RecordFolderEvent("removed", e.OldName, path, alias);
                    RecordFolderEvent("added", e.Name, path, alias);
                };

                _watchers.Add(watcher);
            }
            catch (System.Exception ex)
            {
                var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
                ed?.WriteMessage($"\n[CAD Tracker] ⚠ Could not watch {alias}: {ex.Message}\n");
            }
        }

        private void RecordFolderEvent(string type, string fileName, string folderPath, string alias)
        {
            lock (_eventLock)
            {
                _folderEvents.Insert(0, new FolderEvent
                {
                    Type = type,
                    FileName = fileName,
                    FolderPath = folderPath,
                    FolderAlias = alias,
                    Timestamp = DateTime.Now,
                });

                // Cap at 500 events
                if (_folderEvents.Count > 500)
                    _folderEvents.RemoveRange(500, _folderEvents.Count - 500);
            }
        }


        // ═══════════════════════════════════════════════════
        // JSON EXPORT (consumed by the UI dashboard)
        // ═══════════════════════════════════════════════════

        private void ExportStateJson()
        {
            try
            {
                var activeDocument = Application.DocumentManager.MdiActiveDocument;
                var activeDrawingPath = _currentSession?.FullPath ?? activeDocument?.Name;
                var activeDrawingName = _currentSession?.DrawingName
                    ?? (!string.IsNullOrWhiteSpace(activeDrawingPath)
                        ? Path.GetFileName(activeDrawingPath)
                        : "None");

                var state = new TrackerState
                {
                    ActiveDrawing = activeDrawingName,
                    ActiveDrawingPath = activeDrawingPath,
                    IsTracking = _initialized,
                    IsPaused = _isPaused,
                    ActiveTimeSeconds = _currentSession?.ActiveTime.TotalSeconds ?? 0,
                    IdleTimeSeconds = _currentSession?.IdleTime.TotalSeconds ?? 0,
                    IdleTimeoutSeconds = _config.IdleTimeoutSeconds,
                    RecentCommands = _recentCommands.Take(10).ToList(),
                    CurrentSession = _currentSession,
                    Sessions = _allSessions.Take(30).ToList(),
                    LastActivityAt = _lastActivityTime,
                    LastUpdated = DateTime.Now,
                    CurrentSessionTrackedMilliseconds = _currentSession?.TrackedMilliseconds ?? 0,
                    CurrentSessionIdleMilliseconds = _currentSession?.IdleMilliseconds ?? 0,
                    CurrentSessionStartedAt = _currentSession?.StartedAt.ToString("O"),
                };

                lock (_eventLock)
                {
                    state.FolderEvents = _folderEvents.Take(100).ToList();
                }

                var opts = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                };

                var json = JsonSerializer.Serialize(state, opts);
                File.WriteAllText(_jsonOutputPath, json);
            }
            catch (System.Exception ex)
            {
                var ed = Application.DocumentManager.MdiActiveDocument?.Editor;
                ed?.WriteMessage($"\n[CAD Tracker] Failed to export tracker state: {ex.Message}\n");
            }
        }
    }
}
