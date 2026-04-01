using System;
using System.IO;
using System.Text.Json;

namespace SuiteCadAuthoring
{
    internal sealed class SuiteCadTrackerOperationState
    {
        public bool IsCreating { get; set; }

        public string OperationType { get; set; } = string.Empty;

        public string RequestId { get; set; } = string.Empty;

        public string TargetPath { get; set; } = string.Empty;

        public string StartedAt { get; set; } = string.Empty;
    }

    internal static class SuiteCadTrackerOperationStateStore
    {
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
        };

        internal static string ResolveStatePath()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            return Path.Combine(appData, "CadCommandCenter", "tracker-operation-state.json");
        }

        internal static void SetCreating(
            string requestId,
            string targetPath,
            string operationType = "acade_project_create"
        )
        {
            WriteState(
                new SuiteCadTrackerOperationState
                {
                    IsCreating = true,
                    OperationType = operationType ?? string.Empty,
                    RequestId = requestId ?? string.Empty,
                    TargetPath = targetPath ?? string.Empty,
                    StartedAt = DateTimeOffset.UtcNow.ToString("O"),
                }
            );
        }

        internal static void ClearCreating()
        {
            WriteState(new SuiteCadTrackerOperationState());
        }

        internal static bool TryReadState(out SuiteCadTrackerOperationState state)
        {
            state = new SuiteCadTrackerOperationState();
            var path = ResolveStatePath();
            if (!File.Exists(path))
            {
                return false;
            }

            try
            {
                var parsed = JsonSerializer.Deserialize<SuiteCadTrackerOperationState>(
                    File.ReadAllText(path),
                    JsonOptions
                );
                if (parsed == null)
                {
                    return false;
                }

                state = parsed;
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static void WriteState(SuiteCadTrackerOperationState state)
        {
            var path = ResolveStatePath();
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.WriteAllText(path, JsonSerializer.Serialize(state, JsonOptions));
        }
    }
}
