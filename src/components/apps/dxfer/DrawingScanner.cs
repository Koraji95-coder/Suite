using System;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using EtapDxfCleanup.Models;

namespace EtapDxfCleanup.Core
{
    /// <summary>
    /// Scans the active drawing and builds a catalog of all entities
    /// with their bounding boxes, types, and metadata.
    /// This is the first step in the cleanup pipeline.
    /// </summary>
    public class DrawingScanner
    {
        private readonly CleanupConfig _config;

        public DrawingScanner(CleanupConfig config)
        {
            _config = config;
        }

        /// <summary>
        /// Scans model space and returns info for every entity.
        /// </summary>
        public List<EntityInfo> ScanModelSpace(Database db, Transaction tr)
        {
            var results = new List<EntityInfo>();

            BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
            BlockTableRecord modelSpace = tr.GetObject(
                bt[BlockTableRecord.ModelSpace], OpenMode.ForRead) as BlockTableRecord;

            foreach (ObjectId id in modelSpace)
            {
                Entity ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
                if (ent == null) continue;

                EntityInfo info = ExtractEntityInfo(ent, tr);
                if (info != null)
                {
                    results.Add(info);
                }
            }

            if (_config.Verbose)
            {
                var doc = Application.DocumentManager.MdiActiveDocument;
                doc.Editor.WriteMessage(
                    $"\n[ETAP Cleanup] Scanned {results.Count} entities in Model Space.");
            }

            return results;
        }

        /// <summary>
        /// Extracts type, position, bounding box, and metadata from an entity.
        /// </summary>
        private EntityInfo ExtractEntityInfo(Entity ent, Transaction tr)
        {
            var info = new EntityInfo
            {
                ObjectId = ent.ObjectId,
                LayerName = ent.Layer
            };

            try
            {
                // Compute geometric extents (bounding box)
                info.BoundingBox = ent.GeometricExtents;
            }
            catch
            {
                // Some entities (empty blocks, zero-length lines) have no extents
                return null;
            }

            switch (ent)
            {
                case DBText dbText:
                    info.EntityType = EntityType.Text;
                    info.TextContent = dbText.TextString;
                    info.Position = dbText.Position;
                    info.Rotation = dbText.Rotation;
                    break;

                case MText mText:
                    info.EntityType = EntityType.MText;
                    info.TextContent = mText.Contents;
                    info.Position = mText.Location;
                    info.Rotation = mText.Rotation;
                    break;

                case BlockReference blkRef:
                    info.EntityType = EntityType.BlockReference;
                    info.BlockName = GetBlockName(blkRef, tr);
                    info.Position = blkRef.Position;
                    info.Rotation = blkRef.Rotation;
                    break;

                case Line line:
                    info.EntityType = EntityType.Line;
                    info.Position = line.StartPoint;
                    break;

                case Polyline pline:
                    info.EntityType = EntityType.Polyline;
                    info.Position = pline.StartPoint;
                    break;

                case Circle circle:
                    info.EntityType = EntityType.Circle;
                    info.Position = circle.Center;
                    break;

                case Arc arc:
                    info.EntityType = EntityType.Arc;
                    info.Position = arc.Center;
                    break;

                case Dimension dim:
                    info.EntityType = EntityType.Dimension;
                    info.TextContent = dim.DimensionText;
                    info.Position = dim.TextPosition;
                    break;

                default:
                    info.EntityType = EntityType.Other;
                    info.Position = info.Center;
                    break;
            }

            return info;
        }

        /// <summary>
        /// Resolves the effective block name, handling dynamic blocks.
        /// </summary>
        private string GetBlockName(BlockReference blkRef, Transaction tr)
        {
            // Dynamic blocks have an anonymous name like *U123
            // We need the real (user-visible) name
            if (blkRef.IsDynamicBlock)
            {
                BlockTableRecord dynBtr = tr.GetObject(
                    blkRef.DynamicBlockTableRecord, OpenMode.ForRead) as BlockTableRecord;
                return dynBtr?.Name ?? blkRef.Name;
            }
            return blkRef.Name;
        }

        /// <summary>
        /// Filters scanned entities by type.
        /// </summary>
        public List<EntityInfo> FilterByType(List<EntityInfo> entities, EntityType type)
        {
            return entities.FindAll(e => e.EntityType == type);
        }

        /// <summary>
        /// Filters scanned entities by layer.
        /// </summary>
        public List<EntityInfo> FilterByLayer(List<EntityInfo> entities, string layerName)
        {
            return entities.FindAll(e =>
                string.Equals(e.LayerName, layerName, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Gets all text entities (both DBText and MText).
        /// </summary>
        public List<EntityInfo> GetAllText(List<EntityInfo> entities)
        {
            return entities.FindAll(e =>
                e.EntityType == EntityType.Text || e.EntityType == EntityType.MText);
        }

        /// <summary>
        /// Gets all block references.
        /// </summary>
        public List<EntityInfo> GetAllBlocks(List<EntityInfo> entities)
        {
            return entities.FindAll(e => e.EntityType == EntityType.BlockReference);
        }
    }
}
