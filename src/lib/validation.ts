/**
 * Input Validation Utilities
 * Provides comprehensive validation for all user inputs
 * Security: Prevents injection attacks, file bombs, and malicious inputs
 */

import { logger } from "./logger";

// ── File Validation ────────────────────────────────────────

export const FILE_SIZE_LIMITS = {
	drawing: 50 * 1024 * 1024, // 50MB for DWG/PDF files
	general: 10 * 1024 * 1024, // 10MB for general files
	image: 5 * 1024 * 1024, // 5MB for images
	document: 25 * 1024 * 1024, // 25MB for documents
} as const;

export const ALLOWED_MIME_TYPES = {
	drawing: [
		"application/pdf",
		"application/acad",
		"application/x-acad",
		"application/autocad_dwg",
		"image/vnd.dwg",
	],
	image: [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"image/svg+xml",
	],
	document: [
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	],
	spreadsheet: [
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	],
} as const;

export const ALLOWED_EXTENSIONS = {
	drawing: [".dwg", ".dxf", ".pdf"],
	image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"],
	document: [".pdf", ".doc", ".docx", ".txt"],
	spreadsheet: [".xls", ".xlsx", ".csv"],
} as const;

export interface FileValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Validate file upload
 */
export function validateFile(
	file: File,
	type: keyof typeof FILE_SIZE_LIMITS = "general",
): FileValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Check file size
	const maxSize = FILE_SIZE_LIMITS[type];
	if (file.size > maxSize) {
		errors.push(
			`File size (${formatFileSize(file.size)}) exceeds maximum allowed (${formatFileSize(maxSize)})`,
		);
	}

	if (file.size === 0) {
		errors.push("File is empty");
	}

	// Check filename for malicious patterns
	const filenameResult = validateFilename(file.name);
	if (!filenameResult.valid) {
		errors.push(...filenameResult.errors);
	}
	warnings.push(...filenameResult.warnings);

	// Check file extension
	const ext = getFileExtension(file.name).toLowerCase();
	const allowedExts: readonly string[] =
		type === "general"
			? [
					...ALLOWED_EXTENSIONS.drawing,
					...ALLOWED_EXTENSIONS.image,
					...ALLOWED_EXTENSIONS.document,
					...ALLOWED_EXTENSIONS.spreadsheet,
				]
			: ALLOWED_EXTENSIONS[type] || [];

	if (!(allowedExts as string[]).includes(ext)) {
		errors.push(
			`File type "${ext}" is not allowed. Allowed types: ${allowedExts.join(", ")}`,
		);
	}

	// Check MIME type if specified
	if (file.type && type !== "general") {
		const allowedMimes: readonly string[] = ALLOWED_MIME_TYPES[type] || [];
		if (
			allowedMimes.length > 0 &&
			!(allowedMimes as string[]).includes(file.type)
		) {
			warnings.push(
				`MIME type "${file.type}" doesn't match expected types for ${type} files`,
			);
		}
	}

	const valid = errors.length === 0;

	if (!valid) {
		logger.warn("File validation failed", "validation", {
			file: file.name,
			errors,
		});
	}

	return { valid, errors, warnings };
}

/**
 * Validate filename for malicious patterns
 */
export function validateFilename(filename: string): FileValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Check for null bytes
	if (filename.includes("\0")) {
		errors.push("Filename contains null bytes");
	}

	// Check for path traversal attempts
	if (
		filename.includes("..") ||
		filename.includes("/") ||
		filename.includes("\\")
	) {
		errors.push("Filename contains path traversal characters");
	}

	// Check for excessive length
	if (filename.length > 255) {
		errors.push("Filename is too long (max 255 characters)");
	}

	// Check for special characters that could cause issues
	// eslint-disable-next-line no-control-regex
	const dangerousChars = /[<>:"|?*\x00-\x1f]/;
	if (dangerousChars.test(filename)) {
		errors.push("Filename contains invalid characters");
	}

	// Warn about leading/trailing spaces
	if (filename.trim() !== filename) {
		warnings.push("Filename has leading or trailing spaces");
	}

	// Warn about multiple extensions (possible obfuscation)
	const extCount = (filename.match(/\./g) || []).length;
	if (extCount > 1) {
		warnings.push("Filename has multiple extensions");
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
	// Remove null bytes
	let safe = filename.replace(/\0/g, "");

	// Remove path traversal attempts
	safe = safe.replace(/\.\./g, "");
	safe = safe.replace(/[/\\]/g, "_");

	// Replace dangerous characters
	// eslint-disable-next-line no-control-regex
	safe = safe.replace(/[<>:"|?*\x00-\x1f]/g, "_");

	// Trim spaces
	safe = safe.trim();

	// Limit length
	if (safe.length > 255) {
		const ext = getFileExtension(safe);
		const nameWithoutExt = safe.slice(0, safe.lastIndexOf("."));
		safe = nameWithoutExt.slice(0, 255 - ext.length) + ext;
	}

	return safe;
}

// ── Text Input Validation ──────────────────────────────────

/**
 * Sanitize text to prevent XSS attacks
 */
export function sanitizeText(text: string): string {
	return text
		.replace(/[<>]/g, "") // Remove angle brackets
		.replace(/javascript:/gi, "") // Remove javascript: protocol
		.replace(/on\w+=/gi, "") // Remove event handlers
		.trim();
}

/**
 * Sanitize Excel formula injection
 * Prevents cells starting with =, +, -, @ from being interpreted as formulas
 */
export function sanitizeExcelValue(value: string): string {
	const trimmed = value.trim();
	if (trimmed.match(/^[=+\-@]/)) {
		return `'${value}`; // Prefix with single quote to make it a string
	}
	return value;
}

/**
 * Validate project/file name
 */
export function validateName(
	name: string,
	maxLength: number = 200,
): FileValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!name || name.trim().length === 0) {
		errors.push("Name cannot be empty");
	}

	if (name.length > maxLength) {
		errors.push(`Name is too long (max ${maxLength} characters)`);
	}

	// Check for SQL injection patterns
	const sqlPatterns =
		/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i;
	if (sqlPatterns.test(name)) {
		warnings.push("Name contains SQL keywords");
	}

	// Check for script tags
	if (/<script/i.test(name) || /<iframe/i.test(name)) {
		errors.push("Name contains potentially malicious HTML");
	}

	return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate email address
 */
export function validateEmail(email: string): FileValidationResult {
	const errors: string[] = [];

	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		errors.push("Invalid email format");
	}

	if (email.length > 254) {
		errors.push("Email is too long");
	}

	return { valid: errors.length === 0, errors, warnings: [] };
}

/**
 * Validate URL
 */
export function validateUrl(
	url: string,
	allowedProtocols: string[] = ["http", "https"],
): FileValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	try {
		const parsed = new URL(url);

		// Check protocol
		const protocol = parsed.protocol.replace(":", "");
		if (!allowedProtocols.includes(protocol)) {
			errors.push(
				`Protocol "${protocol}" is not allowed. Allowed: ${allowedProtocols.join(", ")}`,
			);
		}

		// Check for common dangerous protocols
		const dangerousProtocols = ["javascript", "data", "vbscript", "file"];
		if (dangerousProtocols.includes(protocol)) {
			errors.push("URL contains dangerous protocol");
		}
	} catch {
		errors.push("Invalid URL format");
	}

	return { valid: errors.length === 0, errors, warnings };
}

// ── Number Validation ──────────────────────────────────────

/**
 * Validate number is within range
 */
export function validateNumber(
	value: number,
	min?: number,
	max?: number,
	allowDecimals: boolean = true,
): FileValidationResult {
	const errors: string[] = [];

	if (typeof value !== "number" || isNaN(value)) {
		errors.push("Value must be a valid number");
	}

	if (!allowDecimals && !Number.isInteger(value)) {
		errors.push("Value must be an integer");
	}

	if (min !== undefined && value < min) {
		errors.push(`Value must be at least ${min}`);
	}

	if (max !== undefined && value > max) {
		errors.push(`Value must be at most ${max}`);
	}

	return { valid: errors.length === 0, errors, warnings: [] };
}

// ── Date Validation ────────────────────────────────────────

/**
 * Validate date string
 */
export function validateDate(dateStr: string): FileValidationResult {
	const errors: string[] = [];

	const date = new Date(dateStr);
	if (isNaN(date.getTime())) {
		errors.push("Invalid date format");
	}

	// Check for reasonable date range (not too far in past or future)
	const now = new Date();
	const hundredYearsAgo = new Date(now.getFullYear() - 100, 0, 1);
	const hundredYearsFromNow = new Date(now.getFullYear() + 100, 11, 31);

	if (date < hundredYearsAgo || date > hundredYearsFromNow) {
		errors.push("Date is outside reasonable range");
	}

	return { valid: errors.length === 0, errors, warnings: [] };
}

// ── Utility Functions ──────────────────────────────────────

function getFileExtension(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	return lastDot === -1 ? "" : filename.slice(lastDot);
}

function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Batch validate multiple files
 */
export function validateFiles(
	files: FileList | File[],
	type: keyof typeof FILE_SIZE_LIMITS = "general",
): { valid: boolean; results: Map<string, FileValidationResult> } {
	const results = new Map<string, FileValidationResult>();
	let allValid = true;

	const fileArray = Array.from(files);
	for (const file of fileArray) {
		const result = validateFile(file, type);
		results.set(file.name, result);
		if (!result.valid) {
			allValid = false;
		}
	}

	return { valid: allValid, results };
}
