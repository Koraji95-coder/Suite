import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/palette";
import "./theme.css";
import "./styles/tokens.css";
import "./styles/globals.css";

const appTree = (
	<ThemeProvider>
		<App />
	</ThemeProvider>
);

const shouldUseStrictMode =
	!import.meta.env.DEV || import.meta.env.VITE_REACT_STRICT_MODE === "true";

ReactDOM.createRoot(document.getElementById("root")!).render(
	shouldUseStrictMode ? <React.StrictMode>{appTree}</React.StrictMode> : appTree,
);
