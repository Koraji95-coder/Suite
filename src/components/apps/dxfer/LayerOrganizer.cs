using System;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;
using EtapDxfCleanup.Models;

namespace EtapDxfCleanup.Core
{
    /// <summary>
    /// Reorganizes entities into logical layers based on their type and content.
    /// ETAP exports often dump everything onto layer 0 or a handful of generic layers.
    /// This creates a proper layer structure for engineering drawings.
    /// </summary>
    public class LayerOrganizer
    {
        private readonly CleanupConfig _config;
        private readonly BlockFixer _blockFixer;
        private int _movedCount;

        /// <summary>
        /// Layer definitions: name, color index, lineweight, description.
        /// </summary>
        private struct LayerDef
        {
            public string Name;
            public short ColorIndex;
            public LineWeight Lineweight;
            public string Description;
        }

        public LayerOrganizer(CleanupConfig config, BlockFixer blockFixer)
        {
            _config = config;
            _blockFixer = blockFixer;
        }

        /// <summary>
        /// Creates all target layers and moves entities to them.
        /// </summary>
        public int OrganizeAll(Database db, Transaction tr, List<EntityInfo> entities)
        {
            _movedCount = 0;
            var doc = Application.DocumentManager.MdiActiveDocument;

            // Create the layer structure
            CreateLayers(db, tr);

            if (_config.Verbose)
                doc.Editor.WriteMessage(
                    $"\n[LayerOrganizer] Assigning {entities.Count} entities to layers...");

            foreach (var info in entities)
            {
                string targetLayer = DetermineTargetLayer(info);
                if (targetLayer == null) continue;

                // Skip if already on the correct layer
                if (string.Equals(info.LayerName, targetLayer, StringComparison.OrdinalIgnoreCase))
                    continue;

                Entity ent = tr.GetObject(info.ObjectId, OpenMode.ForWrite) as Entity;
                if (ent == null) continue;

                ent.Layer = targetLayer;
                info.LayerName = targetLayer;
                _movedCount++;
            }

            if (_config.Verbose)
                doc.Editor.WriteMessage(
                    $"\n[LayerOrganizer] Moved {_movedCount} entities to proper layers.");

            return _movedCount;
        }

        /// <summary>
        /// Creates all the standard layers for an ETAP SLD drawing.
        /// Uses industry-standard color conventions.
        /// </summary>
        private void CreateLayers(Database db, Transaction tr)
        {
            var layers = new LayerDef[]
            {
                new LayerDef {
                    Name = _config.BusLayer,
                    ColorIndex = 1,    // Red — buses/busbars
                    Lineweight = LineWeight.LineWeight050,
                    Description = "Busbars and bus sections"
                },
                new LayerDef {
                    Name = _config.CableLayer,
                    ColorIndex = 3,    // Green — cables/conductors
                    Lineweight = LineWeight.LineWeight030,
                    Description = "Cables and conductors"
                },
                new LayerDef {
                    Name = _config.EquipmentLayer,
                    ColorIndex = 5,    // Blue — equipment symbols
                    Lineweight = LineWeight.LineWeight035,
                    Description = "Equipment blocks (transformers, breakers, motors)"
                },
                new LayerDef {
                    Name = _config.TextLabelLayer,
                    ColorIndex = 7,    // White — primary labels
                    Lineweight = LineWeight.LineWeight018,
                    Description = "Equipment ID labels and names"
                },
                new LayerDef {
                    Name = _config.AnnotationLayer,
                    ColorIndex = 8,    // Gray — secondary annotations
                    Lineweight = LineWeight.LineWeight013,
                    Description = "Voltage, current, PF, and other data annotations"
                },
                new LayerDef {
                    Name = _config.DimensionLayer,
                    ColorIndex = 2,    // Yellow — dimensions
                    Lineweight = LineWeight.LineWeight013,
                    Description = "Dimensions and leaders"
                }
            };

            LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForWrite) as LayerTable;

            foreach (var layerDef in layers)
            {
                if (lt.Has(layerDef.Name)) continue;

                LayerTableRecord ltr = new LayerTableRecord
                {
                    Name = layerDef.Name,
                    Color = Color.FromColorIndex(ColorMethod.ByAci, layerDef.ColorIndex),
                    LineWeight = layerDef.Lineweight,
                    Description = layerDef.Description
                };

                lt.Add(ltr);
                tr.AddNewlyCreatedDBObject(ltr, true);
            }
        }

        /// <summary>
        /// Determines which layer an entity should be on based on its type,
        /// content, and current layer name.
        /// </summary>
        private string DetermineTargetLayer(EntityInfo info)
        {
            switch (info.EntityType)
            {
                case EntityType.Text:
                case EntityType.MText:
                    return ClassifyTextLayer(info);

                case EntityType.BlockReference:
                    return ClassifyBlockLayer(info);

                case EntityType.Line:
                case EntityType.Polyline:
                    return ClassifyLineworkLayer(info);

                case EntityType.Dimension:
                case EntityType.Leader:
                    return _config.DimensionLayer;

                default:
                    return null; // Leave on current layer
            }
        }

        /// <summary>
        /// Classifies text as either a primary label or an annotation.
        /// </summary>
        private string ClassifyTextLayer(EntityInfo info)
        {
            if (string.IsNullOrWhiteSpace(info.TextContent))
                return _config.TextLabelLayer;

            string upper = info.TextContent.ToUpperInvariant();

            // Annotation patterns (values, measurements)
            if (upper.Contains("KV") || upper.Contains(" V") ||
                upper.Contains(" A") || upper.Contains("AMP") ||
                upper.Contains("PF") || upper.Contains("P.F.") ||
                upper.Contains("KW") || upper.Contains("MW") ||
                upper.Contains("KVA") || upper.Contains("MVA") ||
                upper.Contains("%") || upper.Contains("FLA"))
            {
                return _config.AnnotationLayer;
            }

            // Primary label (equipment IDs, names)
            return _config.TextLabelLayer;
        }

        /// <summary>
        /// Classifies a block reference based on its block name.
        /// </summary>
        private string ClassifyBlockLayer(EntityInfo info)
        {
            string category = _blockFixer.CategorizeBlock(info.BlockName);

            switch (category)
            {
                case "BUS":
                    return _config.BusLayer;
                case "TRANSFORMER":
                case "BREAKER":
                case "MOTOR":
                case "GENERATOR":
                case "EQUIPMENT":
                    return _config.EquipmentLayer;
                default:
                    return _config.EquipmentLayer;
            }
        }

        /// <summary>
        /// Classifies linework based on properties and context.
        /// Thick/colored lines are likely buses; thinner lines are cables.
        /// </summary>
        private string ClassifyLineworkLayer(EntityInfo info)
        {
            string upper = (info.LayerName ?? "").ToUpperInvariant();

            // Check existing layer name for clues
            if (upper.Contains("BUS") || upper.Contains("SWGR"))
                return _config.BusLayer;
            if (upper.Contains("CABLE") || upper.Contains("WIRE") || upper.Contains("COND"))
                return _config.CableLayer;

            // Default: assume cable (more common than bus)
            return _config.CableLayer;
        }
    }
}
