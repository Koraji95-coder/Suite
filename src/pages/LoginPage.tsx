import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, hexToRgba } from "@/lib/palette";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
    border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
    background: hexToRgba(palette.background, 0.6),
    color: palette.text, outline: "none", boxSizing: "border-box",
  };

  const fieldStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 6,
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: palette.background,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 380, padding: 32, borderRadius: 16, background: palette.surface,
        border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <h1 style={{ margin: 0, fontSize: 24, color: palette.text, textAlign: "center" }}>
          Log In
        </h1>

        {error && (
          <div style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 13,
            background: hexToRgba("#ef4444", 0.15), color: "#f87171",
          }}>
            {error}
          </div>
        )}

        <div style={fieldStyle}>
          <label style={{ fontSize: 13, color: palette.textMuted }}>Email</label>
          <input type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>

        <div style={fieldStyle}>
          <label style={{ fontSize: 13, color: palette.textMuted }}>Password</label>
          <input type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        </div>

        <button type="submit" disabled={loading} style={{
          padding: "10px 0", borderRadius: 8, border: "none",
          background: palette.primary, color: palette.background,
          fontSize: 14, fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "Logging in..." : "Log In"}
        </button>

        <p style={{ margin: 0, fontSize: 13, color: palette.textMuted, textAlign: "center" }}>
          Don't have an account?{" "}
          <Link to="/signup" style={{ color: palette.primary, textDecoration: "none" }}>
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
