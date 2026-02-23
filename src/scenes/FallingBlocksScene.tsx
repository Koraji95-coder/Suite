// src/scenes/FallingBlocksScene.tsx
import { Environment, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useCallback, useMemo, useRef, useState } from "react";
import type {
	Fog,
	GridHelper,
	Group,
	LineBasicMaterial,
	MeshPhysicalMaterial,
} from "three";
import { useScrollContext } from "../context/ScrollContext";

const COLORS = [
	"#818cf8", // indigo – primary
	"#a78bfa", // violet – complement
	"#34d399", // emerald – secondary
	"#6ee7b7", // emerald-light
	"#fb923c", // orange – warm accent
	"#fdba74", // orange-light
	"#e2e8f0", // silver
	"#94a3b8", // cool gray
];

type Shape = "cube" | "sphere" | "cylinder" | "roundedBox";
const SHAPES: Shape[] = ["cube", "sphere", "cylinder", "roundedBox"];

type BlockDesc = {
	id: number;
	color: string;
	shape: Shape;
	scale: number;
	position: [number, number, number];
	velocity: [number, number, number];
	rotation: [number, number, number];
	rotSpeed: [number, number, number];
	glintTime: number;
};

function clampDelta(delta: number) {
	return Math.min(delta, 0.05);
}

function AmbientCameraRig({
	mouseX,
	mouseY,
}: {
	mouseX: React.RefObject<number>;
	mouseY: React.RefObject<number>;
}) {
	const smoothX = useRef(0);
	const smoothY = useRef(0);
	const elapsed = useRef(0);

	useFrame((state, delta) => {
		const dt = clampDelta(delta);
		elapsed.current += dt;
		const t = elapsed.current;

		smoothX.current +=
			(((mouseX.current ?? 0.5) - 0.5) * 1.5 - smoothX.current) * 0.02;
		smoothY.current +=
			(((mouseY.current ?? 0.5) - 0.5) * 0.8 - smoothY.current) * 0.02;

		const cam = state.camera;
		cam.position.x = Math.sin(t * 0.08) * 0.4 + smoothX.current;
		cam.position.y = 6 + Math.cos(t * 0.06) * 0.3 - smoothY.current * 0.5;
		cam.position.z = 30;
		cam.lookAt(0, -2, 0);
	});

	return null;
}

function GridPlane() {
	const gridRef = useRef<GridHelper>(null);

	useFrame(() => {
		if (gridRef.current) {
			(gridRef.current.material as LineBasicMaterial).opacity = 0.04;
		}
	});

	return (
		<gridHelper
			ref={gridRef}
			args={[80, 40, "#818cf8", "#1c1b24"]}
			position={[0, -15, 0]}
		>
			<meshBasicMaterial transparent opacity={0.04} depthWrite={false} />
		</gridHelper>
	);
}

function ScrollFog({
	scrollProgress,
}: {
	scrollProgress: React.RefObject<number>;
}) {
	const fogRef = useRef<Fog>(null);

	useFrame(() => {
		if (!fogRef.current) return;
		const s = scrollProgress.current ?? 0;
		fogRef.current.near = 20 + s * 8;
		fogRef.current.far = 55 + s * 15;
	});

	return <fog ref={fogRef} attach="fog" args={["#0c0b10", 20, 55]} />;
}

function DriftingBlock({
	block,
	onExpired,
	enableShadows,
}: {
	block: BlockDesc;
	onExpired: (id: number) => void;
	enableShadows: boolean;
}) {
	const groupRef = useRef<Group>(null);
	const matRef = useRef<MeshPhysicalMaterial>(null);
	const pos = useRef(block.position.slice() as [number, number, number]);
	const rot = useRef(block.rotation.slice() as [number, number, number]);
	const elapsed = useRef(0);

	useFrame((_state, delta) => {
		if (!groupRef.current) return;

		const dt = clampDelta(delta);
		elapsed.current += dt;
		const t = elapsed.current;

		pos.current[0] += block.velocity[0] * dt;
		pos.current[1] += block.velocity[1] * dt;
		pos.current[2] += block.velocity[2] * dt;

		rot.current[0] += block.rotSpeed[0] * dt;
		rot.current[1] += block.rotSpeed[1] * dt;
		rot.current[2] += block.rotSpeed[2] * dt;

		groupRef.current.position.set(
			pos.current[0],
			pos.current[1],
			pos.current[2],
		);
		groupRef.current.rotation.set(
			rot.current[0],
			rot.current[1],
			rot.current[2],
		);

		if (matRef.current) {
			const glintPhase = (t - block.glintTime) % (8 + (block.id % 5));
			matRef.current.emissiveIntensity =
				glintPhase < 0.3
					? 0.15 + Math.sin((glintPhase / 0.3) * Math.PI) * 0.4
					: 0.15;
		}

		if (pos.current[1] < -18) onExpired(block.id);
	});

	const materialProps = useMemo(
		() => ({
			color: block.color,
			metalness: 0.95,
			roughness: 0.05,
			emissive: block.color,
			emissiveIntensity: 0.12,
			clearcoat: 1.0,
			clearcoatRoughness: 0.06,
			reflectivity: 1,
			envMapIntensity: 2.0,
		}),
		[block.color],
	);

	return (
		<group ref={groupRef} position={block.position} rotation={block.rotation}>
			{block.shape !== "roundedBox" && (
				<mesh castShadow={enableShadows} receiveShadow={false}>
					{block.shape === "sphere" && (
						<sphereGeometry args={[block.scale, 24, 24]} />
					)}
					{block.shape === "cube" && (
						<boxGeometry args={[block.scale, block.scale, block.scale]} />
					)}
					{block.shape === "cylinder" && (
						<cylinderGeometry
							args={[
								block.scale * 0.5,
								block.scale * 0.5,
								block.scale * 1.4,
								20,
							]}
						/>
					)}
					<meshPhysicalMaterial ref={matRef} {...materialProps} />
				</mesh>
			)}

			{block.shape === "roundedBox" && (
				<RoundedBox
					args={[block.scale, block.scale, block.scale]}
					radius={block.scale * 0.15}
					smoothness={4}
					castShadow={enableShadows}
					receiveShadow={false}
				>
					<meshPhysicalMaterial ref={matRef} {...materialProps} />
				</RoundedBox>
			)}
		</group>
	);
}

function FallingBlocks({
	burstTrigger,
	enableShadows,
	isMobile,
}: {
	burstTrigger: React.RefObject<number>;
	enableShadows: boolean;
	isMobile: boolean;
}) {
	const [items, setItems] = useState<BlockDesc[]>([]);
	const nextId = useRef(0);
	const spawnTimer = useRef(0);
	const lastBurst = useRef(0);
	const burstQueue = useRef(0);

	const spawnInterval = isMobile ? 0.9 : 0.7;
	const maxBlocks = isMobile ? 25 : 60;

	const spawnBlock = useCallback((): BlockDesc => {
		return {
			id: nextId.current++,
			color: COLORS[Math.floor(Math.random() * COLORS.length)],
			shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
			scale: 0.2 + Math.random() * 0.7,
			position: [
				(Math.random() - 0.5) * 50,
				18 + Math.random() * 25,
				(Math.random() - 0.5) * 40,
			],
			velocity: [
				(Math.random() - 0.5) * 0.8,
				-(0.6 + Math.random() * 1.2),
				(Math.random() - 0.5) * 0.4,
			],
			rotation: [
				Math.random() * Math.PI * 2,
				Math.random() * Math.PI * 2,
				Math.random() * Math.PI * 2,
			],
			rotSpeed: [
				(Math.random() - 0.5) * 0.4,
				(Math.random() - 0.5) * 0.4,
				(Math.random() - 0.5) * 0.4,
			],
			glintTime: Math.random() * 10,
		};
	}, []);

	const handleExpired = useCallback((id: number) => {
		setItems((prev) => prev.filter((b) => b.id !== id));
	}, []);

	useFrame((_state, delta) => {
		spawnTimer.current += clampDelta(delta);

		if ((burstTrigger.current ?? 0) > lastBurst.current) {
			lastBurst.current = burstTrigger.current ?? 0;
			burstQueue.current = isMobile ? 2 : 4;
		}

		const interval = burstQueue.current > 0 ? 0.1 : spawnInterval;
		if (spawnTimer.current > interval) {
			spawnTimer.current = 0;
			if (burstQueue.current > 0) burstQueue.current--;

			setItems((prev) => {
				const capped =
					prev.length >= maxBlocks
						? prev.slice(prev.length - maxBlocks + 1)
						: prev;
				return [...capped, spawnBlock()];
			});
		}
	});

	return (
		<>
			{items.map((it) => (
				<DriftingBlock
					key={it.id}
					block={it}
					onExpired={handleExpired}
					enableShadows={enableShadows}
				/>
			))}
		</>
	);
}

export default function FallingBlocksScene({
	enableShadows,
	isMobile,
}: {
	enableShadows: boolean;
	isMobile: boolean;
}) {
	const { burstTrigger, scrollProgress, mouseX, mouseY } = useScrollContext();

	return (
		<>
			<ScrollFog scrollProgress={scrollProgress} />

			<ambientLight intensity={0.22} />
			<directionalLight
				position={[10, 15, 8]}
				intensity={1.3}
				castShadow={enableShadows}
				shadow-mapSize={enableShadows ? [512, 512] : [0, 0]}
				shadow-bias={-0.0002}
				shadow-normalBias={0.02}
			/>
			<pointLight position={[-8, 10, -5]} intensity={0.6} color="#818cf8" />
			<pointLight position={[8, 8, 5]} intensity={0.5} color="#34d399" />
			<pointLight position={[0, -5, 10]} intensity={0.3} color="#fb923c" />

			<Environment preset="city" environmentIntensity={isMobile ? 0.25 : 0.4} />

			<GridPlane />
			<AmbientCameraRig mouseX={mouseX} mouseY={mouseY} />
			<FallingBlocks
				burstTrigger={burstTrigger}
				enableShadows={enableShadows}
				isMobile={isMobile}
			/>
		</>
	);
}
