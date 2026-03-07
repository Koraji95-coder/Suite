using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace EtapDxfCleanup.Models
{
    /// <summary>
    /// Wraps an AutoCAD entity with its computed bounding box for spatial operations.
    /// This is the core data structure used by the overlap resolver and spatial index.
    /// </summary>
    public class EntityInfo
    {
        public ObjectId ObjectId { get; set; }
        public Extents3d BoundingBox { get; set; }
        public EntityType EntityType { get; set; }
        public string LayerName { get; set; }
        public string TextContent { get; set; }   // For text entities
        public string BlockName { get; set; }      // For block references
        public Point3d Position { get; set; }
        public double Rotation { get; set; }
        public double Width => BoundingBox.MaxPoint.X - BoundingBox.MinPoint.X;
        public double Height => BoundingBox.MaxPoint.Y - BoundingBox.MinPoint.Y;
        public Point3d Center => new Point3d(
            (BoundingBox.MinPoint.X + BoundingBox.MaxPoint.X) / 2.0,
            (BoundingBox.MinPoint.Y + BoundingBox.MaxPoint.Y) / 2.0,
            0);

        /// <summary>
        /// Returns a padded bounding box for overlap detection.
        /// </summary>
        public Extents3d GetPaddedBounds(double padding)
        {
            return new Extents3d(
                new Point3d(
                    BoundingBox.MinPoint.X - padding,
                    BoundingBox.MinPoint.Y - padding,
                    0),
                new Point3d(
                    BoundingBox.MaxPoint.X + padding,
                    BoundingBox.MaxPoint.Y + padding,
                    0));
        }

        /// <summary>
        /// Checks if this entity's bounding box intersects another.
        /// </summary>
        public bool Intersects(EntityInfo other, double padding = 0)
        {
            var a = GetPaddedBounds(padding);
            var b = other.GetPaddedBounds(padding);

            return a.MinPoint.X <= b.MaxPoint.X &&
                   a.MaxPoint.X >= b.MinPoint.X &&
                   a.MinPoint.Y <= b.MaxPoint.Y &&
                   a.MaxPoint.Y >= b.MinPoint.Y;
        }
    }

    public enum EntityType
    {
        Text,
        MText,
        BlockReference,
        Line,
        Polyline,
        Circle,
        Arc,
        Dimension,
        Leader,
        Other
    }
}
