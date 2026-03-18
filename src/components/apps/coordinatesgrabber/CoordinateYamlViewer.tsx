import type { ReactNode } from "react";
import yaml from "js-yaml";
import { useMemo, useState } from "react";
import styles from "./CoordinateYamlViewer.module.css";
import type { CoordinatePoint } from "./types";

interface CoordinateYamlViewerProps {
	data: CoordinatePoint[];
}

function renderYamlContent(line: string): ReactNode {
	if (line.match(/^\s*#/)) {
		return <span className={styles.comment}>{line}</span>;
	}

	if (line.match(/^\s*-\s/)) {
		const dashIndex = line.indexOf("-");
		return (
			<>
				<span>{line.slice(0, dashIndex)}</span>
				<span className={styles.key}>-</span>
				<span>{line.slice(dashIndex + 1)}</span>
			</>
		);
	}

	if (line.includes(":")) {
		const colonIndex = line.indexOf(":");
		const key = line.slice(0, colonIndex);
		const value = line.slice(colonIndex + 1);
		const trimmedValue = value.trim();

		let valueClassName = styles.value;
		if (/^-?\d+\.?\d*$/.test(trimmedValue)) {
			valueClassName = styles.number;
		} else if (/^'.*'$|^".*"$/.test(trimmedValue)) {
			valueClassName = styles.string;
		}

		return (
			<>
				<span className={styles.key}>{key}</span>
				<span className={styles.colon}>:</span>
				<span className={valueClassName}>{value}</span>
			</>
		);
	}

	return <span className={styles.value}>{line}</span>;
}

export function CoordinateYamlViewer({ data }: CoordinateYamlViewerProps) {
	const [copied, setCopied] = useState(false);

	const yamlOutput = useMemo(() => {
		if (data.length === 0) return "";

		const documentPayload = {
			ground_grid_coordinates: {
				generated: new Date().toISOString(),
				total_points: data.length,
				columns: [
					"Point ID",
					"East (X)",
					"North (Y)",
					"Elevation (Z)",
					"Layer",
				],
				points: data.map((point) => ({
					id: point.id,
					east: point.east,
					north: point.north,
					elevation: point.elevation,
					layer: point.layer,
				})),
			},
		};

		return yaml.dump(documentPayload, {
			indent: 2,
			lineWidth: 120,
			noRefs: true,
			sortKeys: false,
		});
	}, [data]);

	const handleCopy = async () => {
		if (!yamlOutput) return;
		await navigator.clipboard.writeText(yamlOutput);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 2000);
	};

	if (data.length === 0) {
		return (
			<div className={styles.emptyState}>
				No coordinate data. Start extraction to generate YAML output.
			</div>
		);
	}

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerMeta}>
					<span className={styles.badge}>YAML</span>
					<span className={styles.pointCount}>
						{data.length} point{data.length !== 1 ? "s" : ""}
					</span>
				</div>
				<button
					type="button"
					onClick={() => void handleCopy()}
					className={styles.copyButton}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>

			<div className={styles.viewer}>
				{yamlOutput.split("\n").map((line, index) => (
					<div key={`${index}-${line}`} className={styles.line}>
						<span className={styles.lineNumber}>{index + 1}</span>
						<span className={styles.lineContent}>{renderYamlContent(line)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
