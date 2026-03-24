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
				"/health": {
					target: backendUrl,
					changeOrigin: true,
				},
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
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (!id.includes("node_modules")) return;
						if (
							id.includes("/react/") ||
							id.includes("/react-dom/") ||
							id.includes("/react-router-dom/")
						) {
							return "framework";
						}
						if (id.includes("/@supabase/")) {
							return "supabase";
						}
						if (id.includes("/date-fns/")) {
							return "date-fns";
						}
						if (id.includes("/lucide-react/")) {
							return "lucide";
						}
						if (id.includes("/@dnd-kit/")) {
							return "dnd-kit";
						}
						if (id.includes("/js-yaml/") || id.includes("/yaml/")) {
							return "yaml-vendor";
						}
					},
				},
			},
		},
		optimizeDeps: {
			exclude: ["lucide-react"],
		},
		test: {
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/cypress/**",
				"**/.{idea,git,cache,output,temp}/**",
				"**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
			],
		},
	};
});
