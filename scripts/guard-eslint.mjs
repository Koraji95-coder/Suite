import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");

if (!fs.existsSync(packageJsonPath)) {
	console.error("guard-eslint: package.json not found at repo root.");
	process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const dependencyBlocks = {
	dependencies: pkg.dependencies ?? {},
	devDependencies: pkg.devDependencies ?? {},
	peerDependencies: pkg.peerDependencies ?? {},
	optionalDependencies: pkg.optionalDependencies ?? {},
};

const bannedPatterns = [
	/^eslint$/,
	/^eslint-/,
	/^@eslint\//,
	/^@typescript-eslint\//,
	/^eslint-plugin-/,
	/^eslint-config-/,
];

const bannedDeps = new Set();
for (const [blockName, deps] of Object.entries(dependencyBlocks)) {
	for (const dep of Object.keys(deps)) {
		if (bannedPatterns.some((pattern) => pattern.test(dep))) {
			bannedDeps.add(`${dep} (${blockName})`);
		}
	}
}

const configFiles = [
	".eslintrc",
	".eslintrc.js",
	".eslintrc.cjs",
	".eslintrc.json",
	".eslintrc.yaml",
	".eslintrc.yml",
	".eslintignore",
	"eslint.config.js",
	"eslint.config.cjs",
	"eslint.config.mjs",
	"eslint.config.ts",
];

const foundConfigs = configFiles.filter((file) =>
	fs.existsSync(path.join(root, file)),
);

if (bannedDeps.size === 0 && foundConfigs.length === 0) {
	process.exit(0);
}

console.error("ESLint is not allowed in this repo. Use Biome instead.");
if (bannedDeps.size > 0) {
	console.error(
		`Remove these dependencies: ${Array.from(bannedDeps).join(", ")}.`,
	);
}
if (foundConfigs.length > 0) {
	console.error(
		`Remove these config files: ${foundConfigs.join(", ")}.`,
	);
}
process.exit(1);
