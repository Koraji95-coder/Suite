import { useState } from "react";
import { useTheme, hexToRgba } from "@/lib/palette";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/lib/supabase";
import { Save, User } from "lucide-react";

export function ProfileSettings() {
  const { palette } = useTheme();
  const { profile, user } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.display_name || "Dustin");
  const [email, setEmail] = useState(profile?.email || user?.email || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        display_name: displayName.trim(),
        email: email.trim(),
        updated_at: new Date().toISOString(),
      });

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
    background: hexToRgba(palette.background, 0.6),
    color: palette.text,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s ease",
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: palette.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <User size={16} />
        Profile
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 600 }}>
        <div>
          <label style={{ fontSize: 12, color: palette.textMuted, marginBottom: 4, display: "block" }}>
            Display Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
            placeholder="Your name"
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: palette.textMuted, marginBottom: 4, display: "block" }}>
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="your@email.com"
            type="email"
          />
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: palette.textMuted }}>
        Role: Admin
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 20px",
          borderRadius: 8,
          border: "none",
          background: saved ? hexToRgba(palette.secondary, 0.2) : hexToRgba(palette.primary, 0.15),
          color: saved ? palette.secondary : palette.text,
          fontSize: 13,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <Save size={14} />
        {saving ? "Saving..." : saved ? "Saved" : "Save Profile"}
      </button>
    </div>
  );
}
