import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
		environmentMatchGlobs: [["scripts/**/*.test.mjs", "node"]],
		setupFiles: ["src/test/setup.ts"],
		css: true,
		maxWorkers: 4,
	},
});
