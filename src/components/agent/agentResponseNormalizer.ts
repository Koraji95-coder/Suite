function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&quot;/gi, '"')
		.replace(/&#34;/gi, '"')
		.replace(/&apos;/gi, "'")
		.replace(/&#39;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&amp;/gi, "&");
}

function tryParseJson(value: string): Record<string, unknown> | null {
	const raw = String(value || "").trim();
	if (!raw) return null;
	const attempts = [raw, raw.replace(/\\"/g, '"')];
	for (const candidate of attempts) {
		try {
			const parsed = JSON.parse(candidate) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			/* noop */
		}
	}
	return null;
}

function parseToolCallSummary(rawMarkup: string): string {
	const nameMatch = rawMarkup.match(
		/\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
	);
	const argsAttrMatch = rawMarkup.match(
		/\bargs\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
	);

	const toolName = String(nameMatch?.[1] || nameMatch?.[2] || "").trim();
	let rawArgs = String(argsAttrMatch?.[1] || argsAttrMatch?.[2] || "").trim();
	if (!rawArgs) {
		const argsStart = rawMarkup.search(/\bargs\s*=/i);
		if (argsStart >= 0) {
			const braceStart = rawMarkup.indexOf("{", argsStart);
			const tagEnd = rawMarkup.indexOf(">", argsStart);
			if (braceStart >= 0 && tagEnd > braceStart) {
				const braceEnd = rawMarkup.lastIndexOf("}", tagEnd);
				if (braceEnd > braceStart) {
					rawArgs = rawMarkup.slice(braceStart, braceEnd + 1).trim();
				}
			}
		}
	}
	const decodedArgs = decodeHtmlEntities(rawArgs);
	const parsedArgs = tryParseJson(decodedArgs);

	if (toolName === "identity_set") {
		const nameValue = String(parsedArgs?.name || "").trim();
		if (nameValue) return `Saved your name as ${nameValue}.`;
		return "Saved your profile identity.";
	}

	if (toolName && parsedArgs) {
		const argsPreview = Object.entries(parsedArgs)
			.slice(0, 4)
			.map(([key, value]) => `${key}: ${String(value)}`)
			.join(", ");
		if (argsPreview) return `Tool call: ${toolName} (${argsPreview}).`;
	}

	if (toolName && decodedArgs) {
		return `Tool call: ${toolName} (${decodedArgs}).`;
	}

	if (toolName) return `Tool call: ${toolName}.`;
	return "Tool call completed.";
}

const TOOL_CALL_REGEX = /<tool_call\b[^>]*>(?:[\s\S]*?)<\/tool_call>/gi;

function normalizeToolCallMarkup(rawText: string): string {
	const matches = Array.from(rawText.matchAll(TOOL_CALL_REGEX));
	if (matches.length === 0) return rawText;
	const summaries = matches.map((match) => parseToolCallSummary(match[0]));
	const replaced = rawText.replace(TOOL_CALL_REGEX, () => {
		const summary = summaries.shift();
		return summary ? ` ${summary} ` : " ";
	});
	return replaced.replace(/\s{2,}/g, " ").trim();
}

export function normalizeAgentResponseText(value: string): string {
	const raw = String(value || "").trim();
	if (!raw) return "";

	if (raw.startsWith("{") || raw.startsWith("[")) {
		const parsed = tryParseJson(raw);
		const nestedResponse = String(parsed?.response || "").trim();
		if (nestedResponse) {
			return normalizeAgentResponseText(nestedResponse);
		}
	}

	if (raw.toLowerCase().includes("<tool_call")) {
		return normalizeToolCallMarkup(raw);
	}
	return decodeHtmlEntities(raw);
}
