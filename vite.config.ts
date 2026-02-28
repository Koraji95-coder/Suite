import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const backendUrl =
		env.VITE_BACKEND_URL || env.BACKEND_URL || "http://127.0.0.1:5000";
	const gatewayProxyTarget = "http://127.0.0.1:3000";

	return {
		plugins: [react()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		server: {
			proxy: {
				"/api": {
					target: backendUrl,
					changeOrigin: true,
				},
				"/gateway": {
					target: gatewayProxyTarget,
					changeOrigin: true,
					ws: true,
					rewrite: (path) => path.replace(/^\/gateway/, ""),
				},
			},
		},
		build: {
			chunkSizeWarningLimit: 1800,
		},
		optimizeDeps: {
			exclude: ["lucide-react"],
		},
	};
});
