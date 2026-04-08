import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import App from "./App";
import { ThemeProvider } from "./lib/palette";
import "./theme.css";
import "./styles/tokens.css";
import "./styles/globals.css";

if (import.meta.env.DEV) {
	void import("./lib/devConsoleApi").then(({ installSuiteDevConsoleApis }) => {
		installSuiteDevConsoleApis();
	});
}

const appTree = (
	<ThemeProvider>
		<App />
	</ThemeProvider>
);

const shouldUseStrictMode =
	!import.meta.env.DEV || import.meta.env.VITE_REACT_STRICT_MODE === "true";

ReactDOM.createRoot(document.getElementById("root")!).render(
	shouldUseStrictMode ? (
		<React.StrictMode>{appTree}</React.StrictMode>
	) : (
		appTree
	),
);
