import fs from "fs";
import path from "path";

const root = process.cwd();
const pkgPath = path.join(root, "package.json");
const versionPath = path.join(root, "src/constants/version.ts");

const raw = fs.readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(raw);

const current = String(pkg.version || "0.0.0");
const base = current.split("-")[0];
const [majorStr, minorStr, patchStr] = base.split(".");
const major = Number(majorStr || 0);
const minor = Number(minorStr || 0);
const patch = Number(patchStr || 0);

const nextBase = `${major}.${minor + 1}.0`;
const suffix = Math.random().toString(36).slice(2, 9);
const nextVersion = `${nextBase}-${suffix}`;

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const versionContent = `export const APP_VERSION = "${nextVersion}";\n`;
fs.writeFileSync(versionPath, versionContent);
