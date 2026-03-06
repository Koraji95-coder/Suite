import { useState, useEffect, useRef, useCallback } from "react";

const WATCHED_FOLDERS = [
  "/projects/frontend/src",
  "/data/uploads",
  "/home/user/documents",
  "/var/logs/app",
  "/backups/daily",
];

const FILE_NAMES = [
  "index.tsx", "styles.module.css", "config.yaml", "README.md", "package.json",
  "report_Q3.pdf", "avatar.png", "schema.prisma", "docker-compose.yml",
  "migration_042.sql", "notes.txt", ".env.local", "tsconfig.json",
  "dashboard.jsx", "api_response.json", "budget_2026.xlsx", "debug.log",
  "credentials.enc", "thumbnail_lg.webp", "manifest.json", "setup.sh",
];

const AVATARS = {
  added: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  removed: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  ),
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

let idCounter = 0;

function generateEvent() {
  const type = Math.random() > 0.4 ? "added" : "removed";
  const folder = randomFrom(WATCHED_FOLDERS);
  const file = randomFrom(FILE_NAMES);
  return {
    id: ++idCounter,
    type,
    folder,
    file,
    timestamp: new Date(),
    read: false,
  };
}

// ── Notification Bubble ──
function NotificationBubble({ event, isNew }) {
  const isAdded = event.type === "added";
  const [timeStr, setTimeStr] = useState(timeAgo(event.timestamp));

  useEffect(() => {
    const iv = setInterval(() => setTimeStr(timeAgo(event.timestamp)), 5000);
    return () => clearInterval(iv);
  }, [event.timestamp]);

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 18px",
        borderRadius: 16,
        background: isNew
          ? isAdded
            ? "rgba(52,211,153,0.06)"
            : "rgba(248,113,113,0.06)"
          : "transparent",
        transition: "all 0.5s cubic-bezier(.4,0,.2,1)",
        animation: isNew ? "slideIn 0.4s cubic-bezier(.175,.885,.32,1.275)" : "none",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isAdded ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
          flexShrink: 0,
          border: `1px solid ${isAdded ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
        }}
      >
        {AVATARS[event.type]}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 13,
              fontWeight: 600,
              color: isAdded ? "#6ee7b7" : "#fca5a5",
              letterSpacing: "0.02em",
            }}
          >
            {isAdded ? "File Added" : "File Removed"}
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", marginLeft: 8 }}>
            {timeStr}
          </span>
        </div>

        <div
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.85)",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              background: "rgba(255,255,255,0.07)",
              padding: "2px 7px",
              borderRadius: 6,
              color: "#fff",
            }}
          >
            {event.file}
          </span>{" "}
          was {isAdded ? "added to" : "removed from"}{" "}
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{event.folder}</span>
        </div>

        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
          {formatTime(event.timestamp)}
        </div>
      </div>

      {/* Unread indicator */}
      {!event.read && (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isAdded ? "#34d399" : "#f87171",
            flexShrink: 0,
            alignSelf: "center",
            boxShadow: `0 0 8px ${isAdded ? "rgba(52,211,153,0.5)" : "rgba(248,113,113,0.5)"}`,
          }}
        />
      )}
    </div>
  );
}

// ── Stats Bar ──
function StatsBar({ events, monitoring }) {
  const added = events.filter((e) => e.type === "added").length;
  const removed = events.filter((e) => e.type === "removed").length;
  const unread = events.filter((e) => !e.read).length;

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "10px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.2)",
      }}
    >
      {[
        { label: "Added", value: added, color: "#34d399" },
        { label: "Removed", value: removed, color: "#f87171" },
        { label: "Unread", value: unread, color: "#fbbf24" },
      ].map((stat) => (
        <div
          key={stat.label}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "6px 0",
            borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, fontFamily: "'JetBrains Mono', monospace" }}>
            {stat.value}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
            {stat.label}
          </div>
        </div>
      ))}
      <div
        style={{
          flex: 1,
          textAlign: "center",
          padding: "6px 0",
          borderRadius: 8,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ fontSize: 18 }}>{monitoring ? "🟢" : "⏸"}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
          {monitoring ? "Live" : "Paused"}
        </div>
      </div>
    </div>
  );
}

// ── Folder Chips ──
function FolderList() {
  return (
    <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        Watching
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {WATCHED_FOLDERS.map((f) => (
          <span
            key={f}
            style={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              padding: "4px 10px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {f.split("/").pop()}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main App ──
export default function FolderMonitor() {
  const [events, setEvents] = useState(() => {
    const initial = [];
    for (let i = 0; i < 5; i++) {
      const e = generateEvent();
      e.timestamp = new Date(Date.now() - (5 - i) * 45000);
      e.read = true;
      initial.push(e);
    }
    return initial;
  });
  const [monitoring, setMonitoring] = useState(true);
  const [filter, setFilter] = useState("all");
  const [newestId, setNewestId] = useState(null);
  const scrollRef = useRef(null);
  const intervalRef = useRef(null);

  const addEvent = useCallback(() => {
    const newEvent = generateEvent();
    setNewestId(newEvent.id);
    setEvents((prev) => [newEvent, ...prev].slice(0, 100));
    setTimeout(() => setNewestId(null), 800);
  }, []);

  useEffect(() => {
    if (monitoring) {
      // Random interval between 2-6 seconds
      const schedule = () => {
        intervalRef.current = setTimeout(() => {
          addEvent();
          schedule();
        }, 2000 + Math.random() * 4000);
      };
      schedule();
    }
    return () => clearTimeout(intervalRef.current);
  }, [monitoring, addEvent]);

  const markAllRead = () => setEvents((prev) => prev.map((e) => ({ ...e, read: true })));
  const clearAll = () => setEvents([]);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const unreadCount = events.filter((e) => !e.read).length;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 480,
        height: "100vh",
        maxHeight: 780,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(170deg, #0f1118 0%, #151922 40%, #111827 100%)",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        color: "#fff",
        overflow: "hidden",
        borderRadius: 0,
        position: "relative",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: monitoring ? "radial-gradient(circle, rgba(52,211,153,0.06) 0%, transparent 70%)" : "none",
          pointerEvents: "none",
          transition: "background 1s",
        }}
      />

      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: "20px 20px 14px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                fontFamily: "'DM Sans', sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 20 }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
              </span>
              Watchdog
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: "linear-gradient(135deg, #f59e0b, #f97316)",
                    color: "#000",
                    padding: "2px 8px",
                    borderRadius: 20,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 3, letterSpacing: "0.02em" }}>
              Folder monitoring · {events.length} events
            </p>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={markAllRead}
              style={{
                padding: "7px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.5)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Read all
            </button>
            <button
              onClick={() => setMonitoring(!monitoring)}
              style={{
                padding: "7px 14px",
                borderRadius: 10,
                border: "none",
                background: monitoring
                  ? "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.1))"
                  : "rgba(255,255,255,0.06)",
                color: monitoring ? "#6ee7b7" : "rgba(255,255,255,0.4)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: monitoring ? "#34d399" : "rgba(255,255,255,0.3)",
                  animation: monitoring ? "pulse 2s infinite" : "none",
                }}
              />
              {monitoring ? "Live" : "Paused"}
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
          {[
            { key: "all", label: "All" },
            { key: "added", label: "Added" },
            { key: "removed", label: "Removed" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: "6px 16px",
                borderRadius: 20,
                border: filter === tab.key ? "none" : "1px solid rgba(255,255,255,0.06)",
                background: filter === tab.key ? "rgba(255,255,255,0.1)" : "transparent",
                color: filter === tab.key ? "#fff" : "rgba(255,255,255,0.35)",
                fontSize: 12,
                fontWeight: filter === tab.key ? 600 : 400,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={clearAll}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              border: "1px solid rgba(248,113,113,0.15)",
              background: "transparent",
              color: "rgba(248,113,113,0.5)",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <StatsBar events={events} monitoring={monitoring} />
      <FolderList />

      {/* ── Notifications Feed ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 6px",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            <span style={{ fontSize: 13 }}>No events yet</span>
            <span style={{ fontSize: 11 }}>Monitoring will appear here</span>
          </div>
        ) : (
          filtered.map((event) => (
            <NotificationBubble key={event.id} event={event} isNew={event.id === newestId} />
          ))
        )}
      </div>

      {/* ── Bottom Bar ── */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>
          watchdog v2.1.0
        </span>
        <span
          style={{
            fontSize: 11,
            color: monitoring ? "rgba(52,211,153,0.5)" : "rgba(255,255,255,0.15)",
            fontFamily: "'JetBrains Mono', monospace",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {monitoring && (
            <span style={{ animation: "pulse 1.5s infinite" }}>●</span>
          )}
          {monitoring ? "scanning..." : "idle"}
        </span>
      </div>
    </div>
  );
}
