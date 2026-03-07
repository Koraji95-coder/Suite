using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using EtapDxfCleanup.Models;

namespace EtapDxfCleanup.Core
{
    /// <summary>
    /// Detects overlapping entities and resolves collisions by nudging
    /// text and blocks apart. Uses a greedy spatial algorithm:
    /// 
    /// 1. Build a spatial grid of all entity bounding boxes
    /// 2. For each text entity, check neighbors for overlap
    /// 3. If overlap found, compute a displacement vector away from the collision
    /// 4. Nudge the LOWER-PRIORITY entity (text moves before blocks, 
    ///    annotations move before equipment labels)
    /// 5. Repeat until no overlaps remain or max iterations reached
    /// 
    /// Priority order (highest = least likely to move):
    ///   Equipment blocks > Bus lines > Equipment labels > Annotation text
    /// </summary>
    public class OverlapResolver
    {
        private readonly CleanupConfig _config;
        private int _resolvedCount;

        public OverlapResolver(CleanupConfig config)
        {
            _config = config;
        }

        /// <summary>
        /// Detects and resolves all overlaps in the drawing.
        /// Returns the number of entities moved.
        /// </summary>
        public int ResolveAll(Database db, Transaction tr, List<EntityInfo> entities)
        {
            _resolvedCount = 0;
            var doc = Application.DocumentManager.MdiActiveDocument;

            // Separate movable entities (text) from fixed entities (lines, blocks)
            var movable = entities
                .Where(e => e.EntityType == EntityType.Text ||
                            e.EntityType == EntityType.MText)
                .ToList();

            var obstacles = entities
                .Where(e => e.EntityType != EntityType.Text &&
                            e.EntityType != EntityType.MText)
                .ToList();

            if (_config.Verbose)
                doc.Editor.WriteMessage(
                    $"\n[OverlapResolver] Checking {movable.Count} text entities against " +
                    $"{obstacles.Count} obstacles and each other...");

            // Phase 1: Resolve text-on-text overlaps
            ResolveTextOverlaps(tr, movable);

            // Phase 2: Resolve text-on-obstacle overlaps
            ResolveTextOnObstacleOverlaps(tr, movable, obstacles);

            if (_config.Verbose)
                doc.Editor.WriteMessage(
                    $"\n[OverlapResolver] Moved {_resolvedCount} entities to resolve overlaps.");

            return _resolvedCount;
        }

        /// <summary>
        /// Resolves overlaps between text entities.
        /// The entity with lower priority (annotation < label) gets moved.
        /// </summary>
        private void ResolveTextOverlaps(Transaction tr, List<EntityInfo> textEntities)
        {
            // Multi-pass: keep resolving until stable or max iterations
            for (int pass = 0; pass < _config.MaxNudgeIterations; pass++)
            {
                bool anyMoved = false;
                var grid = BuildSpatialGrid(textEntities);
                var processedPairs = new HashSet<string>(StringComparer.Ordinal);

                foreach (var a in textEntities)
                {
                    var neighbors = GetNeighbors(a, grid);
                    foreach (var b in neighbors)
                    {
                        if (b.EntityType != EntityType.Text && b.EntityType != EntityType.MText)
                            continue;

                        string pairKey = MakePairKey(a.ObjectId, b.ObjectId);
                        if (!processedPairs.Add(pairKey))
                            continue;

                        if (!a.Intersects(b, _config.BoundingBoxPadding))
                            continue;

                        // Move the one that's an annotation (lower priority)
                        var toMove = IsAnnotationContent(b.TextContent) ? b : a;
                        var stationary = toMove == a ? b : a;

                        Vector3d displacement = ComputeDisplacement(toMove, stationary);
                        MoveEntity(tr, toMove, displacement);
                        anyMoved = true;
                    }
                }

                if (!anyMoved) break;
            }
        }

        /// <summary>
        /// Resolves text overlapping with non-text entities (lines, blocks).
        /// Text always moves; obstacles stay fixed.
        /// </summary>
        private void ResolveTextOnObstacleOverlaps(Transaction tr, List<EntityInfo> textEntities,
            List<EntityInfo> obstacles)
        {
            var obstacleGrid = BuildSpatialGrid(obstacles);

            foreach (var text in textEntities)
            {
                for (int iter = 0; iter < _config.MaxNudgeIterations; iter++)
                {
                    bool overlapping = false;
                    var nearbyObstacles = GetNeighbors(text, obstacleGrid);

                    foreach (var obs in nearbyObstacles)
                    {
                        if (!text.Intersects(obs, _config.MinTextToLineGap))
                            continue;

                        overlapping = true;
                        Vector3d displacement = ComputeDisplacement(text, obs);
                        MoveEntity(tr, text, displacement);
                        break; // Re-check after moving
                    }

                    if (!overlapping) break;
                }
            }
        }

        /// <summary>
        /// Computes a displacement vector that moves 'toMove' away from 'stationary'.
        /// The direction is from stationary's center toward toMove's center, 
        /// with magnitude = NudgeDistance.
        /// 
        /// Special case: if centers are coincident, nudge downward.
        /// </summary>
        private Vector3d ComputeDisplacement(EntityInfo toMove, EntityInfo stationary)
        {
            double dx = toMove.Center.X - stationary.Center.X;
            double dy = toMove.Center.Y - stationary.Center.Y;
            double dist = Math.Sqrt(dx * dx + dy * dy);

            if (dist < 0.001)
            {
                // Centers are on top of each other — nudge straight down
                return new Vector3d(0, -_config.NudgeDistance, 0);
            }

            // Normalize and scale to nudge distance
            double scale = _config.NudgeDistance / dist;
            return new Vector3d(dx * scale, dy * scale, 0);
        }

        /// <summary>
        /// Moves an entity by a displacement vector and updates its EntityInfo.
        /// </summary>
        private void MoveEntity(Transaction tr, EntityInfo info, Vector3d displacement)
        {
            Entity ent = tr.GetObject(info.ObjectId, OpenMode.ForWrite) as Entity;
            if (ent == null) return;

            // Use TransformBy for universal entity movement
            Matrix3d moveMatrix = Matrix3d.Displacement(displacement);
            ent.TransformBy(moveMatrix);

            // Update cached bounding box
            try
            {
                info.BoundingBox = ent.GeometricExtents;
                info.Position = new Point3d(
                    info.Position.X + displacement.X,
                    info.Position.Y + displacement.Y,
                    info.Position.Z + displacement.Z);
            }
            catch { /* entity may have zero extents after move */ }

            _resolvedCount++;
        }

        /// <summary>
        /// Builds a spatial hash grid for fast neighbor lookups.
        /// Each cell key is "col,row" based on grid coordinates.
        /// Entities are placed in every cell their bounding box touches.
        /// </summary>
        private Dictionary<string, List<EntityInfo>> BuildSpatialGrid(
            IEnumerable<EntityInfo> entities, double cellSize = 50.0)
        {
            var grid = new Dictionary<string, List<EntityInfo>>();

            foreach (var ent in entities)
            {
                int minCol = (int)Math.Floor(ent.BoundingBox.MinPoint.X / cellSize);
                int maxCol = (int)Math.Floor(ent.BoundingBox.MaxPoint.X / cellSize);
                int minRow = (int)Math.Floor(ent.BoundingBox.MinPoint.Y / cellSize);
                int maxRow = (int)Math.Floor(ent.BoundingBox.MaxPoint.Y / cellSize);

                for (int col = minCol; col <= maxCol; col++)
                {
                    for (int row = minRow; row <= maxRow; row++)
                    {
                        string key = $"{col},{row}";
                        if (!grid.ContainsKey(key))
                            grid[key] = new List<EntityInfo>();
                        grid[key].Add(ent);
                    }
                }
            }

            return grid;
        }

        /// <summary>
        /// Gets all entities in the same grid cells as the given entity.
        /// </summary>
        public List<EntityInfo> GetNeighbors(EntityInfo entity,
            Dictionary<string, List<EntityInfo>> grid, double cellSize = 50.0)
        {
            var neighbors = new HashSet<EntityInfo>();

            int minCol = (int)Math.Floor(entity.BoundingBox.MinPoint.X / cellSize);
            int maxCol = (int)Math.Floor(entity.BoundingBox.MaxPoint.X / cellSize);
            int minRow = (int)Math.Floor(entity.BoundingBox.MinPoint.Y / cellSize);
            int maxRow = (int)Math.Floor(entity.BoundingBox.MaxPoint.Y / cellSize);

            for (int col = minCol; col <= maxCol; col++)
            {
                for (int row = minRow; row <= maxRow; row++)
                {
                    string key = $"{col},{row}";
                    if (grid.ContainsKey(key))
                    {
                        foreach (var n in grid[key])
                        {
                            if (n.ObjectId != entity.ObjectId)
                                neighbors.Add(n);
                        }
                    }
                }
            }

            return neighbors.ToList();
        }

        private string MakePairKey(ObjectId a, ObjectId b)
        {
            string sa = a.Handle.ToString();
            string sb = b.Handle.ToString();
            return string.CompareOrdinal(sa, sb) <= 0 ? $"{sa}|{sb}" : $"{sb}|{sa}";
        }

        private bool IsAnnotationContent(string content)
        {
            if (string.IsNullOrWhiteSpace(content)) return true;
            string upper = content.ToUpperInvariant();
            return upper.Contains("KV") || upper.Contains(" A") ||
                   upper.Contains("PF") || upper.Contains("KW") ||
                   upper.Contains("%") || upper.Contains("MVA");
        }
    }
}
