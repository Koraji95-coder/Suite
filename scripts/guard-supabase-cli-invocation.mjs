import assert from "node:assert/strict";
import { createSupabaseInvocation } from "./lib/supabase-cli.mjs";

const fakeNodeExecPath = "C:\\Program Files\\nodejs\\node.exe";
const fakeNpmCliPath = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
const fakeWorkdir = "C:\\repo\\supabase";

const windowsInvocation = createSupabaseInvocation(["start"], fakeWorkdir, {
	platform: "win32",
	nodeExecPath: fakeNodeExecPath,
	npmCliPath: fakeNpmCliPath,
});

assert.equal(
	windowsInvocation.command,
	fakeNodeExecPath,
	"Windows Supabase invocation must execute npm through node.exe.",
);
assert.deepEqual(
	windowsInvocation.args.slice(0, 7),
	[
		fakeNpmCliPath,
		"exec",
		"--yes",
		"--package",
		"supabase",
		"--",
		"supabase",
	],
	"Windows Supabase invocation must run npm exec without cmd.exe shell wrapping.",
);
assert.ok(
	!windowsInvocation.args.includes("/c"),
	"Windows Supabase invocation must not pass shell control flags.",
);

const posixInvocation = createSupabaseInvocation(["start"], "/tmp/supabase", {
	platform: "linux",
});
assert.equal(
	posixInvocation.command,
	"npx",
	"Non-Windows Supabase invocation should keep the direct npx path.",
);
