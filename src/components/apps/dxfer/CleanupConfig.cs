namespace EtapDxfCleanup.Models
{
    public enum LowConfidenceBehavior
    {
        LeaveInPlace = 0,
        NudgeTowardAnchor = 1,
        ForceAnchor = 2
    }

    /// <summary>
    /// All tunable parameters for the ETAP DXF cleanup process.
    /// Adjust these values based on your ETAP export settings and drawing scale.
    /// </summary>
    public class CleanupConfig
    {
        // Text settings
        public double StandardTextHeight { get; set; } = 2.5;
        public double AnnotationTextHeight { get; set; } = 1.8;
        public double MinTextHeight { get; set; } = 1.0;
        public double MaxTextHeight { get; set; } = 10.0;
        public string StandardTextStyle { get; set; } = "ETAP_STANDARD";
        public string StandardFontFile { get; set; } = "simplex.shx";

        // DBText -> MText inference settings
        public bool EnableDbTextToMTextConversion { get; set; } = true;
        public double DbTextToMTextConfidenceThreshold { get; set; } = 0.60;

        // Conservative text merge settings
        public bool EnableConservativeTextMerge { get; set; } = true;
        public double TextMergeXToleranceFactor { get; set; } = 1.25;
        public double TextMergeLineGapMinFactor { get; set; } = 0.45;
        public double TextMergeLineGapMaxFactor { get; set; } = 2.60;
        public double TextMergeRotationToleranceDegrees { get; set; } = 10.0;

        // Anchor scoring and placement settings
        public double AnchorBlockBonus { get; set; } = 0.25;
        public double AnchorLineBonus { get; set; } = 0.02;
        public double AnchorDistanceWeight { get; set; } = 0.70;
        public double AnchorDirectionWeight { get; set; } = 0.30;
        public double AnchorMinimumScore { get; set; } = 0.55;
        public double AnchorMaxDistanceFactor { get; set; } = 6.0;
        public double AnchorMinSizeFloor { get; set; } = 4.0;
        public double AnchorOffsetTextHeightFactor { get; set; } = 0.60;
        public bool EnableLineworkAnchorFallback { get; set; } = true;
        public LowConfidenceBehavior LowConfidenceBehavior { get; set; } = LowConfidenceBehavior.LeaveInPlace;

        // Protected text exclusions
        public bool EnableProtectedTextExclusions { get; set; } = true;
        public string[] ProtectedTextLayerPatterns { get; set; } =
            { "DEFPOINTS", "*TITLE*", "*TBLOCK*", "*BORDER*", "*SHEET*", "*DIM*", "*VIEWPORT*", "*XREF*" };
        public string[] ProtectedTextContentPatterns { get; set; } =
            {
                "*DO NOT SCALE*",
                "*DRAWN BY*",
                "*CHECKED BY*",
                "*APPROVED BY*",
                "*REVISION*",
                "*REV.*",
                "*DWG NO*",
                "*SHEET * OF *"
            };

        // Inference trace/debug settings
        public bool EnableTextInferenceTrace { get; set; } = false;
        public int TextInferenceTraceLimit { get; set; } = 300;

        // Overlap resolution settings
        public double MinTextGap { get; set; } = 1.5;
        public double MinTextToLineGap { get; set; } = 1.0;
        public double NudgeDistance { get; set; } = 2.0;
        public int MaxNudgeIterations { get; set; } = 10;
        public double BoundingBoxPadding { get; set; } = 0.5;

        // Block settings
        public double StandardBlockScale { get; set; } = 1.0;
        public double ScaleTolerance { get; set; } = 0.05;
        public double RotationSnapDegrees { get; set; } = 90.0;

        // Layer mapping
        public string BusLayer { get; set; } = "E-BUSES";
        public string CableLayer { get; set; } = "E-CABLES";
        public string EquipmentLayer { get; set; } = "E-EQUIPMENT";
        public string TextLabelLayer { get; set; } = "E-TEXT-LABELS";
        public string AnnotationLayer { get; set; } = "E-ANNOTATIONS";
        public string DimensionLayer { get; set; } = "E-DIMENSIONS";

        // ETAP pattern hints
        public string[] TransformerBlockPatterns { get; set; } =
            { "XFMR", "TRANS", "XF_", "TRANSFORMER" };

        public string[] BreakerBlockPatterns { get; set; } =
            { "BRK", "CB_", "BREAKER", "CIRCUIT_BREAKER" };

        public string[] MotorBlockPatterns { get; set; } =
            { "MOT", "MOTOR", "MTR_", "INDUCTION" };

        public string[] GeneratorBlockPatterns { get; set; } =
            { "GEN", "GENERATOR", "GENSET" };

        public string[] BusBlockPatterns { get; set; } =
            { "BUS", "BUSBAR", "SWGR", "SWITCHGEAR", "MCC" };

        // General
        public bool Verbose { get; set; } = true;
        public bool WrapInUndoGroup { get; set; } = true;
    }
}
