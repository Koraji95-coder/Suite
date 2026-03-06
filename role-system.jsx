import { useState } from "react";

// ─── SVG ROLE ICONS ───
// Pixel-art admin crown faithful to the RSPS dark blue crown
const AdminCrown = ({ size = 16 }) => (
  <svg viewBox="0 0 16 14" width={size} height={size * 0.875} style={{ display: "block" }}>
    {/* Dark base shadow */}
    <rect x="3" y="11" width="10" height="2" fill="#0a0e1e" />
    <rect x="2" y="10" width="12" height="1" fill="#0d1229" />
    {/* Crown band */}
    <rect x="2" y="8" width="12" height="2" fill="#1a237e" />
    <rect x="3" y="8" width="10" height="1" fill="#283593" />
    {/* Crown band highlight */}
    <rect x="4" y="8" width="2" height="1" fill="#3949ab" />
    <rect x="7" y="8" width="2" height="1" fill="#3949ab" />
    <rect x="10" y="8" width="2" height="1" fill="#3949ab" />
    {/* Crown points */}
    <rect x="2" y="5" width="2" height="3" fill="#1a237e" />
    <rect x="5" y="6" width="2" height="2" fill="#1a237e" />
    <rect x="7" y="4" width="2" height="4" fill="#1a237e" />
    <rect x="9" y="6" width="2" height="2" fill="#1a237e" />
    <rect x="12" y="5" width="2" height="3" fill="#1a237e" />
    {/* Point tips */}
    <rect x="2" y="3" width="2" height="2" fill="#283593" />
    <rect x="7" y="2" width="2" height="2" fill="#283593" />
    <rect x="12" y="3" width="2" height="2" fill="#283593" />
    {/* Jewel highlights */}
    <rect x="3" y="4" width="1" height="1" fill="#42a5f5" />
    <rect x="7" y="2" width="1" height="1" fill="#64b5f6" />
    <rect x="8" y="3" width="1" height="1" fill="#42a5f5" />
    <rect x="13" y="4" width="1" height="1" fill="#42a5f5" />
    {/* Top pixel sparkle */}
    <rect x="7" y="1" width="1" height="1" fill="#90caf9" opacity="0.8" />
    <rect x="3" y="3" width="1" height="1" fill="#90caf9" opacity="0.6" />
    <rect x="12" y="3" width="1" height="1" fill="#90caf9" opacity="0.6" />
  </svg>
);

// Gold owner crown — more ornate
const OwnerCrown = ({ size = 16 }) => (
  <svg viewBox="0 0 16 14" width={size} height={size * 0.875} style={{ display: "block" }}>
    <rect x="3" y="11" width="10" height="2" fill="#5d3a00" />
    <rect x="2" y="9" width="12" height="2" fill="#b8860b" />
    <rect x="3" y="9" width="10" height="1" fill="#daa520" />
    <rect x="5" y="9" width="1" height="1" fill="#ff6b6b" />
    <rect x="7" y="9" width="2" height="1" fill="#ff6b6b" />
    <rect x="10" y="9" width="1" height="1" fill="#ff6b6b" />
    <rect x="2" y="5" width="2" height="4" fill="#b8860b" />
    <rect x="7" y="3" width="2" height="6" fill="#b8860b" />
    <rect x="12" y="5" width="2" height="4" fill="#b8860b" />
    <rect x="5" y="7" width="2" height="2" fill="#b8860b" />
    <rect x="9" y="7" width="2" height="2" fill="#b8860b" />
    <rect x="2" y="3" width="2" height="2" fill="#daa520" />
    <rect x="7" y="1" width="2" height="2" fill="#daa520" />
    <rect x="12" y="3" width="2" height="2" fill="#daa520" />
    <rect x="3" y="3" width="1" height="1" fill="#ffd700" />
    <rect x="8" y="1" width="1" height="1" fill="#ffd700" />
    <rect x="13" y="3" width="1" height="1" fill="#ffd700" />
    <rect x="7" y="0" width="1" height="1" fill="#fff8dc" opacity="0.9" />
    <rect x="2" y="2" width="1" height="1" fill="#fff8dc" opacity="0.6" />
    <rect x="13" y="2" width="1" height="1" fill="#fff8dc" opacity="0.6" />
  </svg>
);

// Moderator star badge
const ModStar = ({ size = 16 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} style={{ display: "block" }}>
    <polygon points="8,1 10,6 15,6.5 11.5,10 12.5,15 8,12.5 3.5,15 4.5,10 1,6.5 6,6" fill="#9e9e9e" />
    <polygon points="8,2.5 9.5,6.2 13.5,6.8 10.7,9.8 11.5,13.5 8,11.8 4.5,13.5 5.3,9.8 2.5,6.8 6.5,6.2" fill="#bdbdbd" />
    <polygon points="8,4 9.2,6.8 12,7.2 10,9.3 10.5,12 8,10.8 5.5,12 6,9.3 4,7.2 6.8,6.8" fill="#e0e0e0" />
    <circle cx="8" cy="8" r="1.5" fill="#f5f5f5" />
  </svg>
);

// Helper / support wrench
const HelperWrench = ({ size = 16 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" style={{ display: "block" }}>
    <path d="M10.5 2C9 2 7.7 3 7.2 4.3L3.5 8l-1 1 2.5 2.5 1-1 3.7-3.7C11 6.3 12 5 12 3.5c0-.3 0-.5-.1-.8l-2 2L8.5 3.4l2-2c-.3-.1-.5-.1-.8-.1h.8z" stroke="#4fc3f7" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12l-1.5 1.5" stroke="#4fc3f7" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="3" cy="13" r="0.8" fill="#4fc3f7" />
  </svg>
);

// VIP diamond
const VipDiamond = ({ size = 16 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} style={{ display: "block" }}>
    <polygon points="8,1 14,6 8,15 2,6" fill="#7c4dff" />
    <polygon points="8,1 11,6 8,15" fill="#651fff" />
    <polygon points="8,1 5,6 8,6 11,6" fill="#b388ff" />
    <polygon points="8,1 8,6 11,6" fill="#9c6bff" />
    <line x1="5" y1="6" x2="8" y2="15" stroke="#d1c4e9" strokeWidth="0.3" opacity="0.5" />
    <line x1="11" y1="6" x2="8" y2="15" stroke="#d1c4e9" strokeWidth="0.3" opacity="0.5" />
  </svg>
);

// Regular user — simple person silhouette
const UserIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" style={{ display: "block" }}>
    <circle cx="8" cy="5.5" r="2.8" stroke="#78909c" strokeWidth="1.3" />
    <path d="M3 14.5c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#78909c" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

// Donator — heart coin
const DonatorHeart = ({ size = 16 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} style={{ display: "block" }}>
    <circle cx="8" cy="8" r="6.5" fill="#2e7d32" stroke="#4caf50" strokeWidth="0.8" />
    <circle cx="8" cy="8" r="5" fill="#388e3c" />
    <path d="M8 11.5s-3.2-2.2-3.2-4.2c0-1.2 1-1.9 1.8-1.9.7 0 1.1.3 1.4.8.3-.5.7-.8 1.4-.8.8 0 1.8.7 1.8 1.9 0 2-3.2 4.2-3.2 4.2z" fill="#66bb6a" />
  </svg>
);

// Dev — code brackets
const DevIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" style={{ display: "block" }}>
    <path d="M5.5 3.5L2 8l3.5 4.5" stroke="#ff7043" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 3.5L14 8l-3.5 4.5" stroke="#ff7043" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="9" y1="2.5" x2="7" y2="13.5" stroke="#ffab91" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

// ─── ROLE DEFINITIONS ───
const ROLES = [
  {
    id: "owner",
    label: "Owner",
    icon: OwnerCrown,
    color: "#ffd700",
    bg: "rgba(255,215,0,0.08)",
    border: "rgba(255,215,0,0.2)",
    desc: "Server owner with full control",
    level: 100,
  },
  {
    id: "admin",
    label: "Admin",
    icon: AdminCrown,
    color: "#5c6bc0",
    bg: "rgba(92,107,192,0.08)",
    border: "rgba(92,107,192,0.25)",
    desc: "Full administrative privileges",
    level: 90,
  },
  {
    id: "developer",
    label: "Developer",
    icon: DevIcon,
    color: "#ff7043",
    bg: "rgba(255,112,67,0.08)",
    border: "rgba(255,112,67,0.2)",
    desc: "Server developer access",
    level: 85,
  },
  {
    id: "moderator",
    label: "Moderator",
    icon: ModStar,
    color: "#bdbdbd",
    bg: "rgba(189,189,189,0.06)",
    border: "rgba(189,189,189,0.15)",
    desc: "Community moderation tools",
    level: 70,
  },
  {
    id: "helper",
    label: "Helper",
    icon: HelperWrench,
    color: "#4fc3f7",
    bg: "rgba(79,195,247,0.08)",
    border: "rgba(79,195,247,0.2)",
    desc: "Assists staff & new players",
    level: 50,
  },
  {
    id: "vip",
    label: "VIP",
    icon: VipDiamond,
    color: "#b388ff",
    bg: "rgba(179,136,255,0.08)",
    border: "rgba(179,136,255,0.2)",
    desc: "Premium member perks",
    level: 30,
  },
  {
    id: "donator",
    label: "Donator",
    icon: DonatorHeart,
    color: "#66bb6a",
    bg: "rgba(102,187,106,0.08)",
    border: "rgba(102,187,106,0.2)",
    desc: "Supported the server",
    level: 20,
  },
  {
    id: "member",
    label: "Member",
    icon: UserIcon,
    color: "#78909c",
    bg: "rgba(120,144,156,0.04)",
    border: "rgba(120,144,156,0.12)",
    desc: "Regular community member",
    level: 1,
  },
];

// ─── DEMO USERS ───
const USERS = [
  { name: "Zezima", role: "owner", online: true },
  { name: "Mod Ash", role: "admin", online: true },
  { name: "Woox", role: "developer", online: false },
  { name: "B0aty", role: "moderator", online: true },
  { name: "SoupRS", role: "helper", online: true },
  { name: "Sparc Mac", role: "vip", online: false },
  { name: "A Friend", role: "donator", online: true },
  { name: "Hans", role: "member", online: true },
];

const CHAT_MESSAGES = [
  { user: "Zezima", msg: "Server patch going live in 10 minutes." },
  { user: "Mod Ash", msg: "All accounts backed up. Good to go." },
  { user: "B0aty", msg: "Heads up — cleaned some spam in #general." },
  { user: "SoupRS", msg: "New player guide updated in #help." },
  { user: "Hans", msg: "Is the wilderness event still happening tonight?" },
  { user: "Sparc Mac", msg: "Just logged in, ready for the event!" },
  { user: "A Friend", msg: "The new quest is sick, great work team." },
];

function getRoleForUser(username) {
  const u = USERS.find((u) => u.name === username);
  return ROLES.find((r) => r.id === (u?.role || "member"));
}

// ─── ROLE BADGE COMPONENT ───
function RoleBadge({ roleId, size = "md" }) {
  const role = ROLES.find((r) => r.id === roleId);
  if (!role) return null;
  const Icon = role.icon;
  const s = size === "sm" ? 12 : size === "lg" ? 20 : 16;
  const px = size === "sm" ? "4px 8px" : size === "lg" ? "6px 14px" : "4px 10px";
  const fs = size === "sm" ? 9 : size === "lg" ? 13 : 11;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size === "sm" ? 4 : 6,
        padding: px,
        borderRadius: 6,
        background: role.bg,
        border: `1px solid ${role.border}`,
        color: role.color,
        fontSize: fs,
        fontWeight: 600,
        fontFamily: "'Press Start 2P', 'JetBrains Mono', monospace",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={s} />
      {role.label}
    </span>
  );
}

// ─── INLINE NAME WITH ICON ───
function RoleName({ username, showBadge = false }) {
  const role = getRoleForUser(username);
  const Icon = role.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Icon size={14} />
      <span style={{ color: role.color, fontWeight: 600, fontSize: 13, fontFamily: "'Chakra Petch', sans-serif" }}>
        {username}
      </span>
      {showBadge && (
        <span
          style={{
            fontSize: 8,
            padding: "1px 5px",
            borderRadius: 4,
            background: role.bg,
            border: `1px solid ${role.border}`,
            color: role.color,
            fontFamily: "'Press Start 2P', monospace",
          }}
        >
          {role.label}
        </span>
      )}
    </span>
  );
}

// ─── TABS ───
const TABS = ["Roles", "Users", "Chat", "Code"];

export default function RoleSystem() {
  const [activeTab, setActiveTab] = useState("Roles");
  const [hoveredRole, setHoveredRole] = useState(null);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        margin: "0 auto",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0c0e14 0%, #10131c 50%, #0e1018 100%)",
        fontFamily: "'Chakra Petch', 'Segoe UI', sans-serif",
        color: "#e0e0e0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glow { 0%, 100% { filter: drop-shadow(0 0 2px currentColor); } 50% { filter: drop-shadow(0 0 6px currentColor); } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
      `}</style>

      {/* Scanline effect */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
          pointerEvents: "none",
          zIndex: 50,
        }}
      />

      {/* Header */}
      <div style={{ padding: "28px 24px 0", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <OwnerCrown size={22} />
          <h1
            style={{
              fontSize: 20,
              fontFamily: "'Press Start 2P', monospace",
              color: "#fff",
              letterSpacing: "0.04em",
            }}
          >
            Roles
          </h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "'Chakra Petch', sans-serif", marginTop: 6, paddingLeft: 32 }}>
          User role management &amp; hierarchy system
        </p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            marginTop: 20,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 10,
            padding: 3,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: "none",
                background: activeTab === tab ? "rgba(255,255,255,0.08)" : "transparent",
                color: activeTab === tab ? "#fff" : "rgba(255,255,255,0.3)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Chakra Petch', sans-serif",
                transition: "all 0.2s",
                letterSpacing: "0.05em",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 24px 32px" }}>
        {/* ─── ROLES TAB ─── */}
        {activeTab === "Roles" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {ROLES.map((role, i) => {
              const Icon = role.icon;
              const isHovered = hoveredRole === role.id;
              return (
                <div
                  key={role.id}
                  onMouseEnter={() => setHoveredRole(role.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: isHovered ? role.bg : "rgba(255,255,255,0.015)",
                    border: `1px solid ${isHovered ? role.border : "rgba(255,255,255,0.04)"}`,
                    cursor: "default",
                    transition: "all 0.25s",
                    animation: `fadeUp 0.35s ease ${i * 0.05}s both`,
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: role.bg,
                      border: `1px solid ${role.border}`,
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: role.color, fontSize: 14 }}>{role.label}</span>
                      <span
                        style={{
                          fontSize: 8,
                          fontFamily: "'Press Start 2P', monospace",
                          color: "rgba(255,255,255,0.2)",
                          background: "rgba(255,255,255,0.04)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        LV {role.level}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{role.desc}</div>
                  </div>

                  {/* Permission dots */}
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {[...Array(5)].map((_, j) => (
                      <div
                        key={j}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: j < Math.ceil(role.level / 20) ? role.color : "rgba(255,255,255,0.06)",
                          opacity: j < Math.ceil(role.level / 20) ? 0.8 : 1,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── USERS TAB ─── */}
        {activeTab === "Users" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {USERS.map((user, i) => {
              const role = getRoleForUser(user.name);
              const Icon = role.icon;
              return (
                <div
                  key={user.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.015)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    animation: `fadeUp 0.3s ease ${i * 0.04}s both`,
                  }}
                >
                  {/* Avatar area */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `linear-gradient(135deg, ${role.bg}, rgba(255,255,255,0.03))`,
                        border: `1.5px solid ${role.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 15,
                      }}
                    >
                      {user.name[0]}
                    </div>
                    {/* Online dot */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: user.online ? "#4caf50" : "#616161",
                        border: "2px solid #10131c",
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <RoleName username={user.name} />
                    <div style={{ marginTop: 3 }}>
                      <RoleBadge roleId={user.role} size="sm" />
                    </div>
                  </div>

                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{user.online ? "Online" : "Offline"}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── CHAT TAB ─── */}
        {activeTab === "Chat" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(255,215,0,0.03)",
                border: "1px solid rgba(255,215,0,0.08)",
                marginBottom: 10,
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                textAlign: "center",
                fontFamily: "'Press Start 2P', monospace",
                letterSpacing: "0.03em",
              }}
            >
              — #general —
            </div>
            {CHAT_MESSAGES.map((msg, i) => {
              const role = getRoleForUser(msg.user);
              return (
                <div
                  key={i}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                    animation: `fadeUp 0.3s ease ${i * 0.06}s both`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <RoleName username={msg.user} showBadge />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>
                      {`${12 + Math.floor(i * 0.7)}:${String(i * 7 + 3).padStart(2, "0")}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", paddingLeft: 19, lineHeight: 1.5 }}>{msg.msg}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── CODE TAB ─── */}
        {activeTab === "Code" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
              Drop-in TypeScript usage for your auth system:
            </div>
            {[
              {
                title: "Role Badge (inline)",
                code: `<RoleBadge roleId={user.role} size="sm" />`,
              },
              {
                title: "Name with icon",
                code: `<RoleName username="Zezima" showBadge />`,
              },
              {
                title: "Auth role check",
                code: `const canBan = getUserRole(session.user)\n  .level >= ROLES.moderator.level;`,
              },
              {
                title: "Role hierarchy",
                code: `const HIERARCHY = ROLES\n  .sort((a, b) => b.level - a.level)\n  .map(r => r.id);`,
              },
            ].map((snippet, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.05)",
                  animation: `fadeUp 0.3s ease ${i * 0.08}s both`,
                }}
              >
                <div
                  style={{
                    padding: "6px 12px",
                    background: "rgba(255,255,255,0.03)",
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "'JetBrains Mono', monospace",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {snippet.title}
                </div>
                <pre
                  style={{
                    padding: "12px 14px",
                    background: "rgba(0,0,0,0.3)",
                    fontSize: 12,
                    color: "#8be9fd",
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1.6,
                    overflowX: "auto",
                    whiteSpace: "pre",
                  }}
                >
                  {snippet.code}
                </pre>
              </div>
            ))}

            {/* All badges showcase */}
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 12,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "'Press Start 2P', monospace",
                  marginBottom: 12,
                  letterSpacing: "0.05em",
                }}
              >
                All badges @ 3 sizes
              </div>
              {ROLES.map((role) => (
                <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <RoleBadge roleId={role.id} size="sm" />
                  <RoleBadge roleId={role.id} size="md" />
                  <RoleBadge roleId={role.id} size="lg" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
