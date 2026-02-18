import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EMBER_PALETTE } from '../../lib/three/emberPalette';

interface EmberBackgroundProps {
  opacity?: number;
  reducedMotion?: boolean;
  className?: string;
}

export function EmberBackground({ opacity = 0.2, reducedMotion = false, className }: EmberBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true, preserveDrawingBuffer: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.position.z = 5;

    const geometry = new THREE.PlaneGeometry(20, 20, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: EMBER_PALETTE.primary,
      wireframe: true,
      transparent: true,
      opacity: opacity,
      emissive: new THREE.Color(EMBER_PALETTE.primary).multiplyScalar(0.1),
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 4;
    plane.rotation.z = 0.2;
    scene.add(plane);

    const ambientLight = new THREE.AmbientLight(EMBER_PALETTE.primary, 0.1);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(EMBER_PALETTE.secondary, 0.5);
    pointLight.position.set(2, 3, 4);
    scene.add(pointLight);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let rafId: number;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      const positions = geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const w1 = Math.sin(x * 1.0 + elapsed * 0.2) * 0.1;
        const w2 = Math.cos(y * 1.0 + elapsed * 0.15) * 0.1;
        const w3 = Math.sin((x + y) * 0.5 + elapsed * 0.1) * 0.05;
        positions[i + 2] = w1 + w2 + w3;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [opacity]);

  return <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className={className ?? "absolute inset-0 -z-10 pointer-events-none"} />;
}