#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function normalizeValue(rawValue) {
	const value = String(rawValue ?? "").trim();
	if (value.length >= 2) {
		const first = value[0];
		const last = value[value.length - 1];
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			return value.slice(1, -1);
		}
	}
	return value;
}

export function parseDotEnvText(text) {
	const entries = {};
	for (const rawLine of String(text || "").split(/\r?\n/)) {
		const trimmed = rawLine.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const withoutExport = trimmed.startsWith("export ")
			? trimmed.slice("export ".length).trim()
			: rawLine;
		const splitAt = withoutExport.indexOf("=");
		if (splitAt <= 0) continue;
		const key = withoutExport.slice(0, splitAt).trim();
		if (!key) continue;
		const value = withoutExport.slice(splitAt + 1);
		entries[key] = normalizeValue(value);
	}
	return entries;
}

export function readEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return {};
	return parseDotEnvText(fs.readFileSync(filePath, "utf8"));
}

export function getRepoEnvPaths(repoRoot = process.cwd()) {
	return {
		envPath: path.join(repoRoot, ".env"),
		localEnvPath: path.join(repoRoot, ".env.local"),
	};
}

export function loadRepoEnv(repoRoot = process.cwd()) {
	const { envPath, localEnvPath } = getRepoEnvPaths(repoRoot);
	return {
		...readEnvFile(envPath),
		...readEnvFile(localEnvPath),
	};
}

export function readSetting(envMap, key, fallback = "") {
	const fromProcess = String(process.env[key] || "").trim();
	if (fromProcess) return fromProcess;
	return String(envMap[key] || fallback).trim();
}

function formatEnvValue(value) {
	const raw = String(value ?? "");
	if (!raw) return "";
	if (/[\s#"'`]/.test(raw)) {
		return JSON.stringify(raw);
	}
	return raw;
}

export function serializeEnvEntries(entries, comments = []) {
	const lines = [];
	for (const comment of comments) {
		lines.push(`# ${comment}`);
	}
	if (comments.length > 0) {
		lines.push("");
	}
	for (const [key, value] of entries) {
		lines.push(`${key}=${formatEnvValue(value)}`);
	}
	lines.push("");
	return lines.join("\n");
}

export function writeEnvEntries(filePath, entries, comments = []) {
	fs.writeFileSync(filePath, serializeEnvEntries(entries, comments), "utf8");
}

