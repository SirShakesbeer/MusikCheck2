import { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Color, MathUtils, Mesh } from 'three';

import { useThemeStore } from '../../stores/themeStore';

type RgbTuple = [number, number, number];

function readToken(tokenName: string, fallback: RgbTuple): RgbTuple {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  if (!raw) {
    return fallback;
  }

  const parts = raw
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (parts.length < 3) {
    return fallback;
  }

  return [parts[0], parts[1], parts[2]];
}

function toColor(values: RgbTuple): Color {
  return new Color(values[0] / 255, values[1] / 255, values[2] / 255);
}

function RoomScene() {
  const theme = useThemeStore((store) => store.theme);

  const colors = useMemo(() => {
    // Read colors from existing CSS theme tokens so 3D view stays in sync.
    const ink = toColor(readToken('--mc-ink', [13, 16, 37]));
    const night = toColor(readToken('--mc-night', [23, 27, 63]));
    const panel = toColor(readToken('--mc-panel', [43, 50, 117]));
    const cyan = toColor(readToken('--mc-cyan', [62, 246, 255]));
    const lime = toColor(readToken('--mc-lime', [219, 255, 74]));

    return { ink, night, panel, cyan, lime };
  }, [theme]);

  const lightRef = useMemo(() => ({ current: null as Mesh | null }), []);

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    camera.position.x = MathUtils.lerp(camera.position.x, Math.sin(t * 0.18) * 0.35, 0.03);
    camera.position.y = MathUtils.lerp(camera.position.y, 0.15 + Math.sin(t * 0.22) * 0.08, 0.03);
    camera.lookAt(0, -0.2, 0);

    if (lightRef.current) {
      lightRef.current.position.x = Math.sin(t * 0.5) * 2.2;
      lightRef.current.position.z = -2 + Math.cos(t * 0.42) * 1.1;
    }
  });

  return (
    <>
      <color attach="background" args={[colors.ink]} />
      <ambientLight intensity={0.8} color={colors.night} />
      <directionalLight position={[1.4, 2.4, 2]} intensity={1.3} color={colors.cyan} />
      <pointLight position={[-2, 1.4, -1]} intensity={1.15} color={colors.lime} />

      <Float speed={0.65} rotationIntensity={0.02} floatIntensity={0.28}>
        <mesh position={[0, 0.18, -3.6]} rotation={[0.1, 0, 0]}>
          <planeGeometry args={[10, 6]} />
          <meshStandardMaterial color={colors.night} roughness={0.95} metalness={0.05} />
        </mesh>
      </Float>

      <mesh position={[0, -1.4, -2.7]} rotation={[-Math.PI / 2.4, 0, 0]}>
        <planeGeometry args={[11, 8]} />
        <meshStandardMaterial color={colors.panel} roughness={0.9} metalness={0.08} />
      </mesh>

      <mesh position={[0, 0.2, -5.7]}>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial color={colors.night} roughness={0.92} metalness={0.1} />
      </mesh>

      <mesh position={[-4.5, 0, -3]} rotation={[0, Math.PI / 2.2, 0]}>
        <planeGeometry args={[10, 7]} />
        <meshStandardMaterial color={colors.panel} roughness={0.88} metalness={0.06} />
      </mesh>

      <mesh position={[4.5, 0, -3]} rotation={[0, -Math.PI / 2.2, 0]}>
        <planeGeometry args={[10, 7]} />
        <meshStandardMaterial color={colors.panel} roughness={0.88} metalness={0.06} />
      </mesh>

      <mesh ref={(node) => {
        lightRef.current = node;
      }} position={[0, 0.8, -2]}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial color={colors.cyan} emissive={colors.cyan} emissiveIntensity={0.45} roughness={0.25} />
      </mesh>
    </>
  );
}

export function BackgroundScene3D() {
  return (
    <Canvas camera={{ position: [0, 0.2, 2.6], fov: 48 }} dpr={[1, 1.5]}>
      <RoomScene />
    </Canvas>
  );
}
