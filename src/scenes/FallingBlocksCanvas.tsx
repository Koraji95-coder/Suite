// src/scenes/FallingBlocksCanvas.tsx
import { Canvas } from "@react-three/fiber";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { PCFShadowMap } from "three";

const FallingBlocksScene = React.lazy(() => import("./FallingBlocksScene.tsx"));

function usePageVisible() {
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		const onVisibility = () => setVisible(!document.hidden);
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, []);

	return visible;
}

function useIsMobile(breakpointPx = 768) {
	const [isMobile, setIsMobile] = useState(() =>
		typeof window === "undefined" ? false : window.innerWidth < breakpointPx,
	);

	useEffect(() => {
		const onResize = () => setIsMobile(window.innerWidth < breakpointPx);
		window.addEventListener("resize", onResize, { passive: true });
		return () => window.removeEventListener("resize", onResize);
	}, [breakpointPx]);

	return isMobile;
}

export default function FallingBlocksCanvas() {
	const pageVisible = usePageVisible();
	const isMobile = useIsMobile(768);

	// Keep Canvas mounted; stop rendering while tab is hidden to avoid remount flash and save GPU.
	const frameloop = pageVisible ? "always" : "never";

	// Shadows are expensive; disable on mobile.
	const enableShadows = !isMobile;

	const dpr = useMemo(
		() => (isMobile ? 1 : ([1, 1.25] as [number, number])),
		[isMobile],
	);

	return (
		<Canvas
			frameloop={frameloop}
			camera={{ position: [0, 6, 30], fov: 55 }}
			dpr={dpr}
			shadows={enableShadows ? { type: PCFShadowMap } : false}
			gl={{
				antialias: true,
				alpha: false,
				stencil: false,
				depth: true,
				powerPreference: "high-performance",
			}}
			// Prevent white/grey flash even before the scene chunk loads:
			style={{ width: "100%", height: "100%", background: "#0c0b10" }}
			onCreated={({ gl }) => {
				gl.shadowMap.enabled = enableShadows;
				gl.shadowMap.type = PCFShadowMap;
			}}
		>
			{/* Background is immediate, even while Suspense is loading */}
			<color attach="background" args={["#0c0b10"]} />

			<Suspense fallback={null}>
				<FallingBlocksScene enableShadows={enableShadows} isMobile={isMobile} />
			</Suspense>
		</Canvas>
	);
}
