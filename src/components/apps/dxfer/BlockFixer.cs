using System;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using EtapDxfCleanup.Models;

namespace EtapDxfCleanup.Core
{
    /// <summary>
    /// Fixes block references exported from ETAP:
    ///   - Normalizes non-uniform scales (ScaleX != ScaleY)
    ///   - Snaps rotations to clean angles (0, 90, 180, 270)
    ///   - Standardizes attribute text heights within blocks
    ///   - Identifies and categorizes ETAP equipment types by block name
    /// </summary>
    public class BlockFixer
    {
        private readonly CleanupConfig _config;
        private int _fixedCount;

        public BlockFixer(CleanupConfig config)
        {
            _config = config;
        }

        /// <summary>
        /// Runs all block fixes.
        /// </summary>
        public int FixAll(Database db, Transaction tr, List<EntityInfo> entities)
        {
            _fixedCount = 0;
            var doc = Application.DocumentManager.MdiActiveDocument;

            var blockEntities = entities.FindAll(e => e.EntityType == EntityType.BlockReference);

            if (_config.Verbose)
                doc.Editor.WriteMessage($"\n[BlockFixer] Processing {blockEntities.Count} blocks...");

            foreach (var blockInfo in blockEntities)
            {
                FixBlockReference(tr, blockInfo);
            }

            if (_config.Verbose)
                doc.Editor.WriteMessage($"\n[BlockFixer] Fixed {_fixedCount} blocks.");

            return _fixedCount;
        }

        /// <summary>
        /// Fixes a single block reference.
        /// </summary>
        private void FixBlockReference(Transaction tr, EntityInfo info)
        {
            BlockReference blkRef = tr.GetObject(info.ObjectId, OpenMode.ForWrite) as BlockReference;
            if (blkRef == null) return;

            bool changed = false;

            // ── Fix non-uniform scale ──
            // ETAP sometimes exports blocks with ScaleX != ScaleY, causing distortion
            changed |= NormalizeScale(blkRef);

            // ── Snap rotation ──
            changed |= SnapRotation(blkRef);

            // ── Fix attribute text within blocks ──
            changed |= FixAttributes(tr, blkRef);

            if (changed) _fixedCount++;
        }

        /// <summary>
        /// Ensures ScaleX, ScaleY, and ScaleZ are uniform.
        /// If they differ, uses the average as the new uniform scale.
        /// </summary>
        private bool NormalizeScale(BlockReference blkRef)
        {
            double sx = Math.Abs(blkRef.ScaleFactors.X);
            double sy = Math.Abs(blkRef.ScaleFactors.Y);
            double sz = Math.Abs(blkRef.ScaleFactors.Z);

            // Check if scales are already uniform (within tolerance)
            if (Math.Abs(sx - sy) <= _config.ScaleTolerance * sx &&
                Math.Abs(sx - sz) <= _config.ScaleTolerance * sx)
            {
                return false;
            }

            // Use the average scale, preserving sign (mirroring)
            double avgScale = (sx + sy) / 2.0;
            double signX = blkRef.ScaleFactors.X >= 0 ? 1 : -1;
            double signY = blkRef.ScaleFactors.Y >= 0 ? 1 : -1;

            blkRef.ScaleFactors = new Scale3d(
                avgScale * signX,
                avgScale * signY,
                avgScale);

            return true;
        }

        /// <summary>
        /// Snaps block rotation to the nearest clean angle.
        /// E.g., if RotationSnapDegrees = 90, a block at 3° snaps to 0°,
        /// a block at 88° snaps to 90°.
        /// </summary>
        private bool SnapRotation(BlockReference blkRef)
        {
            if (_config.RotationSnapDegrees <= 0) return false;

            double currentDeg = blkRef.Rotation * 180.0 / Math.PI;
            double snapDeg = _config.RotationSnapDegrees;

            double snappedDeg = Math.Round(currentDeg / snapDeg) * snapDeg;
            double snappedRad = snappedDeg * Math.PI / 180.0;

            // Only fix if there's a meaningful difference
            if (Math.Abs(blkRef.Rotation - snappedRad) < 0.001)
                return false;

            blkRef.Rotation = snappedRad;
            return true;
        }

        /// <summary>
        /// Fixes attribute definitions within a block reference.
        /// Standardizes text height and alignment of attribute values.
        /// </summary>
        private bool FixAttributes(Transaction tr, BlockReference blkRef)
        {
            bool changed = false;
            var attCol = blkRef.AttributeCollection;

            foreach (ObjectId attId in attCol)
            {
                AttributeReference attRef = tr.GetObject(attId, OpenMode.ForWrite) as AttributeReference;
                if (attRef == null) continue;

                // Standardize attribute text height
                if (attRef.Height < _config.MinTextHeight || attRef.Height > _config.MaxTextHeight)
                {
                    attRef.Height = _config.AnnotationTextHeight;
                    changed = true;
                }

                // Fix invisible attributes that should be visible
                // ETAP sometimes marks label attributes as invisible
                if (attRef.Invisible && IsImportantAttribute(attRef.Tag))
                {
                    attRef.Invisible = false;
                    changed = true;
                }
            }

            return changed;
        }

        /// <summary>
        /// Categorizes a block by its name to determine what type of
        /// ETAP equipment it represents.
        /// </summary>
        public string CategorizeBlock(string blockName)
        {
            if (string.IsNullOrEmpty(blockName)) return "UNKNOWN";
            string upper = blockName.ToUpperInvariant();

            if (MatchesAny(upper, _config.TransformerBlockPatterns)) return "TRANSFORMER";
            if (MatchesAny(upper, _config.BreakerBlockPatterns)) return "BREAKER";
            if (MatchesAny(upper, _config.MotorBlockPatterns)) return "MOTOR";
            if (MatchesAny(upper, _config.GeneratorBlockPatterns)) return "GENERATOR";
            if (MatchesAny(upper, _config.BusBlockPatterns)) return "BUS";

            return "EQUIPMENT";
        }

        /// <summary>
        /// Determines if an attribute tag represents important info that should be visible.
        /// </summary>
        private bool IsImportantAttribute(string tag)
        {
            if (string.IsNullOrEmpty(tag)) return false;
            string upper = tag.ToUpperInvariant();

            return upper.Contains("ID") ||
                   upper.Contains("NAME") ||
                   upper.Contains("TAG") ||
                   upper.Contains("LABEL") ||
                   upper.Contains("VOLTAGE") ||
                   upper.Contains("RATING");
        }

        private bool MatchesAny(string value, string[] patterns)
        {
            foreach (var pattern in patterns)
            {
                if (value.Contains(pattern)) return true;
            }
            return false;
        }
    }
}
