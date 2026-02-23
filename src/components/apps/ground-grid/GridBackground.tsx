import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";

const COPPER = "#f59e0b";
const ROD_GREEN = "#22c55e";
const HEATMAP_SAFE = "#22c55e";
const HEATMAP_MID = "#eab308";
const HEATMAP_DANGER = "#ef4444";

interface GridLayout {
	rods: { x: number; y: number }[];
	hLines: { y: number; x1: number; x2: number }[];
	vLines: { x: number; y1: number; y2: number }[];
	width: number;
	height: number;
}

function generateRandomGrid(): GridLayout {
	const cols = 3 + Math.floor(Math.random() * 4);
	const rows = 3 + Math.floor(Math.random() * 4);
	const spacingX = 2 + Math.random() * 1.5;
	const spacingY = 2 + Math.random() * 1.5;
	const width = (cols - 1) * spacingX;
	const height = (rows - 1) * spacingY;

	const rods: { x: number; y: number }[] = [];
	const hLines: { y: number; x1: number; x2: number }[] = [];
	const vLines: { x: number; y1: number; y2: number }[] = [];

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (Math.random() > 0.3) {
				rods.push({
					x: c * spacingX - width / 2,
					y: r * spacingY - height / 2,
				});
			}
		}
	}

	for (let r = 0; r < rows; r++) {
		const skipGap = Math.random() > 0.85;
		if (skipGap) {
			const gapCol = 1 + Math.floor(Math.random() * (cols - 2));
			hLines.push({
				y: r * spacingY - height / 2,
				x1: -width / 2,
				x2: (gapCol - 1) * spacingX - width / 2,
			});
			hLines.push({
				y: r * spacingY - height / 2,
				x1: gapCol * spacingX - width / 2,
				x2: width / 2,
			});
		} else {
			hLines.push({
				y: r * spacingY - height / 2,
				x1: -width / 2,
				x2: width / 2,
			});
		}
	}

	for (let c = 0; c < cols; c++) {
		vLines.push({
			x: c * spacingX - width / 2,
			y1: -height / 2,
			y2: height / 2,
		});
	}

	return { rods, hLines, vLines, width, height };
}

function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
	return new THREE.Color().lerpColors(a, b, t);
}

interface GridBackgroundProps {
	opacity?: number;
}

export function GridBackground({ opacity = 0.35 }: GridBackgroundProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const stateRef = useRef<{
		renderer: THREE.WebGLRenderer;
		scene: THREE.Scene;
		camera: THREE.OrthographicCamera;
		grid: GridLayout;
		gridGroup: THREE.Group;
		heatmapMesh: THREE.Mesh;
		heatmapCtx: CanvasRenderingContext2D;
		heatmapTexture: THREE.CanvasTexture;
		clock: THREE.Clock;
		rafId: number;
		disposed: boolean;
		transitionStart: number;
		nextGrid: GridLayout | null;
		phase: "showing" | "fading" | "building";
		cycleDuration: number;
	} | null>(null);

	const buildGridObjects = useCallback(
		(scene: THREE.Scene, grid: GridLayout): THREE.Group => {
			const group = new THREE.Group();

			const conductorMat = new THREE.LineBasicMaterial({
				color: COPPER,
				transparent: true,
				opacity: 0.6,
			});

			for (const h of grid.hLines) {
				const geo = new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(h.x1, h.y, 0),
					new THREE.Vector3(h.x2, h.y, 0),
				]);
				group.add(new THREE.Line(geo, conductorMat));
			}

			for (const v of grid.vLines) {
				const geo = new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(v.x, v.y1, 0),
					new THREE.Vector3(v.x, v.y2, 0),
				]);
				group.add(new THREE.Line(geo, conductorMat));
			}

			const rodGeo = new THREE.CircleGeometry(0.15, 16);
			const rodMat = new THREE.MeshBasicMaterial({
				color: ROD_GREEN,
				transparent: true,
				opacity: 0.7,
			});
			const crossMat = new THREE.LineBasicMaterial({
				color: ROD_GREEN,
				transparent: true,
				opacity: 0.8,
			});

			for (const rod of grid.rods) {
				const circle = new THREE.Mesh(rodGeo, rodMat);
				circle.position.set(rod.x, rod.y, 0.01);
				group.add(circle);

				const arm = 0.1;
				const hGeo = new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(rod.x - arm, rod.y, 0.02),
					new THREE.Vector3(rod.x + arm, rod.y, 0.02),
				]);
				const vGeo = new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(rod.x, rod.y - arm, 0.02),
					new THREE.Vector3(rod.x, rod.y + arm, 0.02),
				]);
				group.add(new THREE.Line(hGeo, crossMat));
				group.add(new THREE.Line(vGeo, crossMat));
			}

			scene.add(group);
			return group;
		},
		[],
	);

	const renderHeatmap = useCallback(
		(ctx: CanvasRenderingContext2D, grid: GridLayout, elapsed: number) => {
			const size = 256;
			ctx.clearRect(0, 0, size, size);

			const safe = new THREE.Color(HEATMAP_SAFE);
			const mid = new THREE.Color(HEATMAP_MID);
			const danger = new THREE.Color(HEATMAP_DANGER);

			const pad = 2;
			const totalW = grid.width + pad * 2;
			const totalH = grid.height + pad * 2;

			const imageData = ctx.createImageData(size, size);
			const data = imageData.data;

			for (let py = 0; py < size; py++) {
				for (let px = 0; px < size; px++) {
					const worldX = (px / size) * totalW - totalW / 2;
					const worldY = (py / size) * totalH - totalH / 2;

					let minDist = Infinity;
					for (const rod of grid.rods) {
						const dx = worldX - rod.x;
						const dy = worldY - rod.y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < minDist) minDist = dist;
					}

					for (const h of grid.hLines) {
						if (worldX >= h.x1 && worldX <= h.x2) {
							const dist = Math.abs(worldY - h.y);
							if (dist < minDist) minDist = dist;
						}
					}
					for (const v of grid.vLines) {
						if (worldY >= v.y1 && worldY <= v.y2) {
							const dist = Math.abs(worldX - v.x);
							if (dist < minDist) minDist = dist;
						}
					}

					const maxRange = Math.max(totalW, totalH) * 0.5;
					const pulse = 0.8 + 0.2 * Math.sin(elapsed * 0.5 + minDist * 0.3);
					const t = Math.min(1, (minDist / maxRange) * pulse);

					let color: THREE.Color;
					if (t < 0.5) {
						color = lerpColor(safe, mid, t * 2);
					} else {
						color = lerpColor(mid, danger, (t - 0.5) * 2);
					}

					const idx = (py * size + px) * 4;
					data[idx] = Math.round(color.r * 255);
					data[idx + 1] = Math.round(color.g * 255);
					data[idx + 2] = Math.round(color.b * 255);
					data[idx + 3] = Math.round(100 * (0.3 + 0.7 * t));
				}
			}

			ctx.putImageData(imageData, 0, 0);
		},
		[],
	);

	useEffect(() => {
		if (!containerRef.current) return;
		const container = containerRef.current;

		const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(container.clientWidth, container.clientHeight);
		container.appendChild(renderer.domElement);

		const aspect = container.clientWidth / container.clientHeight;
		const frustum = 10;
		const camera = new THREE.OrthographicCamera(
			-frustum * aspect,
			frustum * aspect,
			frustum,
			-frustum,
			0.1,
			100,
		);
		camera.position.set(0, 0, 10);
		camera.lookAt(0, 0, 0);

		const scene = new THREE.Scene();

		const grid = generateRandomGrid();
		const gridGroup = buildGridObjects(scene, grid);

		const heatmapCanvas = document.createElement("canvas");
		heatmapCanvas.width = 256;
		heatmapCanvas.height = 256;
		const heatmapCtx = heatmapCanvas.getContext("2d")!;
		const heatmapTexture = new THREE.CanvasTexture(heatmapCanvas);
		heatmapTexture.minFilter = THREE.LinearFilter;
		heatmapTexture.magFilter = THREE.LinearFilter;

		const pad = 2;
		const hmW = grid.width + pad * 2;
		const hmH = grid.height + pad * 2;
		const heatmapGeo = new THREE.PlaneGeometry(hmW, hmH);
		const heatmapMat = new THREE.MeshBasicMaterial({
			map: heatmapTexture,
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
		});
		const heatmapMesh = new THREE.Mesh(heatmapGeo, heatmapMat);
		heatmapMesh.position.z = -0.01;
		scene.add(heatmapMesh);

		const clock = new THREE.Clock();

		const state = {
			renderer,
			scene,
			camera,
			grid,
			gridGroup,
			heatmapMesh,
			heatmapCtx,
			heatmapTexture,
			clock,
			rafId: 0,
			disposed: false,
			transitionStart: 0,
			nextGrid: null as GridLayout | null,
			phase: "showing" as "showing" | "fading" | "building",
			cycleDuration: 8 + Math.random() * 6,
		};
		stateRef.current = state;

		let heatmapFrame = 0;

		const tick = () => {
			if (state.disposed) return;
			state.rafId = requestAnimationFrame(tick);

			const elapsed = state.clock.getElapsedTime();

			if (
				state.phase === "showing" &&
				elapsed - state.transitionStart > state.cycleDuration
			) {
				state.phase = "fading";
				state.transitionStart = elapsed;
				state.nextGrid = generateRandomGrid();
			}

			if (state.phase === "fading") {
				const fadeProgress = Math.min(
					1,
					(elapsed - state.transitionStart) / 1.2,
				);
				state.gridGroup.traverse((obj) => {
					if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
						const mat = obj.material as THREE.Material & { opacity: number };
						if (mat.transparent)
							mat.opacity = mat.userData.baseOpacity * (1 - fadeProgress);
					}
				});
				(state.heatmapMesh.material as THREE.MeshBasicMaterial).opacity =
					0.5 * (1 - fadeProgress);

				if (fadeProgress >= 1) {
					state.phase = "building";
					state.transitionStart = elapsed;

					scene.remove(state.gridGroup);
					state.gridGroup.traverse((obj) => {
						if (obj instanceof THREE.Line) {
							(obj as THREE.Line).geometry.dispose();
						} else if (obj instanceof THREE.Mesh) {
							(obj as THREE.Mesh).geometry.dispose();
						}
					});

					state.grid = state.nextGrid!;
					state.gridGroup = buildGridObjects(scene, state.grid);

					state.gridGroup.traverse((obj) => {
						if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
							const mat = obj.material as THREE.Material & { opacity: number };
							if (mat.transparent) {
								mat.userData.baseOpacity = mat.opacity;
								mat.opacity = 0;
							}
						}
					});

					const p = 2;
					const w = state.grid.width + p * 2;
					const h = state.grid.height + p * 2;
					state.heatmapMesh.geometry.dispose();
					state.heatmapMesh.geometry = new THREE.PlaneGeometry(w, h);
					(state.heatmapMesh.material as THREE.MeshBasicMaterial).opacity = 0;
				}
			}

			if (state.phase === "building") {
				const buildProgress = Math.min(
					1,
					(elapsed - state.transitionStart) / 1.5,
				);
				state.gridGroup.traverse((obj) => {
					if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
						const mat = obj.material as THREE.Material & { opacity: number };
						if (mat.transparent)
							mat.opacity = (mat.userData.baseOpacity || 0.6) * buildProgress;
					}
				});
				(state.heatmapMesh.material as THREE.MeshBasicMaterial).opacity =
					0.5 * buildProgress;

				if (buildProgress >= 1) {
					state.phase = "showing";
					state.transitionStart = elapsed;
					state.cycleDuration = 8 + Math.random() * 6;
					state.nextGrid = null;
				}
			}

			heatmapFrame++;
			if (heatmapFrame % 3 === 0) {
				renderHeatmap(state.heatmapCtx, state.grid, elapsed);
				state.heatmapTexture.needsUpdate = true;
			}

			camera.position.x = Math.sin(elapsed * 0.08) * 0.5;
			camera.position.y = Math.cos(elapsed * 0.06) * 0.3;

			renderer.render(scene, camera);
		};

		state.gridGroup.traverse((obj) => {
			if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
				const mat = obj.material as THREE.Material & { opacity: number };
				if (mat.transparent) mat.userData.baseOpacity = mat.opacity;
			}
		});

		tick();

		const handleResize = () => {
			if (state.disposed || !container) return;
			const w = container.clientWidth;
			const h = container.clientHeight;
			const a = w / h;
			camera.left = -frustum * a;
			camera.right = frustum * a;
			camera.top = frustum;
			camera.bottom = -frustum;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		};
		window.addEventListener("resize", handleResize);

		return () => {
			state.disposed = true;
			cancelAnimationFrame(state.rafId);
			window.removeEventListener("resize", handleResize);
			renderer.dispose();
			if (container.contains(renderer.domElement)) {
				container.removeChild(renderer.domElement);
			}
		};
	}, [buildGridObjects, renderHeatmap]);

	return (
		<div
			ref={containerRef}
			style={{
				position: "absolute",
				inset: 0,
				opacity,
				pointerEvents: "none",
				overflow: "hidden",
			}}
		/>
	);
}
