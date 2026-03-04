import { useState, useCallback } from "react";

const RULES_DB = [
  {
    id: "r1",
    category: "DELETE",
    trigger: { type: "cloud", color: "red", text_contains: "DELETE" },
    action: "Remove all geometry inside the cloud boundary",
    icon: "🔴",
    examples: ["Red cloud around area", "Red X through element"],
    confidence: 0.92,
  },
  {
    id: "r2",
    category: "ADD",
    trigger: { type: "cloud", color: "green", text_contains: "" },
    action: "Add geometry drawn inside green cloud to model",
    icon: "🟢",
    examples: ["Green cloud with new linework", "Green arrow pointing to insertion"],
    confidence: 0.88,
  },
  {
    id: "r3",
    category: "NOTE",
    trigger: { type: "text", color: "blue", text_contains: "" },
    action: "Log as note — do not modify geometry",
    icon: "🔵",
    examples: ["Blue text annotation", "Blue callout box"],
    confidence: 0.95,
  },
  {
    id: "r4",
    category: "SWAP",
    trigger: { type: "arrow", color: "blue", count: 2 },
    action: "Swap the two elements connected by arrows",
    icon: "🔀",
    examples: ["Two blue arrows between components"],
    confidence: 0.75,
  },
  {
    id: "r5",
    category: "TITLE_BLOCK",
    trigger: { type: "rectangle", position: "bottom-right", aspect: "wide" },
    action: "Identify as title block — extract metadata, skip geometry",
    icon: "📋",
    examples: ["Standard ANSI title block", "Company header with rev table"],
    confidence: 0.97,
  },
  {
    id: "r6",
    category: "BLOCK_REF",
    trigger: { type: "symbol", repeated: true, size: "small" },
    action: "Identify as block reference — import from block library",
    icon: "🔲",
    examples: ["Repeated relay symbols", "Standard electrical components"],
    confidence: 0.82,
  },
  {
    id: "r7",
    category: "REVISION_CLOUD",
    trigger: { type: "cloud", color: "any", has_delta: true },
    action: "Mark as revision area — compare with previous version",
    icon: "△",
    examples: ["Cloud with triangle revision marker"],
    confidence: 0.90,
  },
  {
    id: "r8",
    category: "DIMENSION",
    trigger: { type: "line", has_arrows: true, has_text: true },
    action: "Extract dimension value for scale verification",
    icon: "📏",
    examples: ["Dimension line with measurement text"],
    confidence: 0.85,
  },
];

const PIPELINE_STEPS = [
  {
    step: 1,
    name: "Extract Layers",
    desc: "Parse PDF annotations, markup layers, and vector geometry separately",
    detail: "Bluebeam stores markups as PDF annotations (not geometry). Separate: original CAD linework → Layer 0, Bluebeam markups → annotation layer, colors/styles → metadata.",
    tech: "pypdf annotation parsing, /Annots dictionary, appearance streams",
  },
  {
    step: 2,
    name: "Classify Marks",
    desc: "Run each annotation through rule library + ML classifier",
    detail: "For each markup: extract type (cloud, arrow, text, line, rectangle), color, text content, position, size. Match against rules. If no rule matches, use ML vision model to classify.",
    tech: "Rule engine (fast, deterministic) → ML fallback (flexible, learning)",
  },
  {
    step: 3,
    name: "Resolve Context",
    desc: "Determine what geometry each markup refers to",
    detail: "A red cloud means 'delete' — but delete WHAT? Use spatial overlap to find which geometry falls inside the cloud boundary. Arrows point FROM something TO something — trace direction.",
    tech: "Spatial intersection, containment tests, arrow direction parsing",
  },
  {
    step: 4,
    name: "Generate Actions",
    desc: "Convert classified marks into specific CAD operations",
    detail: "DELETE cloud → find enclosed geometry IDs → generate remove commands. ADD cloud → extract new linework → generate create commands. SWAP arrows → identify two targets → generate move commands.",
    tech: "Action queue, dependency resolution, conflict detection",
  },
  {
    step: 5,
    name: "Review & Execute",
    desc: "Show proposed changes for approval, then apply",
    detail: "Never auto-execute destructive operations. Show diff preview: 'Delete 14 lines in area B3-C5? Add 8 new lines from green markup? Swap relay RP1L5-3 with RP1L5-4?'",
    tech: "Preview renderer, undo stack, batch execution",
  },
];

const TRAINING_APPROACH = [
  {
    phase: "Phase 1 — Rule Library (Now)",
    items: [
      "Hand-code rules for YOUR specific markup conventions",
      "Color → action mapping (red=delete, green=add, blue=note)",
      "Shape → type mapping (cloud=area, arrow=reference, text=note)",
      "Position → role mapping (bottom-right=title block)",
      "Start with 10-20 rules that cover 80% of your markups",
    ],
    effort: "1-2 weeks",
  },
  {
    phase: "Phase 2 — Template Matching (Month 1-2)",
    items: [
      "Screenshot your common markup patterns",
      "Build a template library: 'this pattern = DELETE command'",
      "Use image similarity (SSIM/template matching) not full ML",
      "Works for standardized symbols (revision triangles, block refs)",
      "Low training data needed: 5-10 examples per pattern",
    ],
    effort: "2-4 weeks",
  },
  {
    phase: "Phase 3 — Vision Model Classification (Month 2-4)",
    items: [
      "Feed cropped markup regions to Claude/GPT-4V for classification",
      "Prompt: 'What action does this markup indicate? Options: delete/add/note/swap/dimension'",
      "Use API with structured output for consistent parsing",
      "Handles ambiguous or novel markup styles",
      "No training needed — uses pre-trained vision understanding",
    ],
    effort: "2-3 weeks",
  },
  {
    phase: "Phase 4 — Fine-Tuned Model (Month 4+)",
    items: [
      "Collect corrections: when the system gets it wrong, log the fix",
      "Build training dataset from real markup → action pairs",
      "Fine-tune a small classifier (ResNet/EfficientNet) on YOUR data",
      "Runs locally, fast inference, no API costs",
      "Continuously improves as you correct more examples",
    ],
    effort: "Ongoing",
  },
];

// Color palette
const C = {
  bg: "#0a0e17",
  surface: "#111827",
  surface2: "#1a2235",
  border: "#2a3650",
  accent: "#3b82f6",
  accent2: "#10b981",
  warn: "#f59e0b",
  danger: "#ef4444",
  text: "#e2e8f0",
  muted: "#64748b",
  dim: "#475569",
};

function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedRule, setExpandedRule] = useState(null);
  const [expandedPhase, setExpandedPhase] = useState(0);

  const tabs = [
    { id: "overview", label: "Architecture", icon: "◆" },
    { id: "rules", label: "Rule Library", icon: "⚙" },
    { id: "pipeline", label: "Pipeline", icon: "▸" },
    { id: "training", label: "Training Path", icon: "◎" },
  ];

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'IBM Plex Sans', 'SF Pro', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 32px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px" }}>
            Markup Recognition Engine
          </span>
          <span style={{ color: C.muted, fontSize: 14 }}>
            Bluebeam PDF → Automated CAD Actions
          </span>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
          System architecture for recognizing Bluebeam markup annotations and converting them
          into deterministic CAD operations. Rule-based core with ML fallback for novel patterns.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, padding: "0 32px" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: "none", border: "none", color: activeTab === t.id ? C.accent : C.muted,
              padding: "14px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
              transition: "all 0.2s",
              fontFamily: "inherit",
            }}
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "rules" && <RulesTab expanded={expandedRule} setExpanded={setExpandedRule} />}
        {activeTab === "pipeline" && <PipelineTab />}
        {activeTab === "training" && <TrainingTab expanded={expandedPhase} setExpanded={setExpandedPhase} />}
      </div>
    </div>
  );
}

function OverviewTab() {
  return (
    <div>
      <SectionTitle>How It Works</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
        <Card accent={C.accent}>
          <CardIcon>📄</CardIcon>
          <CardTitle>Layer 1: Original Drawing</CardTitle>
          <CardBody>
            The base CAD geometry exported to PDF — lines, polylines, blocks.
            This is what the current v5 script extracts. Lives in the PDF content stream.
          </CardBody>
        </Card>
        <Card accent={C.warn}>
          <CardIcon>✏️</CardIcon>
          <CardTitle>Layer 2: Bluebeam Markups</CardTitle>
          <CardBody>
            Annotations added in Bluebeam — clouds, arrows, text, highlights.
            Stored as PDF /Annots objects, separate from geometry. Each has color, type, and content.
          </CardBody>
        </Card>
        <Card accent={C.accent2}>
          <CardIcon>⚡</CardIcon>
          <CardTitle>Layer 3: Actions</CardTitle>
          <CardBody>
            The rule engine interprets markups as commands: delete, add, swap, note.
            Generates a queue of CAD operations that modify the base drawing.
          </CardBody>
        </Card>
      </div>

      <SectionTitle>Data Flow</SectionTitle>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 24, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
        lineHeight: 2.0, color: C.muted,
      }}>
        <span style={{ color: C.text }}>Bluebeam PDF</span>
        <br />
        {"  ├── "}<span style={{ color: C.accent }}>Content Stream</span>{" → extract_paths() → lines, polylines → AutoCAD geometry"}
        <br />
        {"  ├── "}<span style={{ color: C.warn }}>/Annots Dictionary</span>{" → extract_markups() → clouds, arrows, text, highlights"}
        <br />
        {"  │     ├── "}<span style={{ color: C.danger }}>Color=Red</span>{" → Rule: DELETE enclosed geometry"}
        <br />
        {"  │     ├── "}<span style={{ color: C.accent2 }}>Color=Green</span>{" → Rule: ADD new geometry from markup"}
        <br />
        {"  │     ├── "}<span style={{ color: C.accent }}>Color=Blue</span>{" → Rule: NOTE — log, don't modify"}
        <br />
        {"  │     ├── "}<span style={{ color: "#a855f7" }}>Cloud shape</span>{" → Area selector — find enclosed objects"}
        <br />
        {"  │     ├── "}<span style={{ color: "#a855f7" }}>Arrow shape</span>{" → Reference pointer — follow direction"}
        <br />
        {"  │     └── "}<span style={{ color: "#a855f7" }}>Text content</span>{" → Parse for keywords, dimensions, labels"}
        <br />
        {"  └── "}<span style={{ color: C.accent2 }}>Rule Engine</span>{" → match(markup, rules) → action_queue → execute"}
        <br />
        {"        └── "}<span style={{ color: C.dim }}>ML Fallback</span>{" → vision_classify(markup_image) → predicted_action"}
      </div>

      <SectionTitle style={{ marginTop: 32 }}>Key Insight: Bluebeam Stores Markups as Annotations</SectionTitle>
      <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.8, maxWidth: 800 }}>
        <p>
          This is the critical technical detail that makes everything possible. When someone draws a red cloud
          in Bluebeam, it's <strong style={{ color: C.text }}>NOT</strong> mixed into the drawing geometry.
          It's stored in the PDF's <code style={{ background: C.surface2, padding: "2px 6px", borderRadius: 3 }}>/Annots</code> array
          as a separate annotation object with its own properties:
        </p>
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: 16, marginTop: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
        }}>
          {`/Type /Annot\n/Subtype /Polygon          ← cloud, rectangle, arrow, etc.\n/C [1 0 0]                 ← color: RGB red\n/Vertices [x1 y1 x2 y2...]← boundary coordinates\n/Contents (DELETE THIS)    ← text content\n/Subj (Cloud)              ← Bluebeam markup type\n/T (Andrew Simmons)        ← who made the markup`}
        </div>
        <p style={{ marginTop: 16 }}>
          This means we can extract ALL markups separately from the drawing, classify each one,
          and determine what action it represents — without any image processing at all for the
          initial rule-based system.
        </p>
      </div>
    </div>
  );
}

function RulesTab({ expanded, setExpanded }) {
  const categories = [...new Set(RULES_DB.map((r) => r.category))];
  const catColors = { DELETE: C.danger, ADD: C.accent2, NOTE: C.accent, SWAP: "#a855f7", TITLE_BLOCK: C.warn, BLOCK_REF: C.dim, REVISION_CLOUD: C.warn, DIMENSION: C.muted };

  return (
    <div>
      <SectionTitle>Rule Library</SectionTitle>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Each rule maps a markup pattern (trigger) to a CAD action. Rules are checked in order —
        first match wins. You'll build this library from YOUR specific conventions.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RULES_DB.map((rule) => {
          const isOpen = expanded === rule.id;
          const catColor = catColors[rule.category] || C.muted;
          return (
            <div
              key={rule.id}
              onClick={() => setExpanded(isOpen ? null : rule.id)}
              style={{
                background: C.surface, border: `1px solid ${isOpen ? catColor : C.border}`,
                borderRadius: 8, padding: "14px 20px", cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>{rule.icon}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "3px 8px",
                  borderRadius: 4, background: catColor + "20", color: catColor,
                }}>
                  {rule.category}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{rule.action}</span>
                <span style={{ fontSize: 11, color: C.dim }}>
                  {(rule.confidence * 100).toFixed(0)}% conf
                </span>
                <span style={{ color: C.dim, fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
                    <div>
                      <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>TRIGGER</div>
                      <code style={{ color: C.accent, fontSize: 12, background: C.surface2, padding: "8px 12px", borderRadius: 4, display: "block" }}>
                        {JSON.stringify(rule.trigger, null, 2)}
                      </code>
                    </div>
                    <div>
                      <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>EXAMPLES</div>
                      {rule.examples.map((ex, i) => (
                        <div key={i} style={{ color: C.muted, padding: "4px 0", fontSize: 12 }}>
                          • {ex}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 24, background: C.surface2, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: 20,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.warn }}>
          ⚠ Your Rules Will Be Custom
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Every company has different markup conventions. The rules above are examples —
          you'd build YOUR library by processing your first 10-20 marked-up PDFs and encoding
          the patterns. The rule format is simple JSON so non-programmers can add rules through
          a config file. ML handles edge cases where rules don't match.
        </div>
      </div>
    </div>
  );
}

function PipelineTab() {
  return (
    <div>
      <SectionTitle>Processing Pipeline</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step.step} style={{ display: "flex", gap: 20 }}>
            {/* Timeline */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 40 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: C.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}>
                {step.step}
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div style={{ width: 2, flex: 1, background: C.border, minHeight: 20 }} />
              )}
            </div>
            {/* Content */}
            <div style={{
              flex: 1, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "16px 20px", marginBottom: 12,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{step.name}</div>
              <div style={{ fontSize: 13, color: C.accent2, marginBottom: 8 }}>{step.desc}</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 8 }}>
                {step.detail}
              </div>
              <code style={{
                fontSize: 11, color: C.dim, background: C.surface2,
                padding: "4px 8px", borderRadius: 4,
              }}>
                {step.tech}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainingTab({ expanded, setExpanded }) {
  const phaseColors = [C.accent, C.accent2, C.warn, "#a855f7"];
  return (
    <div>
      <SectionTitle>Training & Implementation Path</SectionTitle>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Start simple with rules, add ML incrementally. Each phase builds on the previous
        and can run in production independently.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {TRAINING_APPROACH.map((phase, i) => {
          const isOpen = expanded === i;
          const color = phaseColors[i];
          return (
            <div
              key={i}
              onClick={() => setExpanded(isOpen ? null : i)}
              style={{
                background: C.surface, border: `1px solid ${isOpen ? color : C.border}`,
                borderRadius: 8, padding: "16px 20px", cursor: "pointer",
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, background: color + "25",
                  color: color, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{phase.phase}</div>
                </div>
                <span style={{
                  fontSize: 11, color: C.dim, background: C.surface2,
                  padding: "3px 8px", borderRadius: 4,
                }}>
                  {phase.effort}
                </span>
                <span style={{ color: C.dim, fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  {phase.items.map((item, j) => (
                    <div key={j} style={{
                      fontSize: 13, color: C.muted, padding: "5px 0", paddingLeft: 40,
                      lineHeight: 1.5, position: "relative",
                    }}>
                      <span style={{
                        position: "absolute", left: 20, color: color, fontWeight: 700,
                      }}>
                        →
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 28, background: `linear-gradient(135deg, ${C.surface}, ${C.surface2})`,
        border: `1px solid ${C.accent}40`, borderRadius: 8, padding: 24,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: C.accent }}>
          The Feedback Loop That Makes It Smart
        </div>
        <div style={{
          fontSize: 13, color: C.muted, lineHeight: 1.8,
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {"1. System processes markup → proposes action"}<br />
          {"2. You review: ✓ correct  or  ✗ wrong (provide correction)"}<br />
          {"3. If wrong → auto-generates new rule from your correction"}<br />
          {"4. New rule added to library → tested on historical markups"}<br />
          {"5. After 50+ corrections → enough data to train classifier"}<br />
          {"6. Classifier handles ambiguous cases, rules handle clear ones"}<br />
          {"7. Accuracy climbs: 70% → 85% → 92% → 96% over months"}
        </div>
      </div>
    </div>
  );
}

// --- Shared components ---
function SectionTitle({ children, style = {} }) {
  return (
    <div style={{
      fontSize: 18, fontWeight: 700, marginBottom: 16, letterSpacing: "-0.3px",
      paddingBottom: 8, borderBottom: `1px solid ${C.border}`, ...style,
    }}>
      {children}
    </div>
  );
}

function Card({ children, accent = C.accent }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: 20, borderTop: `3px solid ${accent}`,
    }}>
      {children}
    </div>
  );
}

function CardIcon({ children }) {
  return <div style={{ fontSize: 24, marginBottom: 10 }}>{children}</div>;
}

function CardTitle({ children }) {
  return <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{children}</div>;
}

function CardBody({ children }) {
  return <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{children}</div>;
}

export default App;
