
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using EtapDxfCleanup.Models;

namespace EtapDxfCleanup.Core
{
    /// <summary>
    /// Fixes text entities exported from ETAP with a multi-pass strategy:
    /// 1) normalize text metadata
    /// 2) selectively convert DBText to MText
    /// 3) conservatively merge inferred single-line stacks
    /// 4) align text relative to nearby anchors
    /// 5) finalize normalization
    /// </summary>
    public class TextFixer
    {
        private enum AnchorSide
        {
            Left,
            Right,
            Top,
            Bottom
        }

        private sealed class TextSnapshot
        {
            public ObjectId ObjectId { get; set; }
            public EntityType EntityType { get; set; }
            public string LayerName { get; set; } = string.Empty;
            public string ContentRaw { get; set; } = string.Empty;
            public string ContentPlain { get; set; } = string.Empty;
            public Point3d Position { get; set; }
            public Point3d Center { get; set; }
            public Extents3d Bounds { get; set; }
            public double Height { get; set; }
            public double Rotation { get; set; }
            public bool IsAnnotation { get; set; }
        }

        private sealed class AnchorCandidate
        {
            public EntityInfo Anchor { get; set; } = null!;
            public double Score { get; set; }
            public double Distance { get; set; }
            public AnchorSide Side { get; set; }
        }

        private sealed class PlacementDecision
        {
            public Point3d Location { get; set; }
            public AnchorSide Side { get; set; }
            public AttachmentPoint Attachment { get; set; }
            public TextHorizontalMode HorizontalMode { get; set; }
            public TextVerticalMode VerticalMode { get; set; }
            public double Rotation { get; set; }
        }

        private readonly CleanupConfig _config;
        private int _fixedCount;
        private ObjectId _standardTextStyleId;
        private Editor _editor;
        private int _traceCount;

        public TextFixer(CleanupConfig config)
        {
            _config = config;
        }

        /// <summary>
        /// Runs all text fixes on the drawing.
        /// </summary>
        public int FixAll(Database db, Transaction tr, List<EntityInfo> entities)
        {
            _fixedCount = 0;
            _standardTextStyleId = EnsureTextStyleExists(db, tr);
            _traceCount = 0;

            var doc = Application.DocumentManager.MdiActiveDocument;
            _editor = doc?.Editor;
            var textObjectIds = entities
                .Where(e => e.EntityType == EntityType.Text || e.EntityType == EntityType.MText)
                .Select(e => e.ObjectId)
                .ToList();

            int beforeExclusions = textObjectIds.Count;
            textObjectIds = FilterExcludedText(tr, textObjectIds);

            var blockAnchors = entities
                .Where(e => e.EntityType == EntityType.BlockReference)
                .ToList();

            var lineAnchors = entities
                .Where(e => e.EntityType == EntityType.Line || e.EntityType == EntityType.Polyline)
                .ToList();

            if (_config.Verbose)
            {
                doc.Editor.WriteMessage(
                    $"\n[TextFixer] Text={textObjectIds.Count}/{beforeExclusions}, Blocks={blockAnchors.Count}, Linework={lineAnchors.Count}");
            }

            NormalizeTextMetadata(db, tr, textObjectIds);

            if (_config.EnableDbTextToMTextConversion)
            {
                textObjectIds = ConvertDbTextToMText(db, tr, textObjectIds, blockAnchors, lineAnchors);
            }

            if (_config.EnableConservativeTextMerge)
            {
                textObjectIds = MergeConservativeStacks(tr, textObjectIds);
            }

            AlignTextToNearbyAnchors(db, tr, textObjectIds, blockAnchors, lineAnchors);
            FinalizeTextNormalization(db, tr, textObjectIds);

            if (_config.Verbose)
            {
                doc.Editor.WriteMessage($"\n[TextFixer] Fixed {_fixedCount} text entities.");
            }

            return _fixedCount;
        }

        private List<ObjectId> FilterExcludedText(Transaction tr, IReadOnlyList<ObjectId> textObjectIds)
        {
            if (!_config.EnableProtectedTextExclusions)
            {
                return textObjectIds.ToList();
            }

            var filtered = new List<ObjectId>(textObjectIds.Count);
            foreach (var id in textObjectIds)
            {
                Entity entity = tr.GetObject(id, OpenMode.ForRead, false) as Entity;
                if (entity == null || entity.IsErased)
                {
                    continue;
                }

                if (IsProtectedText(entity))
                {
                    Trace($"skip protected text id={id.Handle} layer={entity.Layer}");
                    continue;
                }

                filtered.Add(id);
            }

            return filtered;
        }

        private bool IsProtectedText(Entity entity)
        {
            if (!_config.EnableProtectedTextExclusions)
            {
                return false;
            }

            string layer = (entity.Layer ?? string.Empty).ToUpperInvariant();
            if (MatchesAnyPattern(layer, _config.ProtectedTextLayerPatterns))
            {
                return true;
            }

            string content = string.Empty;
            if (entity is DBText dbText)
            {
                content = NormalizeTextForPattern(dbText.TextString);
            }
            else if (entity is MText mText)
            {
                content = NormalizeTextForPattern(mText.Contents);
            }

            if (string.IsNullOrWhiteSpace(content))
            {
                return false;
            }

            string upper = content.ToUpperInvariant();
            return MatchesAnyPattern(upper, _config.ProtectedTextContentPatterns);
        }

        private bool MatchesAnyPattern(string value, IEnumerable<string> patterns)
        {
            if (string.IsNullOrWhiteSpace(value) || patterns == null)
            {
                return false;
            }

            foreach (string raw in patterns)
            {
                if (string.IsNullOrWhiteSpace(raw))
                {
                    continue;
                }

                string token = raw.Trim();
                if (MatchesPattern(value, token))
                {
                    return true;
                }
            }

            return false;
        }

        private bool MatchesPattern(string value, string pattern)
        {
            if (string.IsNullOrWhiteSpace(value) || string.IsNullOrWhiteSpace(pattern))
            {
                return false;
            }

            bool hasWildcard = pattern.Contains("*") || pattern.Contains("?");
            if (!hasWildcard)
            {
                return value.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0;
            }

            string regex = "^" + Regex.Escape(pattern)
                .Replace("\\*", ".*")
                .Replace("\\?", ".") + "$";

            return Regex.IsMatch(value, regex, RegexOptions.IgnoreCase);
        }

        private void NormalizeTextMetadata(Database db, Transaction tr, IReadOnlyList<ObjectId> textObjectIds)
        {
            foreach (var id in textObjectIds)
            {
                Entity entity = tr.GetObject(id, OpenMode.ForWrite, false) as Entity;
                if (entity == null || entity.IsErased)
                {
                    continue;
                }

                bool changed = false;

                if (entity is DBText dbText)
                {
                    string plainText = NormalizeTextForPattern(dbText.TextString);
                    bool isAnnotation = IsAnnotationText(plainText);
                    double targetHeight = TargetTextHeight(isAnnotation);

                    changed |= ApplyTextHeight(dbText, targetHeight);
                    changed |= ApplyTextStyle(dbText);

                    double snapped = SnapTextRotation(dbText.Rotation, allowAggressiveSnap: false);
                    if (!NearlyEqual(snapped, dbText.Rotation))
                    {
                        dbText.Rotation = snapped;
                        changed = true;
                    }

                    if (changed)
                    {
                        SafeAdjustDbTextAlignment(dbText, db);
                    }
                }
                else if (entity is MText mText)
                {
                    string plainText = NormalizeTextForPattern(mText.Contents);
                    bool isAnnotation = IsAnnotationText(plainText);
                    double targetHeight = TargetTextHeight(isAnnotation);

                    changed |= ApplyTextHeight(mText, targetHeight);
                    changed |= ApplyTextStyle(mText);

                    if (mText.Width > 0 && mText.Width < mText.TextHeight * 2.0)
                    {
                        mText.Width = 0;
                        changed = true;
                    }

                    double snapped = SnapTextRotation(mText.Rotation, allowAggressiveSnap: false);
                    if (!NearlyEqual(snapped, mText.Rotation))
                    {
                        mText.Rotation = snapped;
                        changed = true;
                    }
                }

                if (changed)
                {
                    _fixedCount++;
                }
            }
        }

        private List<ObjectId> ConvertDbTextToMText(
            Database db,
            Transaction tr,
            IReadOnlyList<ObjectId> textObjectIds,
            IReadOnlyList<EntityInfo> blockAnchors,
            IReadOnlyList<EntityInfo> lineAnchors)
        {
            var modelSpace = GetModelSpace(db, tr);
            var updated = new List<ObjectId>(textObjectIds.Count);

            foreach (var id in textObjectIds)
            {
                DBText dbText = tr.GetObject(id, OpenMode.ForWrite, false) as DBText;
                if (dbText == null || dbText.IsErased)
                {
                    if (!id.IsNull)
                    {
                        updated.Add(id);
                    }
                    continue;
                }

                TextSnapshot snapshot = BuildTextSnapshot(tr, id);
                if (snapshot == null)
                {
                    updated.Add(id);
                    continue;
                }

                double conversionScore = ScoreDbTextConversion(snapshot, blockAnchors, lineAnchors);
                if (conversionScore < _config.DbTextToMTextConfidenceThreshold)
                {
                    Trace(
                        $"convert keep id={id.Handle} score={conversionScore:F2} threshold={_config.DbTextToMTextConfidenceThreshold:F2} text=\"{Truncate(snapshot.ContentPlain, 48)}\"");
                    updated.Add(id);
                    continue;
                }

                var mText = new MText
                {
                    Contents = snapshot.ContentPlain,
                    TextHeight = Clamp(TargetTextHeight(snapshot.IsAnnotation), _config.MinTextHeight, _config.MaxTextHeight),
                    Width = 0,
                    Rotation = SnapTextRotation(snapshot.Rotation, allowAggressiveSnap: false),
                    Location = snapshot.Position,
                    Layer = dbText.Layer,
                    Attachment = AttachmentPoint.MiddleLeft,
                    TextStyleId = _standardTextStyleId,
                    LinetypeId = dbText.LinetypeId,
                    LinetypeScale = dbText.LinetypeScale,
                    Color = dbText.Color
                };

                ObjectId newId = modelSpace.AppendEntity(mText);
                tr.AddNewlyCreatedDBObject(mText, true);
                dbText.Erase();

                Trace(
                    $"convert dbtext->mtext old={id.Handle} new={newId.Handle} score={conversionScore:F2} text=\"{Truncate(snapshot.ContentPlain, 48)}\"");

                updated.Add(newId);
                _fixedCount++;
            }

            return updated;
        }
        private List<ObjectId> MergeConservativeStacks(Transaction tr, IReadOnlyList<ObjectId> textObjectIds)
        {
            var snapshots = textObjectIds
                .Select(id => BuildTextSnapshot(tr, id))
                .Where(s => s != null)
                .Cast<TextSnapshot>()
                .Where(s => s.EntityType == EntityType.MText)
                .Where(s => !LooksMultiline(s.ContentRaw))
                .ToList();

            var used = new HashSet<ObjectId>();
            var keep = new HashSet<ObjectId>(textObjectIds);

            foreach (var baseSnap in snapshots.OrderBy(s => s.LayerName).ThenBy(s => s.Center.X).ThenByDescending(s => s.Center.Y))
            {
                if (used.Contains(baseSnap.ObjectId))
                {
                    continue;
                }

                double xTolerance = Math.Max(_config.StandardTextHeight, baseSnap.Height) * _config.TextMergeXToleranceFactor;
                double minGap = Math.Max(0.01, baseSnap.Height * _config.TextMergeLineGapMinFactor);
                double maxGap = Math.Max(minGap, baseSnap.Height * _config.TextMergeLineGapMaxFactor);
                double rotationTolerance = DegreesToRadians(_config.TextMergeRotationToleranceDegrees);

                var group = snapshots
                    .Where(s => !used.Contains(s.ObjectId))
                    .Where(s => !s.ObjectId.IsNull)
                    .Where(s => s.LayerName.Equals(baseSnap.LayerName, StringComparison.OrdinalIgnoreCase))
                    .Where(s => Math.Abs(s.Center.X - baseSnap.Center.X) <= xTolerance)
                    .Where(s => Math.Abs(NormalizeAngle(s.Rotation - baseSnap.Rotation)) <= rotationTolerance)
                    .Where(s => Math.Abs(s.Center.Y - baseSnap.Center.Y) <= maxGap * 3.0)
                    .OrderByDescending(s => s.Center.Y)
                    .ToList();

                if (group.Count < 2)
                {
                    continue;
                }

                bool validSpacing = true;
                for (int i = 1; i < group.Count; i++)
                {
                    double gap = group[i - 1].Center.Y - group[i].Center.Y;
                    if (gap < minGap || gap > maxGap)
                    {
                        validSpacing = false;
                        break;
                    }
                }

                if (!validSpacing)
                {
                    continue;
                }

                double xSpread = group.Max(g => g.Center.X) - group.Min(g => g.Center.X);
                if (xSpread > xTolerance)
                {
                    continue;
                }

                MText baseText = tr.GetObject(group[0].ObjectId, OpenMode.ForWrite, false) as MText;
                if (baseText == null || baseText.IsErased)
                {
                    continue;
                }

                var lines = group
                    .Select(g => g.ContentPlain)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .ToList();

                if (lines.Count < 2)
                {
                    continue;
                }

                string merged = string.Join("\\P", lines);
                if (!string.Equals(baseText.Contents, merged, StringComparison.Ordinal))
                {
                    baseText.Contents = merged;
                    baseText.TextStyleId = _standardTextStyleId;
                    baseText.Width = 0;
                    _fixedCount++;
                    Trace(
                        $"merge base={baseText.ObjectId.Handle} lines={lines.Count} layer={baseSnap.LayerName} text=\"{Truncate(lines[0], 32)}\"");
                }

                used.Add(baseText.ObjectId);

                for (int i = 1; i < group.Count; i++)
                {
                    MText toRemove = tr.GetObject(group[i].ObjectId, OpenMode.ForWrite, false) as MText;
                    if (toRemove == null || toRemove.IsErased)
                    {
                        continue;
                    }

                    toRemove.Erase();
                    keep.Remove(group[i].ObjectId);
                    used.Add(group[i].ObjectId);
                    _fixedCount++;
                }
            }

            return textObjectIds.Where(id => keep.Contains(id)).ToList();
        }

        private void AlignTextToNearbyAnchors(
            Database db,
            Transaction tr,
            IReadOnlyList<ObjectId> textObjectIds,
            IReadOnlyList<EntityInfo> blockAnchors,
            IReadOnlyList<EntityInfo> lineAnchors)
        {
            foreach (var textId in textObjectIds)
            {
                TextSnapshot text = BuildTextSnapshot(tr, textId);
                if (text == null)
                {
                    continue;
                }

                AnchorCandidate bestBlock = FindBestAnchor(text, blockAnchors, isBlock: true);
                AnchorCandidate best = bestBlock;

                if (_config.EnableLineworkAnchorFallback)
                {
                    bool needsFallback = best == null || best.Score < _config.AnchorMinimumScore;
                    if (needsFallback)
                    {
                        AnchorCandidate lineCandidate = FindBestAnchor(text, lineAnchors, isBlock: false);
                        if (lineCandidate != null && (best == null || lineCandidate.Score > best.Score))
                        {
                            best = lineCandidate;
                        }
                    }
                }

                if (best == null)
                {
                    Trace($"anchor none id={text.ObjectId.Handle} text=\"{Truncate(text.ContentPlain, 48)}\"");
                    continue;
                }

                bool highConfidence = best.Score >= _config.AnchorMinimumScore;
                if (!highConfidence && _config.LowConfidenceBehavior == LowConfidenceBehavior.LeaveInPlace)
                {
                    Trace(
                        $"anchor low-confidence keep id={text.ObjectId.Handle} score={best.Score:F2} min={_config.AnchorMinimumScore:F2} anchor={best.Anchor.ObjectId.Handle}");
                    continue;
                }

                PlacementDecision placement = ComputePlacement(text, best);
                if (!highConfidence && _config.LowConfidenceBehavior == LowConfidenceBehavior.NudgeTowardAnchor)
                {
                    placement = NudgePlacement(text, placement, 0.35);
                    Trace(
                        $"anchor nudge id={text.ObjectId.Handle} score={best.Score:F2} anchor={best.Anchor.ObjectId.Handle} side={best.Side}");
                }
                else
                {
                    Trace(
                        $"anchor place id={text.ObjectId.Handle} score={best.Score:F2} anchor={best.Anchor.ObjectId.Handle} side={best.Side}");
                }

                ApplyPlacement(db, tr, text, placement);
            }
        }

        private void FinalizeTextNormalization(Database db, Transaction tr, IReadOnlyList<ObjectId> textObjectIds)
        {
            foreach (var id in textObjectIds)
            {
                Entity entity = tr.GetObject(id, OpenMode.ForWrite, false) as Entity;
                if (entity == null || entity.IsErased)
                {
                    continue;
                }

                bool changed = false;

                if (entity is DBText dbText)
                {
                    string plain = NormalizeTextForPattern(dbText.TextString);
                    bool isAnnotation = IsAnnotationText(plain);
                    changed |= ApplyTextHeight(dbText, TargetTextHeight(isAnnotation));
                    changed |= ApplyTextStyle(dbText);

                    double snapped = SnapTextRotation(dbText.Rotation, allowAggressiveSnap: false);
                    if (!NearlyEqual(snapped, dbText.Rotation))
                    {
                        dbText.Rotation = snapped;
                        changed = true;
                    }

                    if (changed)
                    {
                        SafeAdjustDbTextAlignment(dbText, db);
                    }
                }
                else if (entity is MText mText)
                {
                    string plain = NormalizeTextForPattern(mText.Contents);
                    bool isAnnotation = IsAnnotationText(plain);

                    changed |= ApplyTextHeight(mText, TargetTextHeight(isAnnotation));
                    changed |= ApplyTextStyle(mText);

                    if (mText.Width > 0 && mText.Width < mText.TextHeight * 2.0)
                    {
                        mText.Width = 0;
                        changed = true;
                    }

                    double snapped = SnapTextRotation(mText.Rotation, allowAggressiveSnap: false);
                    if (!NearlyEqual(snapped, mText.Rotation))
                    {
                        mText.Rotation = snapped;
                        changed = true;
                    }
                }

                if (changed)
                {
                    _fixedCount++;
                }
            }
        }

        private AnchorCandidate FindBestAnchor(TextSnapshot text, IReadOnlyList<EntityInfo> anchors, bool isBlock)
        {
            AnchorCandidate best = null;

            foreach (var anchor in anchors)
            {
                double sizeMetric = Math.Max(Diagonal(anchor.BoundingBox), _config.AnchorMinSizeFloor);
                double maxDistance = sizeMetric * _config.AnchorMaxDistanceFactor;
                double distance = DistanceToExtents(text.Center, anchor.BoundingBox);
                if (distance > maxDistance)
                {
                    continue;
                }

                AnchorSide side = DetermineSide(anchor.Center, text.Center);
                double distanceScore = Clamp01(1.0 - (distance / maxDistance));
                double directionScore = DirectionScore(anchor.BoundingBox, text.Center, side);

                double score =
                    (distanceScore * _config.AnchorDistanceWeight) +
                    (directionScore * _config.AnchorDirectionWeight) +
                    (isBlock ? _config.AnchorBlockBonus : _config.AnchorLineBonus);

                var candidate = new AnchorCandidate
                {
                    Anchor = anchor,
                    Score = score,
                    Distance = distance,
                    Side = side
                };

                if (best == null || candidate.Score > best.Score)
                {
                    best = candidate;
                }
            }

            return best;
        }
        private PlacementDecision ComputePlacement(TextSnapshot text, AnchorCandidate candidate)
        {
            var bounds = candidate.Anchor.BoundingBox;
            double offset = Math.Max(
                _config.MinTextGap,
                Math.Max(text.Height, _config.StandardTextHeight) * _config.AnchorOffsetTextHeightFactor);
            double z = text.Position.Z;

            return candidate.Side switch
            {
                AnchorSide.Right => new PlacementDecision
                {
                    Side = AnchorSide.Right,
                    Location = new Point3d(
                        bounds.MaxPoint.X + offset,
                        Clamp(text.Center.Y, bounds.MinPoint.Y - offset, bounds.MaxPoint.Y + offset),
                        z),
                    Attachment = AttachmentPoint.MiddleLeft,
                    HorizontalMode = TextHorizontalMode.TextLeft,
                    VerticalMode = TextVerticalMode.TextVerticalMid,
                    Rotation = 0
                },
                AnchorSide.Left => new PlacementDecision
                {
                    Side = AnchorSide.Left,
                    Location = new Point3d(
                        bounds.MinPoint.X - offset,
                        Clamp(text.Center.Y, bounds.MinPoint.Y - offset, bounds.MaxPoint.Y + offset),
                        z),
                    Attachment = AttachmentPoint.MiddleRight,
                    HorizontalMode = TextHorizontalMode.TextRight,
                    VerticalMode = TextVerticalMode.TextVerticalMid,
                    Rotation = 0
                },
                AnchorSide.Top => new PlacementDecision
                {
                    Side = AnchorSide.Top,
                    Location = new Point3d(
                        Clamp(text.Center.X, bounds.MinPoint.X - offset, bounds.MaxPoint.X + offset),
                        bounds.MaxPoint.Y + offset,
                        z),
                    Attachment = AttachmentPoint.BottomCenter,
                    HorizontalMode = TextHorizontalMode.TextCenter,
                    VerticalMode = TextVerticalMode.TextBottom,
                    Rotation = 0
                },
                _ => new PlacementDecision
                {
                    Side = AnchorSide.Bottom,
                    Location = new Point3d(
                        Clamp(text.Center.X, bounds.MinPoint.X - offset, bounds.MaxPoint.X + offset),
                        bounds.MinPoint.Y - offset,
                        z),
                    Attachment = AttachmentPoint.TopCenter,
                    HorizontalMode = TextHorizontalMode.TextCenter,
                    VerticalMode = TextVerticalMode.TextTop,
                    Rotation = 0
                }
            };
        }

        private PlacementDecision NudgePlacement(TextSnapshot text, PlacementDecision fullPlacement, double ratio)
        {
            double clamped = Clamp(ratio, 0.0, 1.0);
            var nudgeLocation = new Point3d(
                text.Center.X + ((fullPlacement.Location.X - text.Center.X) * clamped),
                text.Center.Y + ((fullPlacement.Location.Y - text.Center.Y) * clamped),
                text.Position.Z + ((fullPlacement.Location.Z - text.Position.Z) * clamped));

            return new PlacementDecision
            {
                Location = nudgeLocation,
                Side = fullPlacement.Side,
                Attachment = fullPlacement.Attachment,
                HorizontalMode = fullPlacement.HorizontalMode,
                VerticalMode = fullPlacement.VerticalMode,
                Rotation = fullPlacement.Rotation
            };
        }

        private void ApplyPlacement(Database db, Transaction tr, TextSnapshot snapshot, PlacementDecision placement)
        {
            Entity entity = tr.GetObject(snapshot.ObjectId, OpenMode.ForWrite, false) as Entity;
            if (entity == null || entity.IsErased)
            {
                return;
            }

            bool changed = false;

            if (entity is DBText dbText)
            {
                if (!NearlyEqualPoints(dbText.Position, placement.Location))
                {
                    dbText.Position = placement.Location;
                    changed = true;
                }

                if (!NearlyEqualPoints(dbText.AlignmentPoint, placement.Location))
                {
                    dbText.AlignmentPoint = placement.Location;
                    changed = true;
                }

                if (dbText.HorizontalMode != placement.HorizontalMode)
                {
                    dbText.HorizontalMode = placement.HorizontalMode;
                    changed = true;
                }

                if (dbText.VerticalMode != placement.VerticalMode)
                {
                    dbText.VerticalMode = placement.VerticalMode;
                    changed = true;
                }

                if (!NearlyEqual(dbText.Rotation, placement.Rotation))
                {
                    dbText.Rotation = placement.Rotation;
                    changed = true;
                }

                changed |= ApplyTextStyle(dbText);

                if (changed)
                {
                    SafeAdjustDbTextAlignment(dbText, db);
                }
            }
            else if (entity is MText mText)
            {
                if (!NearlyEqualPoints(mText.Location, placement.Location))
                {
                    mText.Location = placement.Location;
                    changed = true;
                }

                if (mText.Attachment != placement.Attachment)
                {
                    mText.Attachment = placement.Attachment;
                    changed = true;
                }

                if (!NearlyEqual(mText.Rotation, placement.Rotation))
                {
                    mText.Rotation = placement.Rotation;
                    changed = true;
                }

                if (mText.Width != 0)
                {
                    mText.Width = 0;
                    changed = true;
                }

                changed |= ApplyTextStyle(mText);
            }

            if (changed)
            {
                _fixedCount++;
            }
        }

        private TextSnapshot BuildTextSnapshot(Transaction tr, ObjectId textId)
        {
            Entity entity = tr.GetObject(textId, OpenMode.ForRead, false) as Entity;
            if (entity == null || entity.IsErased)
            {
                return null;
            }

            try
            {
                Extents3d extents = entity.GeometricExtents;

                if (entity is DBText dbText)
                {
                    string plain = NormalizeTextForPattern(dbText.TextString);
                    return new TextSnapshot
                    {
                        ObjectId = textId,
                        EntityType = EntityType.Text,
                        LayerName = dbText.Layer,
                        ContentRaw = dbText.TextString ?? string.Empty,
                        ContentPlain = plain,
                        Position = dbText.Position,
                        Center = Midpoint(extents),
                        Bounds = extents,
                        Height = Math.Max(0.01, dbText.Height),
                        Rotation = dbText.Rotation,
                        IsAnnotation = IsAnnotationText(plain)
                    };
                }

                if (entity is MText mText)
                {
                    string plain = NormalizeTextForPattern(mText.Contents);
                    return new TextSnapshot
                    {
                        ObjectId = textId,
                        EntityType = EntityType.MText,
                        LayerName = mText.Layer,
                        ContentRaw = mText.Contents ?? string.Empty,
                        ContentPlain = plain,
                        Position = mText.Location,
                        Center = Midpoint(extents),
                        Bounds = extents,
                        Height = Math.Max(0.01, mText.TextHeight),
                        Rotation = mText.Rotation,
                        IsAnnotation = IsAnnotationText(plain)
                    };
                }

                return null;
            }
            catch
            {
                return null;
            }
        }

        private double ScoreDbTextConversion(
            TextSnapshot text,
            IReadOnlyList<EntityInfo> blockAnchors,
            IReadOnlyList<EntityInfo> lineAnchors)
        {
            if (text.EntityType != EntityType.Text)
            {
                return 0;
            }

            if (string.IsNullOrWhiteSpace(text.ContentPlain))
            {
                return 0;
            }

            double score = 0.20;

            if (text.ContentPlain.Length <= 80)
            {
                score += 0.15;
            }

            if (text.IsAnnotation || LooksLikeEquipmentLabel(text.ContentPlain))
            {
                score += 0.20;
            }

            string upperLayer = (text.LayerName ?? string.Empty).ToUpperInvariant();
            if (upperLayer.Contains("TEXT") || upperLayer.Contains("LABEL") || upperLayer.Contains("ANNO"))
            {
                score += 0.15;
            }

            if (upperLayer.Contains("DIM"))
            {
                score -= 0.25;
            }

            AnchorCandidate bestBlock = FindBestAnchor(text, blockAnchors, isBlock: true);
            AnchorCandidate best = bestBlock;

            if (_config.EnableLineworkAnchorFallback && (best == null || best.Score < _config.AnchorMinimumScore))
            {
                AnchorCandidate bestLine = FindBestAnchor(text, lineAnchors, isBlock: false);
                if (bestLine != null && (best == null || bestLine.Score > best.Score))
                {
                    best = bestLine;
                }
            }

            if (best != null)
            {
                score += Clamp01(best.Score) * 0.40;
            }

            return Clamp01(score);
        }

        private bool LooksLikeEquipmentLabel(string content)
        {
            if (string.IsNullOrWhiteSpace(content))
            {
                return false;
            }

            string upper = content.ToUpperInvariant();

            if (Regex.IsMatch(upper, @"\b[A-Z]{1,6}[\-_/]?[0-9]{1,5}[A-Z0-9]*\b"))
            {
                return true;
            }

            return upper.Contains("MCC") || upper.Contains("SWGR") || upper.Contains("PANEL");
        }
        private bool LooksMultiline(string rawContents)
        {
            if (string.IsNullOrEmpty(rawContents))
            {
                return false;
            }

            return rawContents.Contains("\\P") || rawContents.Contains("\n") || rawContents.Contains("\r");
        }

        private string NormalizeTextForPattern(string content)
        {
            if (string.IsNullOrWhiteSpace(content))
            {
                return string.Empty;
            }

            string normalized = content;
            normalized = normalized.Replace("\\P", " ");
            normalized = normalized.Replace("\r", " ").Replace("\n", " ");
            normalized = Regex.Replace(normalized, @"\\[A-Za-z][^;]*;?", " ");
            normalized = normalized.Replace("{", " ").Replace("}", " ");
            normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
            return normalized;
        }

        private bool IsAnnotationText(string content)
        {
            if (string.IsNullOrWhiteSpace(content))
            {
                return false;
            }

            string upper = content.ToUpperInvariant();

            if (Regex.IsMatch(upper, @"\b\d+(\.\d+)?\s*(KV|V|A|AMP|KW|MW|KVA|MVA|PF|FLA)\b"))
            {
                return true;
            }

            return upper.Contains("P.F") || upper.Contains(" PF") || upper.Contains("%");
        }

        private double TargetTextHeight(bool annotation)
        {
            double raw = annotation ? _config.AnnotationTextHeight : _config.StandardTextHeight;
            return Clamp(raw, _config.MinTextHeight, _config.MaxTextHeight);
        }

        private bool ApplyTextHeight(DBText text, double target)
        {
            if (NearlyEqual(text.Height, target))
            {
                return false;
            }

            text.Height = target;
            return true;
        }

        private bool ApplyTextHeight(MText text, double target)
        {
            if (NearlyEqual(text.TextHeight, target))
            {
                return false;
            }

            text.TextHeight = target;
            return true;
        }

        private bool ApplyTextStyle(DBText text)
        {
            if (text.TextStyleId == _standardTextStyleId)
            {
                return false;
            }

            text.TextStyleId = _standardTextStyleId;
            return true;
        }

        private bool ApplyTextStyle(MText text)
        {
            if (text.TextStyleId == _standardTextStyleId)
            {
                return false;
            }

            text.TextStyleId = _standardTextStyleId;
            return true;
        }

        private ObjectId EnsureTextStyleExists(Database db, Transaction tr)
        {
            var styleTable = (TextStyleTable)tr.GetObject(db.TextStyleTableId, OpenMode.ForRead);

            if (!styleTable.Has(_config.StandardTextStyle))
            {
                styleTable.UpgradeOpen();
                var style = new TextStyleTableRecord
                {
                    Name = _config.StandardTextStyle,
                    FileName = _config.StandardFontFile,
                    TextSize = 0
                };

                ObjectId styleId = styleTable.Add(style);
                tr.AddNewlyCreatedDBObject(style, true);

                if (_config.Verbose)
                {
                    var doc = Application.DocumentManager.MdiActiveDocument;
                    doc.Editor.WriteMessage($"\n[TextFixer] Created text style '{_config.StandardTextStyle}'.");
                }

                return styleId;
            }

            return styleTable[_config.StandardTextStyle];
        }

        private BlockTableRecord GetModelSpace(Database db, Transaction tr)
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            return (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);
        }

        private void SafeAdjustDbTextAlignment(DBText text, Database db)
        {
            try
            {
                text.AdjustAlignment(db);
            }
            catch
            {
                // Keep cleanup resilient; invalid text alignment states are skipped.
            }
        }

        private AnchorSide DetermineSide(Point3d anchorCenter, Point3d textCenter)
        {
            double dx = textCenter.X - anchorCenter.X;
            double dy = textCenter.Y - anchorCenter.Y;

            if (Math.Abs(dx) >= Math.Abs(dy))
            {
                return dx >= 0 ? AnchorSide.Right : AnchorSide.Left;
            }

            return dy >= 0 ? AnchorSide.Top : AnchorSide.Bottom;
        }

        private double DirectionScore(Extents3d bounds, Point3d point, AnchorSide side)
        {
            bool outside = side switch
            {
                AnchorSide.Right => point.X >= bounds.MaxPoint.X,
                AnchorSide.Left => point.X <= bounds.MinPoint.X,
                AnchorSide.Top => point.Y >= bounds.MaxPoint.Y,
                _ => point.Y <= bounds.MinPoint.Y
            };

            return outside ? 1.0 : 0.55;
        }

        private Point3d Midpoint(Extents3d bounds)
        {
            return new Point3d(
                (bounds.MinPoint.X + bounds.MaxPoint.X) / 2.0,
                (bounds.MinPoint.Y + bounds.MaxPoint.Y) / 2.0,
                (bounds.MinPoint.Z + bounds.MaxPoint.Z) / 2.0);
        }

        private double DistanceToExtents(Point3d point, Extents3d bounds)
        {
            double dx = 0;
            if (point.X < bounds.MinPoint.X)
            {
                dx = bounds.MinPoint.X - point.X;
            }
            else if (point.X > bounds.MaxPoint.X)
            {
                dx = point.X - bounds.MaxPoint.X;
            }

            double dy = 0;
            if (point.Y < bounds.MinPoint.Y)
            {
                dy = bounds.MinPoint.Y - point.Y;
            }
            else if (point.Y > bounds.MaxPoint.Y)
            {
                dy = point.Y - bounds.MaxPoint.Y;
            }

            return Math.Sqrt((dx * dx) + (dy * dy));
        }

        private double Diagonal(Extents3d bounds)
        {
            double dx = bounds.MaxPoint.X - bounds.MinPoint.X;
            double dy = bounds.MaxPoint.Y - bounds.MinPoint.Y;
            return Math.Sqrt((dx * dx) + (dy * dy));
        }

        private double SnapTextRotation(double rotation, bool allowAggressiveSnap)
        {
            if (_config.RotationSnapDegrees <= 0)
            {
                return rotation;
            }

            double step = DegreesToRadians(_config.RotationSnapDegrees);
            if (step <= 0)
            {
                return rotation;
            }

            double snapped = Math.Round(rotation / step) * step;
            double tolerance = allowAggressiveSnap
                ? DegreesToRadians(45)
                : DegreesToRadians(Math.Max(2.0, _config.TextMergeRotationToleranceDegrees));

            if (Math.Abs(NormalizeAngle(rotation - snapped)) <= tolerance)
            {
                return snapped;
            }

            return rotation;
        }

        private double NormalizeAngle(double radians)
        {
            const double TwoPi = Math.PI * 2.0;
            double angle = radians % TwoPi;
            if (angle > Math.PI)
            {
                angle -= TwoPi;
            }
            else if (angle < -Math.PI)
            {
                angle += TwoPi;
            }

            return angle;
        }

        private double DegreesToRadians(double degrees)
        {
            return degrees * Math.PI / 180.0;
        }

        private bool NearlyEqual(double a, double b, double epsilon = 0.001)
        {
            return Math.Abs(a - b) <= epsilon;
        }

        private bool NearlyEqualPoints(Point3d a, Point3d b, double epsilon = 0.01)
        {
            return Math.Abs(a.X - b.X) <= epsilon && Math.Abs(a.Y - b.Y) <= epsilon;
        }

        private void Trace(string message)
        {
            if (!_config.EnableTextInferenceTrace || _editor == null)
            {
                return;
            }

            if (_traceCount >= Math.Max(0, _config.TextInferenceTraceLimit))
            {
                return;
            }

            _editor.WriteMessage($"\n[TextFixer.Trace] {message}");
            _traceCount++;
        }

        private string Truncate(string value, int maxLen)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= maxLen)
            {
                return value ?? string.Empty;
            }

            if (maxLen <= 3)
            {
                return value.Substring(0, Math.Max(0, maxLen));
            }

            return value.Substring(0, maxLen - 3) + "...";
        }

        private double Clamp(double value, double min, double max)
        {
            if (value < min)
            {
                return min;
            }

            return value > max ? max : value;
        }

        private double Clamp01(double value)
        {
            return Clamp(value, 0, 1);
        }
    }
}
