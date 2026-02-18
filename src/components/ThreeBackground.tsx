import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { EMBER_PALETTE } from '../lib/three/emberPalette';

function WavePlane() {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.PlaneGeometry>(null);

  useFrame(({ clock }) => {
    if (!geometryRef.current) return;
    const positions = geometryRef.current.attributes.position.array as Float32Array;
    const time = clock.elapsedTime;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const w1 = Math.sin(x * 1.0 + time * 0.2) * 0.1;
      const w2 = Math.cos(y * 1.0 + time * 0.15) * 0.1;
      const w3 = Math.sin((x + y) * 0.5 + time * 0.1) * 0.05;
      positions[i + 2] = w1 + w2 + w3;
    }
    geometryRef.current.attributes.position.needsUpdate = true;
    geometryRef.current.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 4, 0, 0.2]}>
      <planeGeometry ref={geometryRef} args={[20, 20, 64, 64]} />
      <meshStandardMaterial
        color={EMBER_PALETTE.primary}
        emissive={EMBER_PALETTE.primary}
        emissiveIntensity={0.2}
        wireframe
        transparent
        opacity={0.25}
      />
    </mesh>
  );
}

export function ThreeBackground() {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 5] }}
        gl={{ preserveDrawingBuffer: true, alpha: true }}
      >
        <ambientLight intensity={0.3} color={EMBER_PALETTE.primary} />
        <pointLight position={[2, 3, 4]} intensity={0.8} color={EMBER_PALETTE.secondary} />
        <WavePlane />
      </Canvas>
    </div>
  );
}

