/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				// Obsidian design system
				base: {
					DEFAULT: "#0c0b10",
					elevated: "#14131a",
					surface: "#1c1b24",
				},
				accent: {
					primary: "#818cf8", // indigo-400
					"primary-light": "#a5b4fc", // indigo-300
					secondary: "#34d399", // emerald-400
					"secondary-light": "#6ee7b7", // emerald-300
					warm: "#fb923c", // orange-400
					"warm-light": "#fdba74", // orange-300
				},
			},
		},
	},
	plugins: [],
};
