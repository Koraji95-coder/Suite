import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { GridConductor, GridPlacement, GridRod } from "./types";

const AMBER = 0xf59e0b;
const GREEN = 0x22c55e;
const RED = 0xef4444;
const BLUE = 0x3b82f6;
const CYAN = 0x06b6d4;
const GROUND_COLOR = 0x2a1f0e;

export interface GridPreview3DBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

interface CreateGridPreview3DEngineArgs {
	canvas: HTMLCanvasElement;
	container: HTMLDivElement;
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	bounds: GridPreview3DBounds;
	pausedRef: MutableRefObject<boolean>;
}

export function createGridPreview3DEngine({
	canvas,
	container,
	rods,
	conductors,
	placements,
	bounds,
	pausedRef,
}: CreateGridPreview3DEngineArgs): () => void {
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

	const subGroundGeo = new THREE.PlaneGeometry(2, 2);
	const subGroundMat = new THREE.MeshStandardMaterial({
		color: 0x1a1408,
		transparent: true,
		opacity: 0.4,
		side: THREE.DoubleSide,
	});
	const subGroundMesh = new THREE.Mesh(subGroundGeo, subGroundMat);
	subGroundMesh.rotation.x = -Math.PI / 2;
	subGroundMesh.position.y = -0.15;
	gridGroup.add(subGroundMesh);

	const conductorMat = new THREE.MeshStandardMaterial({
		color: AMBER,
		emissive: new THREE.Color(AMBER).multiplyScalar(0.15),
		metalness: 0.6,
		roughness: 0.3,
	});

	for (const conductor of conductors) {
		const x1 = (conductor.x1 - cx) * scale;
		const z1 = (conductor.y1 - cy) * scale;
		const x2 = (conductor.x2 - cx) * scale;
		const z2 = (conductor.y2 - cy) * scale;
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
			.filter((placement) => placement.type === "GROUND_ROD_TEST_WELL")
			.map((placement) => `${placement.grid_x},${placement.grid_y}`),
	);

	for (const rod of rods) {
		const x = (rod.grid_x - cx) * scale;
		const z = (rod.grid_y - cy) * scale;
		const rodHeight = 0.08;
		const isTestWell = testWellSet.has(`${rod.grid_x},${rod.grid_y}`);

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

	for (const placement of placements) {
		if (placement.type !== "TEE" && placement.type !== "CROSS") continue;
		const x = (placement.grid_x - cx) * scale;
		const z = (placement.grid_y - cy) * scale;
		const mat = placement.type === "TEE" ? teeMat : crossMat;

		const marker = new THREE.Mesh(
			new THREE.BoxGeometry(0.012, 0.004, 0.012),
			mat,
		);
		marker.position.set(x, 0.007, z);
		if (placement.type === "TEE") {
			marker.rotation.y = (placement.rotation_deg * Math.PI) / 180;
		}
		gridGroup.add(marker);
	}

	scene.add(new THREE.AmbientLight(0xffffff, 0.4));

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

	const onMouseDown = (event: MouseEvent) => {
		mouseDown = true;
		lastMouse = { x: event.clientX, y: event.clientY };
	};
	const onMouseMove = (event: MouseEvent) => {
		if (!mouseDown) return;
		const dx = event.clientX - lastMouse.x;
		const dy = event.clientY - lastMouse.y;
		theta -= dx * 0.005;
		phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05, phi + dy * 0.005));
		lastMouse = { x: event.clientX, y: event.clientY };
		updateCamera();
	};
	const onMouseUp = () => {
		mouseDown = false;
	};

	const onWheel = (event: WheelEvent) => {
		event.preventDefault();
		event.stopPropagation();
	};

	canvas.addEventListener("mousedown", onMouseDown);
	canvas.addEventListener("wheel", onWheel, { passive: false });
	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);

	const handleResize = () => {
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
				if (Array.isArray(obj.material)) {
					obj.material.forEach((material) => material.dispose());
				} else {
					obj.material.dispose();
				}
			}
		});
	};
}
