import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridPreview3DProps {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
}

const AMBER = 0xf59e0b;
const GREEN = 0x22c55e;
const RED = 0xef4444;
const BLUE = 0x3b82f6;
const CYAN = 0x06b6d4;
const GROUND_COLOR = 0x2a1f0e;

export function GridPreview3D({
	rods,
	conductors,
	placements,
}: GridPreview3DProps) {
	const { palette } = useTheme();
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const [paused, setPaused] = useState(false);
	const pausedRef = useRef(false);

	const togglePause = useCallback(() => {
		setPaused((p) => {
			pausedRef.current = !p;
			return !p;
		});
	}, []);

	const bounds = useMemo(() => {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const r of rods) {
			minX = Math.min(minX, r.grid_x);
			minY = Math.min(minY, r.grid_y);
			maxX = Math.max(maxX, r.grid_x);
			maxY = Math.max(maxY, r.grid_y);
		}
		for (const c of conductors) {
			minX = Math.min(minX, c.x1, c.x2);
			minY = Math.min(minY, c.y1, c.y2);
			maxX = Math.max(maxX, c.x1, c.x2);
			maxY = Math.max(maxY, c.y1, c.y2);
		}
		if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
		return { minX, minY, maxX, maxY };
	}, [rods, conductors]);

	const hasData = rods.length > 0 || conductors.length > 0;

	useEffect(() => {
		if (!canvasRef.current || !containerRef.current || !hasData) return;

		const canvas = canvasRef.current;
		const container = containerRef.current;
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(
			55,
			container.clientWidth / container.clientHeight,
			0.1,
			2000,
		);
		const renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
		});
		rendererRef.current = renderer;
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.2;

		const cx = (bounds.minX + bounds.maxX) / 2;
		const cy = (bounds.minY + bounds.maxY) / 2;
		const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
		const scale = 1 / Math.max(span, 1);

		const gridGroup = new THREE.Group();
		scene.add(gridGroup);

		const groundGeo = new THREE.PlaneGeometry(2, 2);
		const groundMat = new THREE.MeshStandardMaterial({
			color: GROUND_COLOR,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide,
		});
		const ground = new THREE.Mesh(groundGeo, groundMat);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.01;
		gridGroup.add(ground);

		const subGround = new THREE.PlaneGeometry(2, 2);
		const subGroundMat = new THREE.MeshStandardMaterial({
			color: 0x1a1408,
			transparent: true,
			opacity: 0.4,
			side: THREE.DoubleSide,
		});
		const subGroundMesh = new THREE.Mesh(subGround, subGroundMat);
		subGroundMesh.rotation.x = -Math.PI / 2;
		subGroundMesh.position.y = -0.15;
		gridGroup.add(subGroundMesh);

		const conductorMat = new THREE.MeshStandardMaterial({
			color: AMBER,
			emissive: new THREE.Color(AMBER).multiplyScalar(0.15),
			metalness: 0.6,
			roughness: 0.3,
		});

		for (const c of conductors) {
			const x1 = (c.x1 - cx) * scale;
			const z1 = (c.y1 - cy) * scale;
			const x2 = (c.x2 - cx) * scale;
			const z2 = (c.y2 - cy) * scale;
			const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
			if (len < 0.001) continue;

			const tube = new THREE.CylinderGeometry(0.004, 0.004, len, 6);
			const mesh = new THREE.Mesh(tube, conductorMat);
			mesh.position.set((x1 + x2) / 2, 0.005, (z1 + z2) / 2);
			mesh.rotation.z = Math.PI / 2;
			mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
			gridGroup.add(mesh);
		}

		const rodMat = new THREE.MeshStandardMaterial({
			color: GREEN,
			emissive: new THREE.Color(GREEN).multiplyScalar(0.2),
			metalness: 0.5,
			roughness: 0.4,
		});

		const testWellMat = new THREE.MeshStandardMaterial({
			color: RED,
			emissive: new THREE.Color(RED).multiplyScalar(0.2),
			metalness: 0.5,
			roughness: 0.4,
		});

		const testWellSet = new Set(
			placements
				.filter((p) => p.type === "GROUND_ROD_TEST_WELL")
				.map((p) => `${p.grid_x},${p.grid_y}`),
		);

		for (const r of rods) {
			const x = (r.grid_x - cx) * scale;
			const z = (r.grid_y - cy) * scale;
			const rodHeight = 0.08;
			const isTestWell = testWellSet.has(`${r.grid_x},${r.grid_y}`);

			const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, rodHeight, 8);
			const mesh = new THREE.Mesh(rodGeo, isTestWell ? testWellMat : rodMat);
			mesh.position.set(x, -rodHeight / 2 + 0.005, z);
			gridGroup.add(mesh);

			const capGeo = new THREE.SphereGeometry(0.008, 8, 6);
			const cap = new THREE.Mesh(capGeo, isTestWell ? testWellMat : rodMat);
			cap.position.set(x, 0.008, z);
			gridGroup.add(cap);
		}

		const teeMat = new THREE.MeshStandardMaterial({
			color: BLUE,
			emissive: new THREE.Color(BLUE).multiplyScalar(0.2),
		});
		const crossMat = new THREE.MeshStandardMaterial({
			color: CYAN,
			emissive: new THREE.Color(CYAN).multiplyScalar(0.2),
		});

		for (const p of placements) {
			if (p.type !== "TEE" && p.type !== "CROSS") continue;
			const x = (p.grid_x - cx) * scale;
			const z = (p.grid_y - cy) * scale;
			const mat = p.type === "TEE" ? teeMat : crossMat;
			const marker = new THREE.Mesh(
				new THREE.BoxGeometry(0.012, 0.004, 0.012),
				mat,
			);
			marker.position.set(x, 0.007, z);
			if (p.type === "TEE")
				marker.rotation.y = (p.rotation_deg * Math.PI) / 180;
			gridGroup.add(marker);
		}

		const ambient = new THREE.AmbientLight(0xffffff, 0.4);
		scene.add(ambient);

		const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
		dirLight.position.set(2, 4, 3);
		scene.add(dirLight);

		const pointLight = new THREE.PointLight(AMBER, 0.6, 10);
		pointLight.position.set(0, 1, 0);
		scene.add(pointLight);

		const radius = 1.55;
		let mouseDown = false;
		let lastMouse = { x: 0, y: 0 };
		let theta = Math.PI / 4;
		let phi = Math.PI / 4;

		camera.position.set(
			radius * Math.sin(phi) * Math.cos(theta),
			radius * Math.cos(phi),
			radius * Math.sin(phi) * Math.sin(theta),
		);
		camera.lookAt(0, 0, 0);

		const updateCamera = () => {
			camera.position.x = radius * Math.sin(phi) * Math.cos(theta);
			camera.position.y = radius * Math.cos(phi);
			camera.position.z = radius * Math.sin(phi) * Math.sin(theta);
			camera.lookAt(0, 0, 0);
		};

		const onMouseDown = (e: MouseEvent) => {
			mouseDown = true;
			lastMouse = { x: e.clientX, y: e.clientY };
		};
		const onMouseMove = (e: MouseEvent) => {
			if (!mouseDown) return;
			const dx = e.clientX - lastMouse.x;
			const dy = e.clientY - lastMouse.y;
			theta -= dx * 0.005;
			phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05, phi + dy * 0.005));
			lastMouse = { x: e.clientX, y: e.clientY };
			updateCamera();
		};
		const onMouseUp = () => {
			mouseDown = false;
		};

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
		};

		canvas.addEventListener("mousedown", onMouseDown);
		canvas.addEventListener("wheel", onWheel, { passive: false });
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		const handleResize = () => {
			if (!container) return;
			camera.aspect = container.clientWidth / container.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(container.clientWidth, container.clientHeight);
		};
		window.addEventListener("resize", handleResize);

		let disposed = false;
		let animId = 0;

		const animate = () => {
			if (disposed) return;
			animId = requestAnimationFrame(animate);

			if (!mouseDown && !pausedRef.current) {
				theta += 0.002;
				updateCamera();
			}

			renderer.render(scene, camera);
		};
		animate();

		return () => {
			disposed = true;
			cancelAnimationFrame(animId);
			canvas.removeEventListener("mousedown", onMouseDown);
			canvas.removeEventListener("wheel", onWheel);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			window.removeEventListener("resize", handleResize);
			renderer.dispose();
			scene.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					obj.geometry.dispose();
					if (Array.isArray(obj.material))
						obj.material.forEach((m) => m.dispose());
					else obj.material.dispose();
				}
			});
		};
	}, [hasData, rods, conductors, placements, bounds]);

	if (!hasData) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100%",
					minHeight: 300,
					color: palette.textMuted,
					fontSize: 13,
				}}
			>
				Import data to see the 3D preview
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				minHeight: 400,
			}}
		>
			<canvas
				ref={canvasRef}
				style={{
					width: "100%",
					height: "100%",
					borderRadius: 8,
					cursor: "grab",
				}}
			/>
			<button
				onClick={togglePause}
				style={{
					position: "absolute",
					top: 8,
					left: 8,
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "4px 10px",
					fontSize: 10,
					fontWeight: 600,
					color: palette.text,
					background: hexToRgba(palette.background, 0.8),
					border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
					borderRadius: 5,
					cursor: "pointer",
					backdropFilter: "blur(4px)",
				}}
			>
				{paused ? <Play size={11} /> : <Pause size={11} />}
				{paused ? "Play" : "Pause"}
			</button>
			<div
				style={{
					position: "absolute",
					top: 8,
					right: 8,
					fontSize: 9,
					color: hexToRgba(palette.textMuted, 0.6),
					background: hexToRgba(palette.background, 0.7),
					padding: "3px 8px",
					borderRadius: 4,
					pointerEvents: "none",
				}}
			>
				Drag to orbit{paused ? "" : " / Auto-rotating"}
			</div>
		</div>
	);
}
