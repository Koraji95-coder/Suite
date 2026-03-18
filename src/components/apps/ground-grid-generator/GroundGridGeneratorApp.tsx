// src/components/apps/ground-grid/GroundGridGeneratorApp.tsx
import { MapPin, ScrollText, Server, Signal } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { coordinatesGrabberService } from "@/components/apps/ground-grid-generator/coordinatesGrabberService";
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
	const { backendConnected, logs } = useGroundGrid();

	const [wsLive, setWsLive] = useState(() =>
		coordinatesGrabberService.isConnected(),
	);
	const [wsLastUpdate, setWsLastUpdate] = useState<number | null>(null);
	const [activeTab, setActiveTab] = useState<TabId>("generator");

	useEffect(() => {
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
							label={backendConnected ? "Connected" : "Offline"}
							icon={<Server size={14} />}
						/>
						<StatusPill
							isOk={wsLive}
							name="WebSocket"
							label={wsLive ? "Live" : "Offline"}
							icon={<Signal size={14} />}
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
			<div className={styles.body}>
				<div
					className={cn(
						styles.panel,
						activeTab === "grabber" ? styles.panelScroll : styles.panelHidden,
					)}
				>
					<CoordinatesGrabber />
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
