possible ideas : 

Core Architecture Shift
Right now your data flow is: Supabase metadata → React UI. You'd want to move to: DWG files on disk → .NET AutoCAD backend extracts real data → API serves it → React renders it.
1. A .NET backend service that wraps the AutoCAD API
This is the biggest unlock. You'd build an ASP.NET service (or AutoCAD plugin running in-process) that does the heavy lifting:
csharp// Extract block definitions + their attribute definitions from a DWG
public class BlockExtractor
{
    public List<BlockInfo> ExtractBlocks(string dwgPath)
    {
        using var db = new Database(false, true);
        db.ReadDwgFile(dwgPath, FileOpenMode.OpenForReadAndAllShare, true, null);
        
        using var tr = db.TransactionManager.StartTransaction();
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        
        var results = new List<BlockInfo>();
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsLayout || btr.IsAnonymous) continue;
            
            var attrs = new List<AttributeInfo>();
            foreach (ObjectId entId in btr)
            {
                var ent = tr.GetObject(entId, OpenMode.ForRead);
                if (ent is AttributeDefinition attDef)
                {
                    attrs.Add(new AttributeInfo
                    {
                        Tag = attDef.Tag,
                        Prompt = attDef.Prompt,
                        DefaultValue = attDef.TextString,
                        IsConstant = attDef.Constant,
                        IsInvisible = attDef.Invisible
                    });
                }
            }
            
            results.Add(new BlockInfo
            {
                Name = btr.Name,
                Is3D = HasZGeometry(btr, tr),
                IsDynamic = btr.IsDynamicBlock,
                AttributeDefinitions = attrs,
                EntityCount = btr.Cast<ObjectId>().Count(),
                Bounds = ComputeBounds(btr, tr)
            });
        }
        tr.Commit();
        return results;
    }
}
This replaces your fake buildUploadPayload with real extracted metadata — actual file sizes, real attribute definitions, real dynamic block detection.
2. Attribute table as a first-class feature
Your BlockLibraryDetailsDialog currently shows name/size/tags. The most valuable addition is a table of block attributes, since that's what engineers actually need to inspect. Your model would expand:
typescriptinterface BlockAttribute {
    tag: string;
    prompt: string;
    defaultValue: string;
    isConstant: boolean;
    isInvisible: boolean;
}

interface BlockInsertInstance {
    insertionPoint: [number, number, number];
    rotation: number;
    scale: [number, number, number];
    attributeValues: Record<string, string>; // tag → actual value
    layerName: string;
}
Then in the details dialog you'd render two tables — one for attribute definitions on the block itself, and one for instances in the drawing showing actual filled-in values. This is far more useful than the current thumbnail + tags view.
3. 3D viewer integration
For the React side, you have a few realistic options:

Three.js — Your .NET backend converts DWG geometry to a lightweight mesh format (glTF or a custom JSON with vertices/edges). The backend does the heavy conversion; the frontend just renders. This is the most practical approach since you already have a React app.
Autodesk Platform Services (formerly Forge) — If you want a production-grade viewer without building your own renderer. Handles DWG natively but requires cloud connectivity and licensing.
Export to IFC/STEP on the backend — Then use an open-source viewer like xeokit or IFC.js on the frontend.

The .NET geometry extraction would look roughly like:
csharppublic MeshData ExtractGeometry(BlockTableRecord btr, Transaction tr)
{
    var mesh = new MeshData();
    foreach (ObjectId entId in btr)
    {
        var ent = (Entity)tr.GetObject(entId, OpenMode.ForRead);
        switch (ent)
        {
            case Solid3d solid:
                var brep = new Brep(solid);
                TessellateBrepToMesh(brep, mesh);
                break;
            case Line line:
                mesh.AddEdge(line.StartPoint, line.EndPoint, line.Layer);
                break;
            case Polyline pl:
                for (int i = 0; i < pl.NumberOfVertices - 1; i++)
                    mesh.AddEdge(pl.GetPoint3dAt(i), pl.GetPoint3dAt(i + 1), pl.Layer);
                break;
            // arcs, circles, regions, etc.
        }
    }
    return mesh;
}
4. Folder-watching instead of manual upload
Your current flow requires manual upload via the dialog. For a tool meant to browse a blocks folder, you'd want:
csharpvar watcher = new FileSystemWatcher(blocksDirectory, "*.dwg");
watcher.Created += (s, e) => IndexNewBlock(e.FullPath);
watcher.Changed += (s, e) => ReindexBlock(e.FullPath);
watcher.Deleted += (s, e) => RemoveBlockIndex(e.Name);
The .NET service watches the folder, auto-extracts metadata and generates thumbnails (by rendering a viewport to a bitmap via AutoCAD's API), and pushes updates to Supabase or a local DB. The upload dialog becomes an "import from external source" rather than the primary ingestion path.
5. Concrete changes to your existing React code
Given all the above, here's what changes in the frontend:

blockLibraryModels.ts — Expand BlockFile to include attributes: BlockAttribute[], instances: BlockInsertInstance[], geometry_url: string (pointing to the exported mesh), and has_3d_geometry: boolean. Drop the fake buildUploadPayload.
BlockLibraryCatalog.tsx — Add a small badge/icon indicating whether a block has 3D content. The thumbnail can become a real server-rendered preview instead of a placeholder.
BlockLibraryDetailsDialog.tsx — This is where most of the new value lives. Add a tab or section layout: Preview (with the Three.js viewer for 3D, or 2D canvas for flat blocks), Attributes (sortable table of definitions and instance values), and Instances (where this block is used, with insertion points).
useBlockLibraryState.ts — The loadBlocks call would hit your .NET API instead of (or in addition to) Supabase. You'd add state for the active viewer mode, attribute sorting, and instance selection.

The biggest bang-for-buck improvement is the attribute table backed by real extraction — that's likely what your users open the library for most. The 3D viewer is impressive but secondary to being able to quickly answer "what attributes does this block have and what values are populated across the drawing."