export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatRelativeTime(
	timestamp: number | string | null | undefined,
): string {
	if (!timestamp) return "—";
	const timeValue =
		typeof timestamp === "string"
			? new Date(timestamp).getTime()
			: Number(timestamp);
	if (!Number.isFinite(timeValue) || timeValue <= 0) return "—";

	const deltaMs = Date.now() - timeValue;
	const deltaMinutes = Math.round(deltaMs / 60000);
	if (Math.abs(deltaMinutes) < 1) return "just now";
	if (Math.abs(deltaMinutes) < 60) return `${deltaMinutes}m ago`;

	const deltaHours = Math.round(deltaMinutes / 60);
	if (Math.abs(deltaHours) < 24) return `${deltaHours}h ago`;

	const deltaDays = Math.round(deltaHours / 24);
	return `${deltaDays}d ago`;
}

export function formatDuration(durationMs: number | null | undefined): string {
	if (!durationMs || durationMs <= 0) return "0m";
	const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
