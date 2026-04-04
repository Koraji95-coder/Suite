import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const removedPath = path.join(root, "zeroclaw-main");

if (!fs.existsSync(removedPath)) {
	process.exit(0);
}

console.error(
	"zeroclaw-main has been removed from the active Suite repo. Do not restore the subtree or reintroduce ZeroClaw runtime/tooling paths into active Suite docs or code.",
);
process.exit(1);
