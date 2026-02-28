// src/components/apps/ground-grid/GroundGridGeneratorApp.tsx
import { MapPin, ScrollText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coordinatesGrabberService } from "@/components/apps/ground-grid-generator/coordinatesGrabberService";
import { hexToRgba, useTheme } from "@/lib/palette";
import { CoordinatesGrabber } from "../coordinatesgrabber/CoordinatesGrabber";
import { GridGeneratorPanel } from "./GridGeneratorPanel";
import { GroundGridProvider, useGroundGrid } from "./GroundGridContext";
import { UnifiedLog } from "./UnifiedLog";

type TabId = "grabber" | "generator" | "log";

const TABS: { id: TabId; label: string }[] = [
	{ id: "grabber", label: "Coordinate Grabber" },
	{ id: "generator", label: "Grid Generator" },
	{ id: "log", label: "Log" },
];

function ScrollableTabs({
	tabs,
	activeTab,
	onTabChange,
	logs,
}: {
	tabs: { id: TabId; label: string }[];
	activeTab: TabId;
	onTabChange: (id: TabId) => void;
	logs: { length: number };
}) {
	const { palette } = useTheme();
	const scrollRef = useRef<HTMLDivElement>(null);
	const isMiddleDragging = useRef(false);
	const dragStartX = useRef(0);
	const scrollStartX = useRef(0);

	const handleMiddleDown = useCallback((e: React.MouseEvent) => {
		if (e.button !== 1) return;
		e.preventDefault();
		isMiddleDragging.current = true;
		dragStartX.current = e.clientX;
		scrollStartX.current = scrollRef.current?.scrollLeft ?? 0;
	}, []);

	useEffect(() => {
		const handleMove = (e: MouseEvent) => {
			if (!isMiddleDragging.current || !scrollRef.current) return;
			const dx = e.clientX - dragStartX.current;
			scrollRef.current.scrollLeft = scrollStartX.current - dx;
		};
		const handleUp = (e: MouseEvent) => {
			if (e.button === 1) isMiddleDragging.current = false;
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, []);

	return (
		<div
			ref={scrollRef}
			onMouseDown={handleMiddleDown}
			className="flex gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
			style={{
				scrollbarColor: `${hexToRgba(palette.primary, 0.25)} transparent`,
			}}
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTab;
				const hasCount = tab.id === "log" && logs.length > 0;

				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => onTabChange(tab.id)}
						className={[
							"flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg px-5 py-2 text-[13px] font-semibold transition",
							"border-b-2",
							isActive
								? "bg-surface-2 text-text border-[color:#f59e0b]"
								: "bg-transparent text-text-muted border-transparent hover:bg-surface hover:text-text",
						].join(" ")}
					>
						{tab.id === "log" ? <ScrollText size={13} /> : null}
						{tab.label}
						{hasCount ? (
							<span className="ml-1 inline-flex items-center rounded-full bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] px-1.5 py-0.5 text-[10px] font-extrabold text-text-muted">
								{logs.length}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

function StatusPill({
	label,
	isOk,
	title,
}: {
	label: string;
	isOk: boolean;
	title?: string;
}) {
	return (
		<div
			className={[
				"flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium",
				isOk
					? "border-[color:color-mix(in_oklab,var(--success)_30%,var(--border))] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] text-success"
					: "border-[color:color-mix(in_oklab,var(--accent)_22%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] text-accent",
			].join(" ")}
			title={title}
		>
			<span
				className={[
					"h-2 w-2 rounded-full",
					isOk ? "bg-success" : "bg-accent",
				].join(" ")}
			/>
			<span>{label}</span>
		</div>
	);
}

function GroundGridGeneratorInner() {
	const { palette } = useTheme();
	const { backendConnected, logs } = useGroundGrid();

	const [wsLive, setWsLive] = useState(() => coordinatesGrabberService.isConnected());
	const [wsLastUpdate, setWsLastUpdate] = useState<number | null>(null);
	const [activeTab, setActiveTab] = useState<TabId>("generator");

	useEffect(() => {
		coordinatesGrabberService.connectWebSocket().catch(() => {
			setWsLive(false);
		});

		const unsubscribeConnected = coordinatesGrabberService.on(
			"connected",
			(event) => {
				if (event.type !== "connected") return;
				setWsLive(true);
				setWsLastUpdate(Date.now());
			},
		);

		const unsubscribeStatus = coordinatesGrabberService.on(
			"status",
			(event) => {
				if (event.type !== "status") return;
				setWsLive(true);
				setWsLastUpdate(Date.now());
			},
		);

		const unsubscribeDisconnected = coordinatesGrabberService.on(
			"service-disconnected",
			() => {
				setWsLive(false);
			},
		);

		const unsubscribeError = coordinatesGrabberService.on("error", () => {
			setWsLive(false);
		});

		return () => {
			unsubscribeConnected();
			unsubscribeStatus();
			unsubscribeDisconnected();
			unsubscribeError();
		};
	}, []);

	const wsLiveStamp = useMemo(
		() => (wsLastUpdate ? new Date(wsLastUpdate).toLocaleTimeString() : "--"),
		[wsLastUpdate],
	);

	return (
		<div className="relative flex h-full flex-col overflow-hidden">
			{/* Header */}
			<div
				className="relative z-10 shrink-0 border-b px-6 pt-4 backdrop-blur"
				style={{
					borderColor: hexToRgba(palette.primary, 0.12),
					background: hexToRgba(palette.surface, 0.85),
				}}
			>
				<div className="mb-4 flex items-center gap-3">
					<div className="rounded-xl p-2.5 bg-[linear-gradient(135deg,color-mix(in_oklab,#f59e0b_20%,transparent),color-mix(in_oklab,#ea580c_20%,transparent))]">
						<MapPin size={24} className="text-[color:#f59e0b]" />
					</div>

					<div className="min-w-0 flex-1">
						<h2 className="m-0 text-[22px] font-bold tracking-tight bg-[linear-gradient(90deg,#f59e0b,#ea580c)] bg-clip-text text-transparent">
							Ground Grid Generator
						</h2>
						<p className="m-0 mt-0.5 text-xs text-text-muted">
							Extract coordinates and generate ground grid designs
						</p>
					</div>

					<div className="flex items-center gap-2">
						<StatusPill
							isOk={backendConnected}
							label={backendConnected ? "AutoCAD Connected" : "AutoCAD Offline"}
						/>
						<StatusPill
							isOk={wsLive}
							label={wsLive ? "WS Live" : "WS Offline"}
							title={`Last WebSocket update: ${wsLiveStamp}`}
						/>
					</div>
				</div>

				<ScrollableTabs
					tabs={TABS}
					activeTab={activeTab}
					onTabChange={setActiveTab}
					logs={logs}
				/>
			</div>

			{/* Body */}
			<div className="relative z-10 min-h-0 flex-1 overflow-hidden">
				<div
					className={activeTab === "grabber" ? "h-full overflow-auto" : "hidden"}
				>
					<CoordinatesGrabber />
				</div>

				<div
					className={activeTab === "generator" ? "h-full overflow-auto" : "hidden"}
				>
					<GridGeneratorPanel />
				</div>

				<div
					className={
						activeTab === "log" ? "flex h-full flex-col overflow-hidden" : "hidden"
					}
				>
					<UnifiedLog />
				</div>
			</div>
		</div>
	);
}

export function GroundGridGeneratorApp() {
	return (
		<GroundGridProvider>
			<GroundGridGeneratorInner />
		</GroundGridProvider>
	);
}