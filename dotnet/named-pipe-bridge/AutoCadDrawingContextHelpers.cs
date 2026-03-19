static partial class ConduitRouteStubHandlers
{
    private readonly record struct AutoCadDrawingContext(
        string DrawingName,
        string DrawingPath,
        bool ReadOnly,
        bool CommandStateAvailable,
        int? CommandMask,
        string ActiveLayout,
        string ActiveSpace,
        int? LayerCount,
        int? ModelSpaceCount,
        int? PaperSpaceCount
    );

    private static AutoCadDrawingContext ReadAutoCadDrawingContext(AutoCadSession session)
    {
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var drawingPath = StringOrDefault(ReadProperty(session.Document, "FullName"), "");
        var readOnly = TryReadBoolLike(ReadProperty(session.Document, "ReadOnly"), fallback: false);
        var commandStateAvailable = TryReadCommandActiveMask(session, out var commandMask);
        var activeLayoutObject = ReadProperty(session.Document, "ActiveLayout");
        var activeLayout = activeLayoutObject is null
            ? ""
            : StringOrDefault(ReadProperty(activeLayoutObject, "Name"), "");
        var activeSpace = DescribeAutoCadActiveSpace(ReadProperty(session.Document, "ActiveSpace"));
        var layerCount = ReadAutoCadCollectionCount(ReadProperty(session.Document, "Layers"));
        var modelSpaceCount = ReadAutoCadCollectionCount(session.Modelspace);
        var paperSpaceCount = ReadAutoCadCollectionCount(ReadProperty(session.Document, "PaperSpace"));

        return new AutoCadDrawingContext(
            DrawingName: drawingName,
            DrawingPath: drawingPath,
            ReadOnly: readOnly,
            CommandStateAvailable: commandStateAvailable,
            CommandMask: commandStateAvailable ? commandMask : null,
            ActiveLayout: activeLayout,
            ActiveSpace: activeSpace,
            LayerCount: layerCount,
            ModelSpaceCount: modelSpaceCount,
            PaperSpaceCount: paperSpaceCount
        );
    }

    private static int? ReadAutoCadCollectionCount(object? collection)
    {
        if (collection is null)
        {
            return null;
        }

        try
        {
            return ReadCount(collection);
        }
        catch (Exception ex)
        {
            BridgeLog.Warn(
                $"Could not read AutoCAD collection count. {ex.GetType().Name}: {ex.Message}"
            );
            return null;
        }
    }

    private static string DescribeAutoCadActiveSpace(object? value)
    {
        var numeric = SafeInt(value);
        if (numeric == 0)
        {
            return "model";
        }

        if (numeric == 1)
        {
            return "paper";
        }

        return string.IsNullOrWhiteSpace(StringOrDefault(value, ""))
            ? ""
            : StringOrDefault(value, "");
    }
}
