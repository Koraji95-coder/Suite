.net help
You've got a solid foundation — the Flask proxy pattern with local fallback is clean, and the service layer is well-structured. Here's how I'd think about expanding this with deeper AutoCAD .NET connectivity:
Drawing State Sync
Right now your pipeline is one-directional: markups in, actions out. The biggest unlock is querying the live drawing state from AutoCAD so your plan step can make smarter decisions. Add endpoints like:

GET /api/autodraft/drawing/entities?bounds=... — return entities within a spatial region so your context resolution (pipeline step 3) can bind markups to actual geometry rather than inferring from the PDF alone
GET /api/autodraft/drawing/layers — layer list with visibility/lock state, so you can target the correct layer for ADD actions and skip locked layers
GET /api/autodraft/drawing/blocks — block definitions in the drawing, which closes the gap on your BLOCK_REF rule that currently just says "map to block library" but has no library to map against

On the service side that'd look something like:
typescriptasync getDrawingEntities(bounds?: {
  x: number; y: number; width: number; height: number;
}): Promise<CadEntity[]> {
  const params = bounds
    ? `?x=${bounds.x}&y=${bounds.y}&w=${bounds.width}&h=${bounds.height}`
    : "";
  return this.requestJson<CadEntity[]>(
    `/api/autodraft/drawing/entities${params}`,
    { method: "GET" },
  );
}

async getLayers(): Promise<CadLayer[]> {
  return this.requestJson<CadLayer[]>(
    "/api/autodraft/drawing/layers",
    { method: "GET" },
  );
}

async getBlockDefinitions(): Promise<BlockDef[]> {
  return this.requestJson<BlockDef[]>(
    "/api/autodraft/drawing/blocks",
    { method: "GET" },
  );
}
This transforms context resolution from purely spatial heuristics to something that actually knows what's in the drawing.
Transactional Execution with Preview
Your current /execute endpoint is fire-and-forget. Two things would make it much safer:
Preview entities — before committing, have the .NET side create temporary highlight entities in AutoCAD (different color, on a scratch layer) so the drafter can visually confirm. Add a /api/autodraft/preview endpoint that writes temp geometry and returns a preview ID, then /api/autodraft/preview/{id}/commit or /preview/{id}/discard.
Transaction grouping — wrap the entire batch in an AutoCAD transaction group so the drafter can undo the whole set with a single Ctrl+Z rather than unwinding individual operations. Your execute payload should include a transaction_label that gets passed to Document.TransactionManager on the .NET side.
In the service layer:
typescriptasync preview(
  plan: AutoDraftPlanResponse,
): Promise<{ previewId: string; tempLayerName: string }> {
  return this.requestJson("/api/autodraft/preview", {
    method: "POST",
    body: JSON.stringify({ actions: plan.actions }),
  });
}

async commitPreview(previewId: string): Promise<ExecuteResult> {
  return this.requestJson(`/api/autodraft/preview/${previewId}/commit`, {
    method: "POST",
  });
}

async discardPreview(previewId: string): Promise<void> {
  await this.requestJson(`/api/autodraft/preview/${previewId}/discard`, {
    method: "DELETE",
  });
}
Dimension Verification
Your DIMENSION rule extracts values from the PDF but never cross-checks them. With .NET access you can query actual distances between entities using Geometry3d measurements and flag mismatches. This is valuable for QA — the markup says "24 inches" but the model geometry is actually 23.5". Add a verification step between plan and execute:
typescriptasync verifyDimensions(
  actions: AutoDraftAction[],
): Promise<DimensionVerification[]> {
  const dimActions = actions.filter(a => a.category === "DIMENSION");
  return this.requestJson("/api/autodraft/verify-dimensions", {
    method: "POST",
    body: JSON.stringify({ dimensions: dimActions }),
  });
}
Revision Delta Comparison
Your REVISION_CLOUD rule (has_delta: true) references comparing against a prior sheet, but there's no mechanism for it. With .NET connectivity you can diff the current drawing against a baseline .dwg — AutoCAD's Database API lets you open a side database read-only and compare entity sets. Add:
typescriptasync compareRevision(
  sheetId: string,
  baselinePath: string,
): Promise<RevisionDelta> {
  return this.requestJson("/api/autodraft/revision/compare", {
    method: "POST",
    body: JSON.stringify({ sheetId, baselinePath }),
  });
}
This feeds back into the pipeline so revision clouds actually trigger meaningful diff output rather than just flagging an area.
Practical Prioritization
If I were sequencing this, I'd go:

Drawing state sync (layers + entities) — highest leverage, makes your existing plan step dramatically better with minimal frontend changes
Preview/commit workflow — safety net that builds trust with drafters who won't adopt a tool that makes irreversible changes
Dimension verification — low-effort, high-value QA catch
Revision comparison — most complex, save for when the core loop is solid

The key insight is that your current architecture treats the .NET side as a dumb executor. The expansion is about making it a queryable data source so the TypeScript pipeline can make context-aware decisions before anything gets written. The Flask proxy layer stays thin — it's just routing and fallback logic — while the intelligence stays in your TypeScript pipeline and the .NET side handles CAD-native operations.

A few more directions that go beyond the .NET query/execute loop:
Real-Time Feedback Channel
Right now your service is request/response. Long-running executions (batch plans with dozens of actions) leave the frontend blind. Stand up a WebSocket or SSE connection from the Flask layer that relays progress from the .NET side:
typescriptstreamExecution(
  planId: string,
  onProgress: (event: ExecutionEvent) => void,
): () => void {
  const source = new EventSource(
    `${this.baseUrl}/api/autodraft/execute/${planId}/stream`
  );
  source.onmessage = (e) => {
    onProgress(JSON.parse(e.data) as ExecutionEvent);
  };
  return () => source.close();
}
Where ExecutionEvent carries things like { actionId: "action-3", status: "completed", entityHandle: "1A4F" } or { actionId: "action-5", status: "failed", error: "Layer is locked" }. This lets you update each action row in the UI live rather than waiting for the whole batch to finish, and more importantly it gives the drafter a chance to abort mid-batch if something looks wrong.
Rule CRUD and Project-Specific Overrides
Your backend only serves DEFAULT_RULES as a static list. There's no way for a drafter or project lead to customize rules without redeploying. Add full CRUD:
typescriptasync createRule(rule: Omit<AutoDraftRule, "id">): Promise<AutoDraftRule> {
  return this.requestJson("/api/autodraft/rules", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

async updateRule(id: string, patch: Partial<AutoDraftRule>): Promise<AutoDraftRule> {
  return this.requestJson(`/api/autodraft/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async deleteRule(id: string): Promise<void> {
  await this.requestJson(`/api/autodraft/rules/${id}`, {
    method: "DELETE",
  });
}
More importantly, scope rules to projects. A power plant project uses different markup conventions than a commercial building. Store rules with a project_id and let the frontend switch context. Your rule engine's confidence thresholds should also be tunable per project — one team might accept 0.75 confidence for SWAP actions, another might require 0.90.
Correction Capture and Feedback Loop
Your training phases mention "capture user corrections and replay as labeled data" but there's no mechanism for it. When a drafter overrides a classification (changes a proposed DELETE to a NOTE, or reclassifies an UNCLASSIFIED markup), capture that as a training signal:
typescriptasync submitCorrection(correction: {
  actionId: string;
  originalCategory: string;
  correctedCategory: string;
  correctedAction: string;
  markup: MarkupInput;
}): Promise<void> {
  await this.requestJson("/api/autodraft/corrections", {
    method: "POST",
    body: JSON.stringify(correction),
  });
}
On the backend, accumulate these into a corrections table. Once you have enough, you can analyze which rules are underperforming (low precision), which markup patterns have no rule coverage, and whether confidence thresholds need adjustment. This closes the loop your Phase 4 training describes but doesn't implement.
Xref and Sheet Set Awareness
Real drawings don't exist in isolation. A single markup on an electrical one-line might reference geometry that lives in an xref'd structural drawing. With .NET access you can enumerate XrefGraph entries and resolve cross-references:
typescriptasync getXrefTree(drawingPath: string): Promise<XrefNode[]> {
  return this.requestJson("/api/autodraft/drawing/xrefs", {
    method: "GET",
  });
}
Similarly, batch processing across a sheet set is essential for production use. Your current pipeline processes one sheet at a time, but a revision package might have 40 marked-up sheets. Add a job queue concept:
typescriptasync submitBatch(sheets: SheetInput[]): Promise<{ jobId: string }> {
  return this.requestJson("/api/autodraft/batch", {
    method: "POST",
    body: JSON.stringify({ sheets }),
  });
}

async getBatchStatus(jobId: string): Promise<BatchStatus> {
  return this.requestJson(`/api/autodraft/batch/${jobId}`, {
    method: "GET",
  });
}
This pairs well with the SSE streaming — the frontend shows a batch dashboard with per-sheet progress.
Geometry Engine Gaps
Your pdfToCadGeometry.ts handles arcs and line extension, which is a great start, but a few things will bite you with real Bluebeam PDFs:
Polyline reconstruction — your traceConnectedPaths builds chains of segments, but doesn't emit them as polylines. The .NET side would benefit from receiving a single lightweight polyline entity rather than 30 individual line segments. Add a post-processing step that emits { type: "polyline", vertices: Point[], closed: boolean } when a traced path meets continuity criteria.
Hatch and fill regions — Bluebeam markup clouds often contain filled regions (solid hatches, crosshatches). Your PDF parser splits content streams but doesn't extract fill paths. These are important because they distinguish between "outline annotation" and "area fill" — the latter often indicates demolition zones in construction drawings.
Text extraction with spatial binding — your NOTE rule matches blue text, but your geometry engine doesn't extract text entities with bounding boxes. For the .NET side to place notes correctly, you need text position, rotation, height, and content. The PDF content stream has BT/ET operators with Tm matrices that give you this.
Audit Trail
Every action that modifies a drawing should be logged with enough detail to reconstruct what happened. This matters for liability in engineering contexts — if a drafter runs AutoDraft and a dimension gets deleted by mistake, there needs to be a record:
typescriptasync getAuditLog(filters?: {
  drawingId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AuditEntry[]> {
  const params = new URLSearchParams(
    Object.entries(filters ?? {}).filter(([, v]) => v != null) as string[][],
  );
  return this.requestJson(
    `/api/autodraft/audit?${params.toString()}`,
    { method: "GET" },
  );
}
Each entry stores the full action payload, the before/after entity state (entity handles, layer, coordinates), who approved it, and a timestamp. This also feeds into your correction pipeline — if someone undoes an AutoDraft action in AutoCAD, you can detect that through drawing event hooks on the .NET side and auto-generate a correction record.
Where This Leaves Your Architecture
The Flask layer stays as a thin proxy with local fallback, but it grows a persistence layer (rules storage, corrections table, audit log, batch job queue). The .NET side evolves from "execute these commands" to a bidirectional integration that both queries and mutates drawing state, reports progress, and captures events. And the TypeScript frontend becomes the orchestration brain — it knows the rules, understands the geometry, resolves context, and presents everything for human approval before anything irreversible happens.
The pattern that ties all of this together: every automated action should be reversible, auditable, and improvable from user feedback.

In-Process Plugin vs Out-of-Process COM
In-process means your .NET code runs as a plugin loaded directly into AutoCAD's process via NETLOAD or an autoloader bundle. You get full access to the managed API — Document, Database, Editor, TransactionManager — all of it. This is fast and reliable, but it means your code lives inside AutoCAD and can crash it.
Out-of-process means your web API (the thing Flask proxies to) runs separately and talks to AutoCAD through COM automation or a message broker. This is more resilient but slower and more limited.
For live wiring from your app, you almost certainly want a hybrid: a thin in-process plugin that acts as a local agent inside AutoCAD, and your .NET web API communicates with that agent over a local channel (named pipes, localhost HTTP, or a message queue).
The In-Process Agent
This is a minimal AutoCAD plugin that registers commands and exposes a local HTTP listener:
csharpusing Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using System.Net;
using System.Text.Json;

[assembly: ExtensionApplication(typeof(AutoDraftAgent.AgentApp))]

namespace AutoDraftAgent
{
    public class AgentApp : IExtensionApplication
    {
        private HttpListener _listener;
        private CancellationTokenSource _cts;

        public void Initialize()
        {
            _cts = new CancellationTokenSource();
            _listener = new HttpListener();
            _listener.Prefixes.Add("http://localhost:48320/");
            _listener.Start();

            // Run on a background thread — AutoCAD's main
            // thread is reserved for document operations
            Task.Run(() => ListenLoop(_cts.Token));

            Application.DocumentManager.MdiActiveDocument?
                .Editor.WriteMessage("\nAutoDraft agent listening on :48320\n");
        }

        public void Terminate()
        {
            _cts?.Cancel();
            _listener?.Stop();
        }

        private async Task ListenLoop(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    var ctx = await _listener.GetContextAsync();
                    // All document operations MUST marshal back
                    // to AutoCAD's main thread
                    _ = Task.Run(() => RouteRequest(ctx));
                }
                catch (ObjectDisposedException) { break; }
            }
        }

        private void RouteRequest(HttpListenerContext ctx)
        {
            var path = ctx.Request.Url?.AbsolutePath ?? "";
            try
            {
                object result = path switch
                {
                    "/health" => new { ok = true, drawing = GetActiveDrawingName() },
                    "/entities" => HandleGetEntities(ctx),
                    "/layers" => HandleGetLayers(),
                    "/execute" => HandleExecute(ctx),
                    "/preview" => HandlePreview(ctx),
                    _ => throw new InvalidOperationException($"Unknown route: {path}")
                };
                Respond(ctx, 200, result);
            }
            catch (Exception ex)
            {
                Respond(ctx, 500, new { error = ex.Message });
            }
        }

        private void Respond(HttpListenerContext ctx, int status, object body)
        {
            var json = JsonSerializer.SerializeToUtf8Bytes(body);
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json";
            ctx.Response.OutputStream.Write(json);
            ctx.Response.Close();
        }

        private string GetActiveDrawingName()
        {
            return Application.DocumentManager
                .MdiActiveDocument?.Name ?? "(none)";
        }
    }
}
The critical thing is the threading model. AutoCAD's document database is not thread-safe. Any operation that reads or writes entities must execute on the document's context. Here's the pattern:
Marshaling to the Document Thread
csharpprivate T RunOnDocumentThread<T>(Func<Document, T> action)
{
    var doc = Application.DocumentManager.MdiActiveDocument;
    if (doc == null)
        throw new InvalidOperationException("No active document.");

    T result = default;

    // Invoke forces execution onto AutoCAD's main message loop
    Application.MainWindow.Invoke(new Action(() =>
    {
        using (doc.LockDocument())
        {
            result = action(doc);
        }
    }));

    return result;
}
Every handler that touches the drawing goes through this. Without it you'll get access violations or silent corruption.
Reading Entities in a Spatial Region
This is what your frontend's context resolution step needs — get all entities within a bounding area so markups can be matched to actual geometry:
csharpprivate object HandleGetEntities(HttpListenerContext ctx)
{
    // Parse optional bounds from query string
    var query = ctx.Request.QueryString;
    double? x = ParseDouble(query["x"]);
    double? y = ParseDouble(query["y"]);
    double? w = ParseDouble(query["w"]);
    double? h = ParseDouble(query["h"]);

    return RunOnDocumentThread(doc =>
    {
        var entities = new List<object>();

        using (var tr = doc.Database.TransactionManager.StartTransaction())
        {
            var bt = (BlockTable)tr.GetObject(
                doc.Database.BlockTableId, OpenMode.ForRead);
            var btr = (BlockTableRecord)tr.GetObject(
                bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

            foreach (ObjectId id in btr)
            {
                var ent = (Entity)tr.GetObject(id, OpenMode.ForRead);

                // Spatial filter: skip entities outside bounds
                if (x.HasValue && w.HasValue)
                {
                    var ext = ent.GeometricExtents;
                    var minPt = ext.MinPoint;
                    var maxPt = ext.MaxPoint;

                    if (maxPt.X < x.Value || minPt.X > x.Value + w.Value ||
                        maxPt.Y < y.Value || minPt.Y > y.Value + h.Value)
                        continue;
                }

                entities.Add(SerializeEntity(ent, tr));
            }

            tr.Commit();
        }

        return new { count = entities.Count, entities };
    });
}

private object SerializeEntity(Entity ent, Transaction tr)
{
    var baseInfo = new Dictionary<string, object>
    {
        ["handle"] = ent.Handle.ToString(),
        ["type"] = ent.GetRXClass().DxfName,
        ["layer"] = ent.Layer,
        ["color"] = ent.Color.ColorIndex,
        ["visible"] = ent.Visible,
    };

    // Add geometry-specific properties
    switch (ent)
    {
        case Line line:
            baseInfo["startPoint"] = PointToDict(line.StartPoint);
            baseInfo["endPoint"] = PointToDict(line.EndPoint);
            break;

        case Circle circle:
            baseInfo["center"] = PointToDict(circle.Center);
            baseInfo["radius"] = circle.Radius;
            break;

        case Arc arc:
            baseInfo["center"] = PointToDict(arc.Center);
            baseInfo["radius"] = arc.Radius;
            baseInfo["startAngle"] = arc.StartAngle * (180 / Math.PI);
            baseInfo["endAngle"] = arc.EndAngle * (180 / Math.PI);
            break;

        case Polyline pl:
            var verts = new List<object>();
            for (int i = 0; i < pl.NumberOfVertices; i++)
            {
                verts.Add(new
                {
                    x = pl.GetPoint2dAt(i).X,
                    y = pl.GetPoint2dAt(i).Y,
                    bulge = pl.GetBulgeAt(i),
                });
            }
            baseInfo["vertices"] = verts;
            baseInfo["closed"] = pl.Closed;
            break;

        case BlockReference blkRef:
            baseInfo["blockName"] = blkRef.Name;
            baseInfo["position"] = PointToDict(blkRef.Position);
            baseInfo["rotation"] = blkRef.Rotation * (180 / Math.PI);
            baseInfo["scale"] = blkRef.ScaleFactors.X;
            break;

        case DBText text:
            baseInfo["textString"] = text.TextString;
            baseInfo["position"] = PointToDict(text.Position);
            baseInfo["height"] = text.Height;
            baseInfo["rotation"] = text.Rotation * (180 / Math.PI);
            break;

        case MText mtext:
            baseInfo["contents"] = mtext.Contents;
            baseInfo["location"] = PointToDict(mtext.Location);
            baseInfo["textHeight"] = mtext.TextHeight;
            break;
    }

    return baseInfo;
}

private Dictionary<string, double> PointToDict(Point3d pt)
    => new() { ["x"] = pt.X, ["y"] = pt.Y, ["z"] = pt.Z };
Executing Actions Transactionally
This is where your planned actions (DELETE, ADD, SWAP) actually modify the drawing. The key is wrapping everything in a single transaction with a named undo marker:
csharpprivate object HandleExecute(HttpListenerContext ctx)
{
    var body = ReadJsonBody<ExecuteRequest>(ctx);

    return RunOnDocumentThread(doc =>
    {
        int succeeded = 0;
        int failed = 0;
        var errors = new List<object>();

        using (var tr = doc.Database.TransactionManager.StartTransaction())
        {
            // Named undo group so Ctrl+Z reverts the whole batch
            doc.Database.TransactionManager
                .QueueForGraphicsFlush();

            var bt = (BlockTable)tr.GetObject(
                doc.Database.BlockTableId, OpenMode.ForRead);
            var btr = (BlockTableRecord)tr.GetObject(
                bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

            foreach (var action in body.Actions)
            {
                try
                {
                    switch (action.Category.ToUpperInvariant())
                    {
                        case "DELETE":
                            ExecuteDelete(action, tr, btr);
                            break;
                        case "ADD":
                            ExecuteAdd(action, tr, btr, doc.Database);
                            break;
                        case "SWAP":
                            ExecuteSwap(action, tr);
                            break;
                        case "NOTE":
                            // Notes don't modify geometry,
                            // but we can place an MLeader
                            ExecuteNote(action, tr, btr, doc.Database);
                            break;
                    }
                    succeeded++;
                }
                catch (Exception ex)
                {
                    failed++;
                    errors.Add(new
                    {
                        actionId = action.Id,
                        error = ex.Message
                    });
                }
            }

            tr.Commit();
        }

        // Force a regen so the drafter sees changes immediately
        doc.Editor.Regen();

        return new { succeeded, failed, errors };
    });
}

private void ExecuteDelete(ActionPayload action, Transaction tr,
    BlockTableRecord btr)
{
    // action.TargetHandles contains entity handles identified
    // during context resolution
    foreach (var handleStr in action.TargetHandles)
    {
        var handle = new Handle(long.Parse(handleStr, 
            System.Globalization.NumberStyles.HexNumber));
        if (btr.Database.TryGetObjectId(handle, out ObjectId id))
        {
            var ent = (Entity)tr.GetObject(id, OpenMode.ForWrite);
            ent.Erase();
        }
    }
}

private void ExecuteAdd(ActionPayload action, Transaction tr,
    BlockTableRecord btr, Database db)
{
    // action.Geometry contains the new entities from your
    // pdfToCadGeometry translation
    foreach (var geom in action.Geometry)
    {
        Entity newEnt = geom.Type switch
        {
            "line" => new Line(
                new Point3d(geom.Start.X, geom.Start.Y, 0),
                new Point3d(geom.End.X, geom.End.Y, 0)),

            "arc" => new Arc(
                new Point3d(geom.Center.X, geom.Center.Y, 0),
                Vector3d.ZAxis,
                geom.Radius,
                geom.StartAngle * (Math.PI / 180),
                geom.EndAngle * (Math.PI / 180)),

            "polyline" => BuildPolyline(geom),

            _ => throw new NotSupportedException(
                $"Geometry type '{geom.Type}' not supported")
        };

        newEnt.Layer = action.TargetLayer ?? "0";
        btr.AppendEntity(newEnt);
        tr.AddNewlyCreatedDBObject(newEnt, true);
    }
}

private void ExecuteSwap(ActionPayload action, Transaction tr)
{
    if (action.TargetHandles.Count != 2)
        throw new ArgumentException("SWAP requires exactly two handles.");

    // Read both entities' positions
    var entA = GetEntityByHandle(action.TargetHandles[0], tr);
    var entB = GetEntityByHandle(action.TargetHandles[1], tr);

    var posA = GetInsertionPoint(entA);
    var posB = GetInsertionPoint(entB);

    // Transform each to the other's position
    var displacement = posB - posA;
    entA.TransformBy(Matrix3d.Displacement(displacement));
    entB.TransformBy(Matrix3d.Displacement(-displacement));
}
Preview with Temporary Entities
For the preview workflow — show what would change before committing:
csharpprivate object HandlePreview(HttpListenerContext ctx)
{
    var body = ReadJsonBody<ExecuteRequest>(ctx);
    var previewLayerName = $"AUTODRAFT_PREVIEW_{Guid.NewGuid():N}";

    return RunOnDocumentThread(doc =>
    {
        using (var tr = doc.Database.TransactionManager.StartTransaction())
        {
            // Create a temporary layer with distinct color
            var lt = (LayerTable)tr.GetObject(
                doc.Database.LayerTableId, OpenMode.ForWrite);
            var layer = new LayerTableRecord
            {
                Name = previewLayerName,
                Color = Autodesk.AutoCAD.Colors.Color.FromRgb(255, 165, 0),
                IsPlottable = false // won't show up in prints
            };
            lt.Add(layer);
            tr.AddNewlyCreatedDBObject(layer, true);

            var bt = (BlockTable)tr.GetObject(
                doc.Database.BlockTableId, OpenMode.ForRead);
            var btr = (BlockTableRecord)tr.GetObject(
                bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

            // For DELETE actions, draw a red X over the target
            // For ADD actions, draw new geometry on the preview layer
            foreach (var action in body.Actions)
            {
                switch (action.Category.ToUpperInvariant())
                {
                    case "DELETE":
                        HighlightForDeletion(action, tr, btr, 
                            previewLayerName);
                        break;
                    case "ADD":
                        // Same as ExecuteAdd but on preview layer
                        foreach (var geom in action.Geometry)
                        {
                            var ent = CreateEntity(geom);
                            ent.Layer = previewLayerName;
                            ent.Linetype = "DASHED";
                            btr.AppendEntity(ent);
                            tr.AddNewlyCreatedDBObject(ent, true);
                        }
                        break;
                }
            }

            tr.Commit();
        }

        doc.Editor.Regen();

        // Store the preview layer name so commit/discard
        // can find it later
        _activePreviews[previewLayerName] = body;

        return new
        {
            previewId = previewLayerName,
            tempLayerName = previewLayerName,
            message = "Preview entities placed. Commit or discard."
        };
    });
}
Discard just erases everything on that layer and removes the layer. Commit replays the actions for real and then cleans up the preview layer.
Event Hooks for Live Feedback
This is what makes it feel "live." AutoCAD fires events you can subscribe to and relay back through your agent's listener:
csharppublic void Initialize()
{
    // ... existing listener setup ...

    var docMgr = Application.DocumentManager;

    docMgr.DocumentActivated += (s, e) =>
        BroadcastEvent("document.activated", new { name = e.Document.Name });

    docMgr.MdiActiveDocument.Database.ObjectAppended += (s, e) =>
        BroadcastEvent("entity.added", new { handle = e.DBObject.Handle.ToString() });

    docMgr.MdiActiveDocument.Database.ObjectErased += (s, e) =>
        BroadcastEvent("entity.erased", new { handle = e.DBObject.Handle.ToString() });

    docMgr.MdiActiveDocument.Database.ObjectModified += (s, e) =>
        BroadcastEvent("entity.modified", new { handle = e.DBObject.Handle.ToString() });

    // Detect manual undos — if a drafter undoes an AutoDraft
    // action, capture it as a correction signal
    docMgr.MdiActiveDocument.CommandEnded += (s, e) =>
    {
        if (e.GlobalCommandName == "U" || e.GlobalCommandName == "UNDO")
            BroadcastEvent("command.undo", new { command = e.GlobalCommandName });
    };
}
BroadcastEvent pushes to an SSE stream or a WebSocket that your Flask layer keeps open, which then relays to the TypeScript frontend. This closes the loop — the drafter makes a manual change in AutoCAD, your app sees it in real time, and the UI updates to reflect the current drawing state.
How It All Connects
The data flow becomes:
Your TypeScript frontend calls the Flask API. Flask proxies to the .NET web API. The .NET web API calls into the in-process AutoCAD agent over localhost. The agent marshals onto AutoCAD's document thread, performs the operation, and returns results. Meanwhile, the agent's event hooks push changes back through the SSE channel so the frontend stays synchronized.
The in-process agent is intentionally thin — it's a bridge, not a brain. All the intelligence (rule matching, context resolution, confidence scoring) stays in your TypeScript pipeline. The agent just reads and writes entities on command and reports what changed. That separation keeps AutoCAD stable and lets you iterate on the planning logic without touching the plugin. 