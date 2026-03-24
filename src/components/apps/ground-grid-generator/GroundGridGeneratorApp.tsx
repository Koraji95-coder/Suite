// src/components/apps/ground-grid/GroundGridGeneratorApp.tsx
import { AlertTriangle, MapPin, ScrollText, Server, Signal } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { CoordinatesGrabber } from "../coordinatesgrabber/CoordinatesGrabber";
import { GridGeneratorPanel } from "./GridGeneratorPanel";
import { GroundGridProvider, useGroundGrid } from "./GroundGridContext";
import styles from "./GroundGridGeneratorApp.module.css";
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
			className={styles.tabsScroller}
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTab;
				const hasCount = tab.id === "log" && logs.length > 0;

				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => onTabChange(tab.id)}
						className={cn(
							styles.tabButton,
							isActive ? styles.tabButtonActive : styles.tabButtonInactive,
						)}
					>
						{tab.id === "log" ? <ScrollText size={13} /> : null}
						{tab.label}
						{hasCount ? (
							<span className={styles.tabBadge}>{logs.length}</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

function StatusPill({
	name,
	label,
	isOk,
	icon,
	title,
}: {
	name: string;
	label: string;
	isOk: boolean;
	icon: ReactNode;
	title?: string;
}) {
	return (
		<div
			className={cn(
				styles.statusPill,
				isOk ? styles.statusPillOk : styles.statusPillMuted,
			)}
			title={title}
		>
			<span
				className={cn(
					styles.statusIconWrap,
					isOk ? styles.statusIconWrapOk : styles.statusIconWrapMuted,
				)}
			>
				{icon}
			</span>
			<span className={styles.statusText}>
				<span className={styles.statusName}>{name}</span>
				<span className={styles.statusValue}>{label}</span>
			</span>
		</div>
	);
}

function GroundGridGeneratorInner() {
	const {
		addLog,
		backendConnected,
		logs,
		wsLastUpdate,
		wsLive,
		liveBackendStatus,
		reconnectBackend,
	} = useGroundGrid();

	const [activeTab, setActiveTab] = useState<TabId>("generator");
	const [isReconnecting, setIsReconnecting] = useState(false);

	const wsLiveStamp = useMemo(
		() => (wsLastUpdate ? new Date(wsLastUpdate).toLocaleTimeString() : "--"),
		[wsLastUpdate],
	);
	const drawingLabel = liveBackendStatus.drawingName
		? `Drawing: ${liveBackendStatus.drawingName}`
		: liveBackendStatus.autocadRunning
			? "Drawing present"
			: "No drawing open";
	const autoCadLabel = backendConnected ? drawingLabel : "Offline (start AutoCAD)";
	const autoCadTitle =
		liveBackendStatus.error !== null
			? `Error: ${liveBackendStatus.error}`
			: liveBackendStatus.drawingName
				? `Active drawing: ${liveBackendStatus.drawingName}`
				: "AutoCAD backend status";
	const wsLabel = wsLive
		? `Live (${wsLiveStamp})`
		: wsLastUpdate
			? `Offline (last ${wsLiveStamp})`
			: "Offline (awaiting status)";
	const wsTitle = wsLive
		? `Last update: ${wsLiveStamp}`
		: wsLastUpdate
			? `Last seen: ${wsLiveStamp}`
			: "Waiting for websocket status updates";
	const isDegraded = !backendConnected || !wsLive || Boolean(liveBackendStatus.error);
	const statusSummary = isDegraded
		? "Degraded mode: CAD-linked actions may be limited until connection is restored."
		: "Live mode: CAD-linked actions are available.";

	const handleReconnect = useCallback(async () => {
		setIsReconnecting(true);
		try {
			await reconnectBackend();
		} finally {
			setIsReconnecting(false);
		}
	}, [reconnectBackend]);

	return (
		<div className={styles.root}>
			{/* Header */}
			<div
				className={styles.header}
			>
				<div className={styles.headerRow}>
					<div className={styles.iconWrap}>
						<MapPin size={24} className={styles.icon} />
					</div>

					<div className={styles.titleWrap}>
						<h2 className={styles.title}>Grid Workspace</h2>
						<p className={styles.subtitle}>
							Coordinate capture, grid design, and live logs in one workspace
						</p>
					</div>

					<div className={styles.statusRow}>
						<StatusPill
							isOk={backendConnected}
							name="AutoCAD"
							label={autoCadLabel}
							icon={<Server size={14} />}
							title={autoCadTitle}
						/>
						<StatusPill
							isOk={wsLive}
							name="WebSocket"
							label={wsLabel}
							icon={<Signal size={14} />}
							title={wsTitle}
						/>
					</div>
					<div className={styles.statusExtras}>
						<span className={styles.statusExtraText}>
							{statusSummary}
						</span>
						<div className={styles.statusExtraActions}>
							{isDegraded ? (
								<span className={styles.degradedBadge}>
									<AlertTriangle size={12} />
									Degraded
								</span>
							) : null}
							{liveBackendStatus.error ? (
								<span className={styles.statusError}>
									{liveBackendStatus.error}
								</span>
							) : null}
							{(!wsLive || !backendConnected) && (
								<button
									type="button"
									className={styles.reconnectButton}
									onClick={handleReconnect}
									disabled={isReconnecting}
								>
									{isReconnecting ? "Retrying connection…" : "Retry connection"}
								</button>
							)}
						</div>
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
			<div className={styles.body}>
				<div
					className={cn(
						styles.panel,
						activeTab === "grabber" ? styles.panelScroll : styles.panelHidden,
					)}
				>
					<CoordinatesGrabber onLog={addLog} />
				</div>

				<div
					className={cn(
						styles.panel,
						activeTab === "generator" ? styles.panelScroll : styles.panelHidden,
					)}
				>
					<GridGeneratorPanel />
				</div>

				<div
					className={cn(
						styles.panel,
						activeTab === "log" ? styles.panelLog : styles.panelHidden,
					)}
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
