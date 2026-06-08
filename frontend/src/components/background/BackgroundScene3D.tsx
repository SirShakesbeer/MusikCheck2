import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, MathUtils, Mesh, Group } from 'three';

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

function StickFigure({
  color,
  accent,
  position,
  rotationY,
  bubble,
  bubbleOffset,
  bubbleDelay,
}: {
  color: Color;
  accent: Color;
  position: [number, number, number];
  rotationY: number;
  bubble: string;
  bubbleOffset: [number, number, number];
  bubbleDelay: number;
}) {
  const groupRef = useRef<Group | null>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.y = position[1] + Math.sin(t * 1.25 + rotationY) * 0.06;
    groupRef.current.rotation.z = Math.sin(t * 0.9 + rotationY) * 0.03;
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshStandardMaterial color={accent} roughness={0.35} metalness={0.04} />
      </mesh>

      <mesh position={[0, 1.95, -0.06]} rotation={[0, 0, 0.08]}>
        <sphereGeometry args={[0.34, 24, 24]} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.02} transparent opacity={0.95} />
      </mesh>

      <mesh position={[0, 1.18, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 1.05, 12]} />
        <meshStandardMaterial color={color} roughness={0.68} metalness={0.02} />
      </mesh>

      <mesh position={[-0.38, 1.35, 0.02]} rotation={[0, 0, -0.75]}>
        <cylinderGeometry args={[0.045, 0.06, 0.9, 10]} />
        <meshStandardMaterial color={accent} roughness={0.55} metalness={0.02} />
      </mesh>

      <mesh position={[0.38, 1.35, -0.02]} rotation={[0, 0, 0.72]}>
        <cylinderGeometry args={[0.045, 0.06, 0.9, 10]} />
        <meshStandardMaterial color={accent} roughness={0.55} metalness={0.02} />
      </mesh>

      <mesh position={[-0.16, 0.35, 0.02]} rotation={[0, 0, -0.18]}>
        <cylinderGeometry args={[0.05, 0.06, 1.0, 10]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
      </mesh>

      <mesh position={[0.16, 0.35, -0.02]} rotation={[0, 0, 0.16]}>
        <cylinderGeometry args={[0.05, 0.06, 1.0, 10]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
      </mesh>

      <Html position={bubbleOffset} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div
          className="speech-bubble-3d"
          style={{
            animationDelay: `${bubbleDelay}s`,
          }}
        >
          <span>{bubble}</span>
        </div>
      </Html>
    </group>
  );
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
    const rose = toColor(readToken('--mc-rose', [255, 78, 203]));
    const sun = toColor(readToken('--mc-sun', [255, 182, 39]));

    return { ink, night, panel, cyan, lime, rose, sun };
  }, [theme]);

  const lightRef = useMemo(() => ({ current: null as Mesh | null }), []);

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    camera.position.x = MathUtils.lerp(camera.position.x, Math.sin(t * 0.16) * 0.18, 0.03);
    camera.position.y = MathUtils.lerp(camera.position.y, 0.18 + Math.sin(t * 0.2) * 0.05, 0.03);
    camera.lookAt(0, 0.45, -1.8);

    if (lightRef.current) {
      lightRef.current.position.x = Math.sin(t * 0.5) * 2.2;
      lightRef.current.position.z = -2 + Math.cos(t * 0.42) * 1.1;
    }
  });

  return (
    <>
      <color attach="background" args={[colors.ink]} />
      <ambientLight intensity={0.95} color={colors.night} />
      <directionalLight position={[1.4, 3.4, 3.2]} intensity={1.2} color={colors.cyan} />
      <pointLight position={[-2.2, 1.8, -0.6]} intensity={1.2} color={colors.rose} />
      <pointLight position={[2.2, 1.6, -1.2]} intensity={1.1} color={colors.sun} />

      <mesh position={[0, -1.75, -2.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7.2, 48]} />
        <meshStandardMaterial color={colors.panel} roughness={0.92} metalness={0.04} />
      </mesh>

      <mesh position={[0, 0.1, -6]}>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial color={colors.night} roughness={0.96} metalness={0.02} />
      </mesh>

      <mesh position={[0, 3.1, -4]} rotation={[0, 0, 0]}>
        <planeGeometry args={[14, 4.2]} />
        <meshStandardMaterial color={colors.night} roughness={0.98} metalness={0.01} />
      </mesh>

      <mesh position={[-5.1, 0.2, -3.6]} rotation={[0, Math.PI / 2.1, 0.03]}>
        <planeGeometry args={[8.8, 6.2]} />
        <meshStandardMaterial color={colors.panel} roughness={0.9} metalness={0.05} />
      </mesh>

      <mesh position={[5.1, 0.2, -3.6]} rotation={[0, -Math.PI / 2.1, -0.03]}>
        <planeGeometry args={[8.8, 6.2]} />
        <meshStandardMaterial color={colors.panel} roughness={0.9} metalness={0.05} />
      </mesh>

      <mesh position={[0, -0.9, -4.8]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[4.8, 0.18, 0.9]} />
        <meshStandardMaterial color={colors.night} roughness={0.8} metalness={0.08} />
      </mesh>

      <mesh position={[-1.4, -1.28, -4.5]} rotation={[0, 0, 0.02]}>
        <boxGeometry args={[0.18, 0.8, 0.18]} />
        <meshStandardMaterial color={colors.cyan} roughness={0.62} metalness={0.12} />
      </mesh>

      <mesh position={[1.4, -1.28, -4.5]} rotation={[0, 0, -0.02]}>
        <boxGeometry args={[0.18, 0.8, 0.18]} />
        <meshStandardMaterial color={colors.sun} roughness={0.62} metalness={0.12} />
      </mesh>

      <mesh position={[-1.4, -1.78, -4.5]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.7, 0.14, 0.18]} />
        <meshStandardMaterial color={colors.night} roughness={0.75} metalness={0.06} />
      </mesh>

      <mesh position={[1.4, -1.78, -4.5]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.7, 0.14, 0.18]} />
        <meshStandardMaterial color={colors.night} roughness={0.75} metalness={0.06} />
      </mesh>

      <mesh ref={(node) => {
        lightRef.current = node;
      }} position={[0, 1.1, -2]}>
        <icosahedronGeometry args={[0.45, 1]} />
        <meshStandardMaterial color={colors.cyan} emissive={colors.cyan} emissiveIntensity={0.3} roughness={0.22} />
      </mesh>

      <StickFigure
        color={colors.cyan}
        accent={colors.lime}
        position={[-1.35, -1.28, -3.85]}
        rotationY={0.12}
        bubble="Did you hear the beat?"
        bubbleOffset={[0.12, 2.65, 0]}
        bubbleDelay={-0.6}
      />

      <StickFigure
        color={colors.sun}
        accent={colors.rose}
        position={[1.35, -1.3, -3.8]}
        rotationY={-0.14}
        bubble="I think I know this song."
        bubbleOffset={[-0.1, 2.68, 0]}
        bubbleDelay={-2.1}
      />
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
