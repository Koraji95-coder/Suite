import * as THREE from "three";

const COPPER = "#f59e0b";
const ROD_GREEN = "#22c55e";
const HEATMAP_SAFE = "#22c55e";
const HEATMAP_MID = "#eab308";
const HEATMAP_DANGER = "#ef4444";

type FadeMaterial = {
	transparent?: boolean;
	opacity?: number;
	userData: { baseOpacity?: number };
};

interface GridLayout {
	rods: { x: number; y: number }[];
	hLines: { y: number; x1: number; x2: number }[];
	vLines: { x: number; y1: number; y2: number }[];
	width: number;
	height: number;
}

interface GridBackgroundRuntimeState {
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

	for (let r = 0; r < rows; r += 1) {
		for (let c = 0; c < cols; c += 1) {
			if (Math.random() > 0.3) {
				rods.push({
					x: c * spacingX - width / 2,
					y: r * spacingY - height / 2,
				});
			}
		}
	}

	for (let r = 0; r < rows; r += 1) {
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

	for (let c = 0; c < cols; c += 1) {
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

function disposeObject3D(root: THREE.Object3D) {
	const materials = new Set<THREE.Material>();

	root.traverse((obj) => {
		if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
			obj.geometry.dispose();
			const mat = obj.material;
			if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
			else materials.add(mat);
		}
	});

	for (const material of materials) {
		material.dispose();
	}
}

function buildGridObjects(scene: THREE.Scene, grid: GridLayout): THREE.Group {
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
		const horizontalGeo = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(rod.x - arm, rod.y, 0.02),
			new THREE.Vector3(rod.x + arm, rod.y, 0.02),
		]);
		const verticalGeo = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(rod.x, rod.y - arm, 0.02),
			new THREE.Vector3(rod.x, rod.y + arm, 0.02),
		]);
		group.add(new THREE.Line(horizontalGeo, crossMat));
		group.add(new THREE.Line(verticalGeo, crossMat));
	}

	scene.add(group);
	return group;
}

function renderHeatmap(
	ctx: CanvasRenderingContext2D,
	grid: GridLayout,
	elapsed: number,
) {
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

	for (let py = 0; py < size; py += 1) {
		for (let px = 0; px < size; px += 1) {
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

			const color =
				t < 0.5
					? lerpColor(safe, mid, t * 2)
					: lerpColor(mid, danger, (t - 0.5) * 2);

			const idx = (py * size + px) * 4;
			data[idx] = Math.round(color.r * 255);
			data[idx + 1] = Math.round(color.g * 255);
			data[idx + 2] = Math.round(color.b * 255);
			data[idx + 3] = Math.round(100 * (0.3 + 0.7 * t));
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

function initializeRuntime(
	container: HTMLDivElement,
): GridBackgroundRuntimeState {
	const initialWidth = Math.max(container.clientWidth, 1);
	const initialHeight = Math.max(container.clientHeight, 1);

	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(initialWidth, initialHeight);
	renderer.domElement.style.pointerEvents = "none";
	renderer.domElement.style.width = "100%";
	renderer.domElement.style.height = "100%";
	renderer.domElement.setAttribute("aria-hidden", "true");
	container.appendChild(renderer.domElement);

	const aspect = initialWidth / initialHeight;
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
	const heatmapCtx = heatmapCanvas.getContext("2d");
	if (!heatmapCtx) throw new Error("Failed to create heatmap context");
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

	const state: GridBackgroundRuntimeState = {
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
		nextGrid: null,
		phase: "showing",
		cycleDuration: 8 + Math.random() * 6,
	};

	state.gridGroup.traverse((obj) => {
		if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
			const mat = obj.material as unknown as FadeMaterial;
			if (mat.transparent) mat.userData.baseOpacity = mat.opacity ?? 1;
		}
	});

	return state;
}

function runTransitionStep(state: GridBackgroundRuntimeState, elapsed: number) {
	const scene = state.scene;

	if (
		state.phase === "showing" &&
		elapsed - state.transitionStart > state.cycleDuration
	) {
		state.phase = "fading";
		state.transitionStart = elapsed;
		state.nextGrid = generateRandomGrid();
	}

	if (state.phase === "fading") {
		const fadeProgress = Math.min(1, (elapsed - state.transitionStart) / 1.2);

		state.gridGroup.traverse((obj) => {
			if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
				const mat = obj.material as unknown as FadeMaterial;
				if (mat.transparent) {
					const base = Number(mat.userData.baseOpacity ?? mat.opacity ?? 1);
					mat.opacity = base * (1 - fadeProgress);
				}
			}
		});

		(state.heatmapMesh.material as THREE.MeshBasicMaterial).opacity =
			0.5 * (1 - fadeProgress);

		if (fadeProgress >= 1 && state.nextGrid) {
			state.phase = "building";
			state.transitionStart = elapsed;

			const oldGroup = state.gridGroup;
			scene.remove(oldGroup);
			disposeObject3D(oldGroup);

			state.grid = state.nextGrid;
			state.gridGroup = buildGridObjects(scene, state.grid);

			state.gridGroup.traverse((obj) => {
				if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
					const mat = obj.material as unknown as FadeMaterial;
					if (mat.transparent) {
						mat.userData.baseOpacity = mat.opacity ?? 1;
						mat.opacity = 0;
					}
				}
			});

			const pad = 2;
			const width = state.grid.width + pad * 2;
			const height = state.grid.height + pad * 2;
			state.heatmapMesh.geometry.dispose();
			state.heatmapMesh.geometry = new THREE.PlaneGeometry(width, height);
			(state.heatmapMesh.material as THREE.MeshBasicMaterial).opacity = 0;
		}
	}

	if (state.phase === "building") {
		const buildProgress = Math.min(1, (elapsed - state.transitionStart) / 1.5);

		state.gridGroup.traverse((obj) => {
			if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
				const mat = obj.material as unknown as FadeMaterial;
				if (mat.transparent) {
					const base = Number(mat.userData.baseOpacity ?? 1);
					mat.opacity = base * buildProgress;
				}
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
}

export function createGridBackgroundEngine(
	container: HTMLDivElement,
): () => void {
	const state = initializeRuntime(container);
	const frustum = 10;

	let heatmapFrame = 0;

	const tick = () => {
		if (state.disposed) return;
		state.rafId = requestAnimationFrame(tick);

		const elapsed = state.clock.getElapsedTime();
		runTransitionStep(state, elapsed);

		heatmapFrame += 1;
		if (heatmapFrame % 3 === 0) {
			renderHeatmap(state.heatmapCtx, state.grid, elapsed);
			state.heatmapTexture.needsUpdate = true;
		}

		state.camera.position.x = Math.sin(elapsed * 0.08) * 0.5;
		state.camera.position.y = Math.cos(elapsed * 0.06) * 0.3;
		state.renderer.render(state.scene, state.camera);
	};

	const handleResize = () => {
		if (state.disposed) return;
		const width = container.clientWidth;
		const height = container.clientHeight;
		if (width <= 0 || height <= 0) return;

		const aspect = width / height;
		state.camera.left = -frustum * aspect;
		state.camera.right = frustum * aspect;
		state.camera.top = frustum;
		state.camera.bottom = -frustum;
		state.camera.updateProjectionMatrix();
		state.renderer.setSize(width, height);
	};

	tick();
	window.addEventListener("resize", handleResize);

	return () => {
		state.disposed = true;
		cancelAnimationFrame(state.rafId);
		window.removeEventListener("resize", handleResize);

		state.scene.remove(state.gridGroup);
		disposeObject3D(state.gridGroup);

		state.scene.remove(state.heatmapMesh);
		state.heatmapMesh.geometry.dispose();
		(state.heatmapMesh.material as THREE.Material).dispose();
		state.heatmapTexture.dispose();

		state.renderer.dispose();
		if (container.contains(state.renderer.domElement)) {
			container.removeChild(state.renderer.domElement);
		}
	};
}
