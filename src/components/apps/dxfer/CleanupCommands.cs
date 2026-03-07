using System;
using System.Diagnostics;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using EtapDxfCleanup.Core;
using EtapDxfCleanup.Models;

// This attribute tells AutoCAD to auto-discover commands in this assembly
[assembly: CommandClass(typeof(EtapDxfCleanup.Commands.CleanupCommands))]

namespace EtapDxfCleanup.Commands
{
    /// <summary>
    /// AutoCAD command definitions for the ETAP DXF cleanup tool.
    /// 
    /// Usage:
    ///   1. Open your ETAP-exported DXF in AutoCAD (File → Open)
    ///   2. Type NETLOAD and browse to EtapDxfCleanup.dll
    ///   3. Type one of the commands below
    /// 
    /// Commands:
    ///   ETAPFIX       – Full cleanup pipeline (layers → blocks → text → overlaps)
    ///   ETAPTEXT      – Fix text only (heights, alignment, grouping)
    ///   ETAPBLOCKS    – Fix blocks only (scales, rotations, attributes)
    ///   ETAPLAYERFIX  – Reorganize layers only
    ///   ETAPOVERLAP   – Resolve overlaps only
    ///   ETAPIMPORT    – Import a DXF file, clean it, and save as DWG
    /// </summary>
    public class CleanupCommands
    {
        // ════════════════════════════════════════════════════════════════
        //  ETAPFIX — Full Pipeline
        // ════════════════════════════════════════════════════════════════

        [CommandMethod("ETAPFIX")]
        public void FullCleanup()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n╔══════════════════════════════════════════╗");
            ed.WriteMessage("\n║  ETAP DXF Cleanup Tool v1.0              ║");
            ed.WriteMessage("\n║  Full Pipeline                           ║");
            ed.WriteMessage("\n╚══════════════════════════════════════════╝\n");

            var config = new CleanupConfig();
            var sw = Stopwatch.StartNew();

            using (DocumentLock docLock = doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    // Step 1: Scan all entities
                    ed.WriteMessage("\n── Step 1/5: Scanning drawing ──");
                    var scanner = new DrawingScanner(config);
                    var entities = scanner.ScanModelSpace(db, tr);

                    // Step 2: Organize layers
                    ed.WriteMessage("\n── Step 2/5: Organizing layers ──");
                    var blockFixer = new BlockFixer(config);
                    var layerOrg = new LayerOrganizer(config, blockFixer);
                    int layersMoved = layerOrg.OrganizeAll(db, tr, entities);

                    // Step 3: Fix blocks
                    ed.WriteMessage("\n── Step 3/5: Fixing blocks ──");
                    int blocksFixed = blockFixer.FixAll(db, tr, entities);

                    // Re-scan after block edits so text anchoring uses fresh geometry
                    entities = scanner.ScanModelSpace(db, tr);

                    // Step 4: Fix text (must happen after blocks so label-to-block
                    // association uses correct block positions)
                    ed.WriteMessage("\n── Step 4/5: Fixing text ──");
                    var textFixer = new TextFixer(config);
                    int textFixed = textFixer.FixAll(db, tr, entities);

                    // Re-scan after text edits so overlap resolver sees current extents
                    entities = scanner.ScanModelSpace(db, tr);

                    // Step 5: Resolve overlaps (must be last — after all positions are final)
                    ed.WriteMessage("\n── Step 5/5: Resolving overlaps ──");
                    var overlapResolver = new OverlapResolver(config);
                    int overlapsFixed = overlapResolver.ResolveAll(db, tr, entities);

                    tr.Commit();

                    sw.Stop();
                    ed.WriteMessage("\n\n╔══════════════════════════════════════════╗");
                    ed.WriteMessage($"\n║  Cleanup Complete ({sw.ElapsedMilliseconds}ms)");
                    ed.WriteMessage($"\n║  Layers reorganized:  {layersMoved}");
                    ed.WriteMessage($"\n║  Blocks fixed:        {blocksFixed}");
                    ed.WriteMessage($"\n║  Text entities fixed: {textFixed}");
                    ed.WriteMessage($"\n║  Overlaps resolved:   {overlapsFixed}");
                    ed.WriteMessage("\n╚══════════════════════════════════════════╝\n");
                }
                catch (System.Exception ex)
                {
                    tr.Abort();
                    ed.WriteMessage($"\n[ERROR] Cleanup failed: {ex.Message}");
                    ed.WriteMessage($"\n{ex.StackTrace}");
                }
            }
        }

        // ════════════════════════════════════════════════════════════════
        //  ETAPTEXT — Text Only
        // ════════════════════════════════════════════════════════════════

        [CommandMethod("ETAPTEXT")]
        public void FixTextOnly()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n[ETAP] Fixing text entities...\n");
            var config = new CleanupConfig();

            using (DocumentLock docLock = doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    var scanner = new DrawingScanner(config);
                    var entities = scanner.ScanModelSpace(db, tr);

                    var textFixer = new TextFixer(config);
                    int count = textFixer.FixAll(db, tr, entities);

                    tr.Commit();
                    ed.WriteMessage($"\n[ETAP] Fixed {count} text entities.\n");
                }
                catch (System.Exception ex)
                {
                    tr.Abort();
                    ed.WriteMessage($"\n[ERROR] {ex.Message}\n");
                }
            }
        }

        // ════════════════════════════════════════════════════════════════
        //  ETAPBLOCKS — Blocks Only
        // ════════════════════════════════════════════════════════════════

        [CommandMethod("ETAPBLOCKS")]
        public void FixBlocksOnly()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n[ETAP] Fixing block references...\n");
            var config = new CleanupConfig();

            using (DocumentLock docLock = doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    var scanner = new DrawingScanner(config);
                    var entities = scanner.ScanModelSpace(db, tr);

                    var blockFixer = new BlockFixer(config);
                    int count = blockFixer.FixAll(db, tr, entities);

                    tr.Commit();
                    ed.WriteMessage($"\n[ETAP] Fixed {count} blocks.\n");
                }
                catch (System.Exception ex)
                {
                    tr.Abort();
                    ed.WriteMessage($"\n[ERROR] {ex.Message}\n");
                }
            }
        }

        // ════════════════════════════════════════════════════════════════
        //  ETAPLAYERFIX — Layers Only
        // ════════════════════════════════════════════════════════════════

        [CommandMethod("ETAPLAYERFIX")]
        public void FixLayersOnly()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n[ETAP] Reorganizing layers...\n");
            var config = new CleanupConfig();

            using (DocumentLock docLock = doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    var scanner = new DrawingScanner(config);
                    var entities = scanner.ScanModelSpace(db, tr);

                    var blockFixer = new BlockFixer(config);
                    var layerOrg = new LayerOrganizer(config, blockFixer);
                    int count = layerOrg.OrganizeAll(db, tr, entities);

                    tr.Commit();
                    ed.WriteMessage($"\n[ETAP] Moved {count} entities to proper layers.\n");
                }
                catch (System.Exception ex)
                {
                    tr.Abort();
                    ed.WriteMessage($"\n[ERROR] {ex.Message}\n");
                }
            }
        }

        // ════════════════════════════════════════════════════════════════
        //  ETAPOVERLAP — Overlap Resolution Only
        // ════════════════════════════════════════════════════════════════

        [CommandMethod("ETAPOVERLAP")]
        public void ResolveOverlapsOnly()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n[ETAP] Resolving overlaps...\n");
            var config = new CleanupConfig();

            using (DocumentLock docLock = doc.LockDocument())
            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                try
                {
                    var scanner = new DrawingScanner(config);
                    var entities = scanner.ScanModelSpace(db, tr);

                    var resolver = new OverlapResolver(config);
                    int count = resolver.ResolveAll(db, tr, entities);

                    tr.Commit();
                    ed.WriteMessage($"\n[ETAP] Resolved {count} overlaps.\n");
                }
                catch (System.Exception ex)
                {
                    tr.Abort();
                    ed.WriteMessage($"\n[ERROR] {ex.Message}\n");
                }
            }
        }

        // ════════════════════════════════════════════════════════════════
        //  ETAPIMPORT — Import DXF, Clean, Save as DWG
        // ════════════════════════════════════════════════════════════════

        /// <summary>
        /// Prompts for a DXF file, opens it as a side database,
        /// runs the full cleanup, and saves as DWG.
        /// 
        /// This is the "batch" workflow — useful when you don't want to
        /// manually open the DXF in AutoCAD first.
        /// </summary>
        [CommandMethod("ETAPIMPORT")]
        public void ImportAndClean()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Editor ed = doc.Editor;

            // Prompt for input DXF path
            PromptStringOptions dxfOpt = new PromptStringOptions("\nPath to ETAP DXF file: ")
            {
                AllowSpaces = true
            };
            PromptResult dxfResult = ed.GetString(dxfOpt);
            if (dxfResult.Status != PromptStatus.OK) return;
            string dxfPath = dxfResult.StringResult.Trim('"');

            // Prompt for output DWG path
            PromptStringOptions dwgOpt = new PromptStringOptions("\nOutput DWG path (blank = same name): ")
            {
                AllowSpaces = true
            };
            PromptResult dwgResult = ed.GetString(dwgOpt);
            string dwgPath = string.IsNullOrWhiteSpace(dwgResult.StringResult)
                ? System.IO.Path.ChangeExtension(dxfPath, ".dwg")
                : dwgResult.StringResult.Trim('"');

            ed.WriteMessage($"\n[ETAP] Importing {dxfPath}...");

            try
            {
                // Open the DXF as a side database (does not affect the current drawing)
                using (Database sideDb = new Database(false, true))
                {
                    sideDb.DxfIn(dxfPath, null);
                    ed.WriteMessage("\n[ETAP] DXF loaded successfully. Running cleanup...");

                    var config = new CleanupConfig();

                    using (Transaction tr = sideDb.TransactionManager.StartTransaction())
                    {
                        var scanner = new DrawingScanner(config);
                        var entities = scanner.ScanModelSpace(sideDb, tr);

                        var blockFixer = new BlockFixer(config);
                        var layerOrg = new LayerOrganizer(config, blockFixer);
                        layerOrg.OrganizeAll(sideDb, tr, entities);

                        blockFixer.FixAll(sideDb, tr, entities);

                        entities = scanner.ScanModelSpace(sideDb, tr);

                        var textFixer = new TextFixer(config);
                        textFixer.FixAll(sideDb, tr, entities);

                        entities = scanner.ScanModelSpace(sideDb, tr);

                        var resolver = new OverlapResolver(config);
                        resolver.ResolveAll(sideDb, tr, entities);

                        tr.Commit();
                    }

                    // Save as DWG
                    sideDb.SaveAs(dwgPath, DwgVersion.Current);
                    ed.WriteMessage($"\n[ETAP] Cleaned drawing saved to: {dwgPath}");
                }
            }
            catch (System.Exception ex)
            {
                ed.WriteMessage($"\n[ERROR] Import failed: {ex.Message}");
                ed.WriteMessage($"\n{ex.StackTrace}");
            }
        }
    }
}
