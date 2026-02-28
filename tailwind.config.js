/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
			},
			colors: {
				bg: "var(--bg)",
				"bg-base": "var(--bg-base)",
				"bg-mid": "var(--bg-mid)",
				"bg-heavy": "var(--bg-heavy)",

				surface: "var(--surface)",
				"surface-2": "var(--surface-2)",

				border: "var(--border)",

				text: "var(--text)",
				"text-muted": "var(--text-muted)",

				primary: "var(--primary)",
				"primary-contrast": "var(--primary-contrast)",
				accent: "var(--accent)",

				success: "var(--success)",
				danger: "var(--danger)",
			},
			borderRadius: {
				lg: "var(--radius-lg)",
				md: "var(--radius-md)",
				sm: "var(--radius-sm)",
			},
			boxShadow: {
				panel: "var(--shadow-panel)",
				focus: "0 0 0 3px var(--focus-ring)",
			},
		},
	},
	plugins: [],
};