import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Html, Line } from '@react-three/drei';
import * as THREE from 'three';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const degToRad = (d) => (d * Math.PI) / 180;
const radToDeg = (r) => (r * 180) / Math.PI;
const STEERING_MODE_ACKERMANN = 'ackermann';
const STEERING_MODE_SAME_DIRECTION = 'same-direction';
const CAMERA_MODE_OVERVIEW = 'overview';
const CAMERA_MODE_FOLLOW = 'follow';
const CAMERA_MODE_DRIVER = 'driver';
const PARKING_LAYOUT = {
  bayCount: 6,
  bayWidth: 2.8,
  bayDepth: 5.6,
  laneWidth: 8.2,
  apronDepth: 1.35,
  floorWidth: 44,
  floorDepth: 34,
};
const getBayCenterX = (bayIndex) =>
  -((PARKING_LAYOUT.bayCount * PARKING_LAYOUT.bayWidth) / 2) +
  PARKING_LAYOUT.bayWidth * bayIndex +
  PARKING_LAYOUT.bayWidth / 2;
const PARKED_CARS = [
  { x: getBayCenterX(1), z: -(PARKING_LAYOUT.laneWidth / 2 + PARKING_LAYOUT.bayDepth / 2), heading: Math.PI, color: '#2563eb', name: '왼쪽 위 파란 차' },
  { x: getBayCenterX(3), z: -(PARKING_LAYOUT.laneWidth / 2 + PARKING_LAYOUT.bayDepth / 2), heading: Math.PI, color: '#64748b', name: '가운데 위 회색 차' },
  { x: getBayCenterX(5), z: PARKING_LAYOUT.laneWidth / 2 + PARKING_LAYOUT.bayDepth / 2, heading: 0, color: '#16a34a', name: '오른쪽 아래 초록 차' },
];
const FEED_CAMERA_CONFIG = {
  rear: {
    localX: 0,
    localY: 0.72,
    localZ: -2.02,
    targetLocalX: 0,
    targetLocalY: 0.18,
    targetLocalZ: -9.4,
    fov: 122,
    mirrored: true,
  },
  left: {
    localX: -1.38,
    localY: 0.98,
    localZ: 0.08,
    targetLocalX: -8.2,
    targetLocalY: 0.34,
    targetLocalZ: -6.4,
    fov: 82,
    mirrored: false,
  },
  right: {
    localX: 1.38,
    localY: 0.98,
    localZ: 0.08,
    targetLocalX: 8.2,
    targetLocalY: 0.34,
    targetLocalZ: -6.4,
    fov: 82,
    mirrored: false,
  },
};

function Card({ className = '', children }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function CardHeader({ className = '', children }) {
  return <header className={`card-header ${className}`}>{children}</header>;
}

function CardTitle({ className = '', children }) {
  return <h1 className={`card-title ${className}`}>{children}</h1>;
}

function CardContent({ className = '', children }) {
  return <div className={`card-content ${className}`}>{children}</div>;
}

function Button({ className = '', variant = 'primary', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

function Switch({ checked, onCheckedChange }) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </label>
  );
}

function Slider({ value, min, max, step, onValueChange }) {
  return (
    <input
      className="slider"
      type="range"
      value={value[0]}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
    />
  );
}

function Label({ className = '', children }) {
  return <label className={`label ${className}`}>{children}</label>;
}

function Badge({ className = '', children }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

function getWheelSteering(wheelbase, track, steerAngleRad, steeringMode) {
  if (steeringMode === STEERING_MODE_SAME_DIRECTION) {
    const isStraight = Math.abs(steerAngleRad) < 1e-4;
    return {
      frontLeft: steerAngleRad,
      frontRight: steerAngleRad,
      rearLeft: steerAngleRad,
      rearRight: steerAngleRad,
      radiusRearAxle: isStraight ? Infinity : Infinity,
      explanation: '네 바퀴가 같은 방향으로 꺾이면 차체는 회전보다 대각선 이동에 가까워집니다.',
    };
  }

  const ack = ackermannAngles(wheelbase, track, steerAngleRad);
  return {
    frontLeft: ack.left,
    frontRight: ack.right,
    rearLeft: 0,
    rearRight: 0,
    radiusRearAxle: ack.radiusRearAxle,
    explanation: '실제 자동차는 앞바퀴가 방향을 만들고 뒷바퀴는 그 궤적을 따라옵니다.',
  };
}

function createCarDimensions(wheelbase, track, overhangFront, overhangRear) {
  return {
    wheelbase,
    track,
    bodyLength: wheelbase + overhangFront + overhangRear,
    bodyWidth: track + 0.42,
    overhangFront,
    overhangRear,
  };
}

function worldFromLocal(baseX, baseZ, heading, localX, localZ) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return {
    x: baseX + localX * c + localZ * s,
    z: baseZ - localX * s + localZ * c,
  };
}

function localFromWorld(baseX, baseZ, heading, worldX, worldZ) {
  const dx = worldX - baseX;
  const dz = worldZ - baseZ;
  return {
    x: dx * Math.cos(heading) - dz * Math.sin(heading),
    z: dx * Math.sin(heading) + dz * Math.cos(heading),
  };
}

function createFootprint(x, z, heading, dimensions) {
  const halfRight = (dimensions.bodyWidth * 0.88) / 2;
  const halfForward = dimensions.bodyLength / 2;
  const centerOffset = (dimensions.overhangFront - dimensions.overhangRear) / 2;
  const center = worldFromLocal(x, z, heading, 0, centerOffset);
  return {
    center,
    rightAxis: { x: Math.cos(heading), z: -Math.sin(heading) },
    forwardAxis: { x: Math.sin(heading), z: Math.cos(heading) },
    halfRight,
    halfForward,
  };
}

function dot2(a, b) {
  return a.x * b.x + a.z * b.z;
}

function footprintProjectionRadius(footprint, axis) {
  return (
    Math.abs(dot2(footprint.rightAxis, axis)) * footprint.halfRight +
    Math.abs(dot2(footprint.forwardAxis, axis)) * footprint.halfForward
  );
}

function footprintsOverlap(a, b) {
  const diff = {
    x: b.center.x - a.center.x,
    z: b.center.z - a.center.z,
  };
  const axes = [a.rightAxis, a.forwardAxis, b.rightAxis, b.forwardAxis];
  return axes.every((axis) => {
    const distance = Math.abs(dot2(diff, axis));
    const limit = footprintProjectionRadius(a, axis) + footprintProjectionRadius(b, axis);
    return distance <= limit;
  });
}

function ackermannAngles(wheelbase, track, steerAngleRad) {
  if (Math.abs(steerAngleRad) < 1e-4) {
    return { left: 0, right: 0, radiusRearAxle: Infinity };
  }

  const sign = Math.sign(steerAngleRad);
  const abs = Math.abs(steerAngleRad);
  const R = wheelbase / Math.tan(abs);
  const inner = Math.atan(wheelbase / Math.max(0.001, R - track / 2));
  const outer = Math.atan(wheelbase / (R + track / 2));

  if (sign > 0) {
    return { left: inner, right: outer, radiusRearAxle: R };
  }
  return { left: -outer, right: -inner, radiusRearAxle: -R };
}

function useKeyboard() {
  const keys = useRef({});
  useEffect(() => {
    const controlKeys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    const isInteractiveTarget = (target) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const down = (e) => {
      const key = e.key.toLowerCase();
      if (isInteractiveTarget(e.target)) return;
      if (controlKeys.has(key)) e.preventDefault();
      keys.current[key] = true;
    };
    const up = (e) => {
      const key = e.key.toLowerCase();
      if (isInteractiveTarget(e.target)) return;
      keys.current[key] = false;
    };
    const blur = () => {
      keys.current = {};
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return keys;
}

function Wheel({ position, steer = 0, color = '#1f2937' }) {
  const tireRadius = 0.36;
  const tireWidth = 0.24;
  return (
    <group position={position} rotation={[0, steer, 0]}>
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[tireRadius, tireRadius, tireWidth, 20]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.16, 0.16, tireWidth + 0.02, 16]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

function SteeringGuide({ position, steer, color }) {
  return (
    <group position={position} rotation={[0, steer, 0]}>
      <Line
        points={[
          [0, 0, -0.18],
          [0, 0, 0.68],
        ]}
        color={color}
        lineWidth={2}
      />
      <mesh position={[0, 0, 0.68]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.045, 0.14, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function StaticParkedCar({ car, dimensions }) {
  const renderedTrack = dimensions.track + 0.18;
  const wheelY = 0.36;
  const bodyCenterOffset = (dimensions.overhangFront - dimensions.overhangRear) / 2;

  return (
    <group position={[car.x, 0, car.z]} rotation={[0, car.heading, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.6, bodyCenterOffset]}>
        <boxGeometry args={[dimensions.bodyWidth * 0.88, 0.8, dimensions.bodyLength]} />
        <meshStandardMaterial color={car.color} metalness={0.18} roughness={0.52} />
      </mesh>
      <mesh castShadow position={[0, 1.02, bodyCenterOffset - 0.12]}>
        <boxGeometry args={[dimensions.bodyWidth * 0.68, 0.5, dimensions.bodyLength * 0.42]} />
        <meshStandardMaterial color="#bfdbfe" metalness={0.25} roughness={0.18} transparent opacity={0.86} />
      </mesh>
      <Wheel position={[-renderedTrack / 2, wheelY, dimensions.wheelbase / 2]} />
      <Wheel position={[renderedTrack / 2, wheelY, dimensions.wheelbase / 2]} />
      <Wheel position={[-renderedTrack / 2, wheelY, -dimensions.wheelbase / 2]} />
      <Wheel position={[renderedTrack / 2, wheelY, -dimensions.wheelbase / 2]} />
    </group>
  );
}

function ParkingLot({ parkedCars, parkedCarDimensions }) {
  const { bayCount, bayWidth, bayDepth, laneWidth, apronDepth, floorWidth, floorDepth } = PARKING_LAYOUT;
  const startX = -((bayCount * bayWidth) / 2);

  const stripes = [];
  for (let i = 0; i <= bayCount; i += 1) {
    const x = startX + i * bayWidth;
    stripes.push(
      <mesh key={`top-${i}`} position={[x, 0.01, -laneWidth / 2 - bayDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, bayDepth]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
    );
    stripes.push(
      <mesh key={`bot-${i}`} position={[x, 0.01, laneWidth / 2 + bayDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, bayDepth]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
    );
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorWidth, floorDepth]} />
        <meshStandardMaterial color="#374151" />
      </mesh>

      {stripes}

      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bayCount * bayWidth, 0.12]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>

      <mesh position={[0, 0.02, -laneWidth / 2 - bayDepth - apronDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bayCount * bayWidth, apronDepth]} />
        <meshBasicMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 0.02, laneWidth / 2 + bayDepth + apronDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bayCount * bayWidth, apronDepth]} />
        <meshBasicMaterial color="#e5e7eb" />
      </mesh>

      {parkedCars.map((car) => (
        <StaticParkedCar key={car.name} car={car} dimensions={parkedCarDimensions} />
      ))}

      <mesh position={[0, 0.015, -laneWidth / 2 - bayDepth]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bayCount * bayWidth, 0.15]} />
        <meshBasicMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0, 0.015, laneWidth / 2 + bayDepth]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bayCount * bayWidth, 0.15]} />
        <meshBasicMaterial color="#cbd5e1" />
      </mesh>
    </group>
  );
}

function Trajectory({ points, color = '#22c55e' }) {
  const linePoints = useMemo(() => points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), [points]);
  if (linePoints.length < 2) return null;
  return <Line points={linePoints} color={color} lineWidth={2} />;
}

function FollowCameraController({ enabled, state, distance, setDistance }) {
  const cameraAnchor = useRef(new THREE.Vector3());
  const cameraLookAt = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!enabled) return undefined;

    const isInteractiveTarget = (target) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const onWheel = (e) => {
      if (isInteractiveTarget(e.target)) return;
      e.preventDefault();
      setDistance((prev) => clamp(prev + e.deltaY * 0.01, 5.8, 14));
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [enabled, setDistance]);

  useFrame(({ camera }) => {
    if (!enabled) return;

    const forward = new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading));
    const desiredPosition = new THREE.Vector3(
      state.x - forward.x * distance,
      Math.max(3.8, distance * 0.58),
      state.z - forward.z * distance
    );
    const desiredLookAt = new THREE.Vector3(
      state.x + forward.x * 2.2,
      0.95,
      state.z + forward.z * 2.2
    );

    cameraAnchor.current.lerp(desiredPosition, 0.12);
    cameraLookAt.current.lerp(desiredLookAt, 0.16);
    camera.position.copy(cameraAnchor.current);
    camera.lookAt(cameraLookAt.current);
  });

  return null;
}

function DriverCameraController({ enabled, state }) {
  const cameraAnchor = useRef(new THREE.Vector3());
  const cameraLookAt = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    if (!enabled) return;

    const eye = worldFromLocal(state.x, state.z, state.heading, -0.16, -0.28);
    const focus = worldFromLocal(state.x, state.z, state.heading, 0.05, 8.8);
    const desiredPosition = new THREE.Vector3(eye.x, 1.44, eye.z);
    const desiredLookAt = new THREE.Vector3(focus.x, 1.18, focus.z);

    cameraAnchor.current.lerp(desiredPosition, 0.18);
    cameraLookAt.current.lerp(desiredLookAt, 0.2);
    camera.position.copy(cameraAnchor.current);
    camera.lookAt(cameraLookAt.current);
  });

  return null;
}

function FeedCameraRig({ sim, config }) {
  useFrame(({ camera }) => {
    const position = worldFromLocal(sim.x, sim.z, sim.heading, config.localX, config.localZ);
    const target = worldFromLocal(
      sim.x,
      sim.z,
      sim.heading,
      config.targetLocalX,
      config.targetLocalZ
    );

    camera.position.set(position.x, config.localY, position.z);
    if (camera.fov !== config.fov) {
      camera.fov = config.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(target.x, config.targetLocalY, target.z);
  });

  return null;
}

function FeedScene({ sim, type }) {
  const parkedCarDimensions = useMemo(() => createCarDimensions(2.7, 1.55, 0.95, 0.9), []);
  const cameraConfig = FEED_CAMERA_CONFIG[type];

  return (
    <Canvas
      className={`feed-canvas ${cameraConfig.mirrored ? 'feed-canvas-mirrored' : ''}`}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      camera={{ position: [0, cameraConfig.localY, 0], fov: cameraConfig.fov }}
    >
      <color attach="background" args={['#0f172a']} />
      <ambientLight intensity={0.92} />
      <directionalLight position={[8, 12, 5]} intensity={1.25} />
      <PerspectiveCamera makeDefault position={[0, cameraConfig.localY, 0]} fov={cameraConfig.fov} />
      <FeedCameraRig sim={sim} config={cameraConfig} />
      <ParkingLot parkedCars={PARKED_CARS} parkedCarDimensions={parkedCarDimensions} />
    </Canvas>
  );
}

function RearGuideOverlay({ steer }) {
  const width = 310;
  const height = 184;
  const bend = clamp(radToDeg(steer) * 1.05, -38, 38);
  const guideHalfWidthBottom = 60;
  const guideTopPerspectiveScale = 0.42;
  const guideTopBendFactor = 1.0;
  const guideMidBendFactor = -0.78;
  const curve = (offset) => {
    const bottomX = width / 2 + offset;
    const bottomY = height - 16;
    const topY = 88;
    const topBaseX = width / 2 + offset * guideTopPerspectiveScale;
    const topX = topBaseX + bend * guideTopBendFactor;
    const midY = height - 68;
    const midBaseX = bottomX + (topBaseX - bottomX) * 0.56;
    const midX = midBaseX + bend * guideMidBendFactor;
    return `M ${bottomX} ${bottomY} Q ${midX} ${midY} ${topX} ${topY}`;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="camera-guides" aria-hidden="true">
      <path d={curve(-guideHalfWidthBottom)} fill="none" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
      <path d={curve(guideHalfWidthBottom)} fill="none" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
      <path d={curve(0)} fill="none" stroke="#facc15" strokeWidth="3" strokeDasharray="8 8" />
    </svg>
  );
}

function CockpitOverlay({ sim, settings }) {
  if (settings.cameraMode !== CAMERA_MODE_DRIVER) return null;

  const steeringWheelRotation = -clamp((sim.steer / settings.maxSteer) * 450, -450, 450);
  const reverseActive = sim.speed < -0.05;

  return (
    <div className="cockpit-overlay">
      <div className="cockpit-top-row">
        <div className="mirror-screen">
          <div className="mirror-label">좌측 미러</div>
          <div className="mirror-feed-frame">
            <FeedScene sim={sim} type="right" />
            <div className="mirror-housing-overlay mirror-housing-left" />
            <div className="mirror-body-mask mirror-body-mask-left" />
          </div>
        </div>

        <div className={`camera-screen ${reverseActive ? 'camera-screen-active' : ''}`}>
          <div className="camera-screen-header">
            <span>후방 카메라</span>
            <span>{reverseActive ? 'R 활성' : '주행 중 미리보기'}</span>
          </div>
          <div className="feed-frame">
            <FeedScene sim={sim} type="rear" />
            <RearGuideOverlay steer={sim.steer} />
            <div className="rear-bumper-overlay" />
          </div>
        </div>

        <div className="mirror-screen">
          <div className="mirror-label">우측 미러</div>
          <div className="mirror-feed-frame">
            <FeedScene sim={sim} type="left" />
            <div className="mirror-housing-overlay mirror-housing-right" />
            <div className="mirror-body-mask mirror-body-mask-right" />
          </div>
        </div>
      </div>

      <div className="dashboard-shell">
        <div className="dashboard-info">
          <div className="dashboard-chip">{reverseActive ? '후진' : sim.speed > 0.05 ? '전진' : '정지'}</div>
          <div className="dashboard-chip">{`${Math.abs(sim.speed).toFixed(1)} m/s`}</div>
          <div className="dashboard-chip">{`핸들 ${radToDeg(sim.steer).toFixed(0)}°`}</div>
        </div>

        <div className="wheel-column">
          <div className="steering-wheel" style={{ transform: `rotate(${steeringWheelRotation}deg)` }}>
            <div className="steering-wheel-center" />
            <div className="steering-wheel-spoke steering-wheel-spoke-top" />
            <div className="steering-wheel-spoke steering-wheel-spoke-left" />
            <div className="steering-wheel-spoke steering-wheel-spoke-right" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CarModel({ state, dimensions, showLabels, showWheelPaths, steeringMode, cameraMode }) {
  const { wheelbase, track, bodyLength, bodyWidth, overhangFront, overhangRear } = dimensions;
  const {
    x,
    z,
    heading,
    steer,
    trailFrontLeft,
    trailFrontRight,
    trailRearLeft,
    trailRearRight,
    centerTrail,
  } = state;
  const wheelSteering = getWheelSteering(wheelbase, track, steer, steeringMode);

  const bodyCenterOffset = (overhangFront - overhangRear) / 2;
  const wheelY = 0.36;
  const renderedTrack = track + 0.18;
  const guideY = wheelY + 0.52;
  const carGroup = useRef();

  useFrame(() => {
    if (carGroup.current) {
      carGroup.current.position.set(x, 0, z);
      carGroup.current.rotation.set(0, heading, 0);
    }
  });

  return (
    <>
      {showWheelPaths && <Trajectory points={trailFrontLeft} color="#38bdf8" />}
      {showWheelPaths && <Trajectory points={trailFrontRight} color="#0ea5e9" />}
      {showWheelPaths && <Trajectory points={trailRearLeft} color="#22c55e" />}
      {showWheelPaths && <Trajectory points={trailRearRight} color="#16a34a" />}
      <Trajectory points={centerTrail} color="#f59e0b" />

      <group ref={carGroup}>
        <mesh castShadow receiveShadow position={[0, 0.6, bodyCenterOffset]}>
          <boxGeometry args={[bodyWidth * 0.88, 0.8, bodyLength]} />
          <meshStandardMaterial color="#dc2626" metalness={0.2} roughness={0.45} />
        </mesh>

        {cameraMode !== CAMERA_MODE_DRIVER && (
          <mesh castShadow position={[0, 1.05, bodyCenterOffset - 0.15]}>
            <boxGeometry args={[bodyWidth * 0.72, 0.55, bodyLength * 0.46]} />
            <meshStandardMaterial color="#93c5fd" metalness={0.35} roughness={0.15} transparent opacity={0.9} />
          </mesh>
        )}

        <mesh position={[0, 0.12, 0]} receiveShadow>
          <boxGeometry args={[bodyWidth * 0.78, 0.1, wheelbase + 0.72]} />
          <meshStandardMaterial color="#6b7280" />
        </mesh>

        <Wheel position={[-renderedTrack / 2, wheelY, wheelbase / 2]} steer={wheelSteering.frontLeft} />
        <Wheel position={[renderedTrack / 2, wheelY, wheelbase / 2]} steer={wheelSteering.frontRight} />
        <Wheel position={[-renderedTrack / 2, wheelY, -wheelbase / 2]} steer={wheelSteering.rearLeft} />
        <Wheel position={[renderedTrack / 2, wheelY, -wheelbase / 2]} steer={wheelSteering.rearRight} />

        <SteeringGuide position={[-renderedTrack / 2, guideY, wheelbase / 2]} steer={wheelSteering.frontLeft} color="#67e8f9" />
        <SteeringGuide position={[renderedTrack / 2, guideY, wheelbase / 2]} steer={wheelSteering.frontRight} color="#93c5fd" />
        {steeringMode === STEERING_MODE_SAME_DIRECTION && (
          <>
            <SteeringGuide position={[-renderedTrack / 2, guideY, -wheelbase / 2]} steer={wheelSteering.rearLeft} color="#f9a8d4" />
            <SteeringGuide position={[renderedTrack / 2, guideY, -wheelbase / 2]} steer={wheelSteering.rearRight} color="#fda4af" />
          </>
        )}

        <mesh position={[0, 0.62, bodyLength / 2 - 0.3]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={0.6} />
        </mesh>

        <Line
          points={[
            [0, 0.45, -wheelbase / 2],
            [0, 0.45, wheelbase / 2],
          ]}
          color="#ffffff"
          lineWidth={1.5}
        />

        {showLabels && (
          <Html position={[0, 2.1, 0]} center>
            <div className="label-bubble">
              {steeringMode === STEERING_MODE_SAME_DIRECTION ? (
                <>
                  <div>오해 모드: 네 바퀴가 같은 방향으로 꺾입니다</div>
                  <div>차가 회전하기보다 비스듬히 미끄러지듯 이동합니다</div>
                </>
              ) : (
                <>
                  <div>앞바퀴가 방향을 정하고</div>
                  <div>뒷바퀴는 안쪽 궤적으로 따라옵니다</div>
                </>
              )}
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

function Scene({ sim, setSim, settings, setSettings }) {
  const keys = useKeyboard();
  const trailLimit = 500;
  const parkedCarDimensions = useMemo(() => createCarDimensions(2.7, 1.55, 0.95, 0.9), []);
  const collisionTargets = useMemo(
    () =>
      PARKED_CARS.map((car) => ({
        ...car,
        footprint: createFootprint(car.x, car.z, car.heading, parkedCarDimensions),
      })),
    [parkedCarDimensions]
  );

  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    setSim((prev) => {
      let speed = prev.speed;
      let targetSteer = prev.targetSteer;

      if (settings.keyboardMode) {
        if (keys.current.arrowup || keys.current.w) speed += settings.accel * step;
        if (keys.current.arrowdown || keys.current.s) speed -= settings.accel * step;
        if (!(keys.current.arrowup || keys.current.w || keys.current.arrowdown || keys.current.s)) {
          const drag = settings.drag * step;
          if (Math.abs(speed) < drag) speed = 0;
          else speed -= Math.sign(speed) * drag;
        }
        if (keys.current.arrowleft || keys.current.a) targetSteer += settings.steerSpeed * step;
        if (keys.current.arrowright || keys.current.d) targetSteer -= settings.steerSpeed * step;
        if (!(keys.current.arrowleft || keys.current.a || keys.current.arrowright || keys.current.d)) {
          const straighten = settings.returnSteer * step;
          if (Math.abs(targetSteer) < straighten) targetSteer = 0;
          else targetSteer -= Math.sign(targetSteer) * straighten;
        }
      } else {
        speed = settings.manualSpeed;
        targetSteer = settings.manualSteer;
      }

      speed = clamp(speed, -settings.maxReverseSpeed, settings.maxForwardSpeed);
      targetSteer = clamp(targetSteer, -settings.maxSteer, settings.maxSteer);

      let steer = prev.steer;
      const steerDelta = targetSteer - steer;
      const maxChange = settings.steerResponse * step;
      steer += clamp(steerDelta, -maxChange, maxChange);

      const isSameDirectionMode = settings.steeringMode === STEERING_MODE_SAME_DIRECTION;
      const heading = isSameDirectionMode
        ? prev.heading
        : prev.heading + (speed / settings.wheelbase) * Math.tan(steer) * step;
      const movementHeading = isSameDirectionMode ? prev.heading + steer : prev.heading;
      const x = prev.x + speed * Math.sin(movementHeading) * step;
      const z = prev.z + speed * Math.cos(movementHeading) * step;

      const localToWorld = (lx, lz) => {
        const c = Math.cos(heading);
        const s = Math.sin(heading);
        return [x + lx * c + lz * s, 0.05, z - lx * s + lz * c];
      };

      const track = settings.track;
      const wb = settings.wheelbase;
      const frontLeft = localToWorld(-track / 2, wb / 2);
      const frontRight = localToWorld(track / 2, wb / 2);
      const rearLeft = localToWorld(-track / 2, -wb / 2);
      const rearRight = localToWorld(track / 2, -wb / 2);
      const center = localToWorld(0, 0);
      const candidateFootprint = createFootprint(x, z, heading, createCarDimensions(settings.wheelbase, settings.track, settings.overhangFront, settings.overhangRear));
      const collisionHit = collisionTargets.find((target) => footprintsOverlap(candidateFootprint, target.footprint));

      const append = (arr, p) => {
        const next = [...arr, p];
        if (next.length > trailLimit) next.shift();
        return next;
      };

      if (collisionHit) {
        return {
          ...prev,
          speed: 0,
          targetSteer: 0,
          crashed: true,
          crashLabel: collisionHit.name,
        };
      }

      return {
        ...prev,
        x,
        z,
        heading,
        speed,
        steer,
        targetSteer,
        trailFrontLeft: append(prev.trailFrontLeft, frontLeft),
        trailFrontRight: append(prev.trailFrontRight, frontRight),
        trailRearLeft: append(prev.trailRearLeft, rearLeft),
        trailRearRight: append(prev.trailRearRight, rearRight),
        centerTrail: append(prev.centerTrail, center),
        crashed: false,
        crashLabel: '',
      };
    });
  });

  const dimensions = useMemo(
    () => createCarDimensions(settings.wheelbase, settings.track, settings.overhangFront, settings.overhangRear),
    [settings.wheelbase, settings.track, settings.overhangFront, settings.overhangRear]
  );

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={settings.cameraMode === CAMERA_MODE_DRIVER ? 62 : 45} />
      <FollowCameraController
        enabled={settings.cameraMode === CAMERA_MODE_FOLLOW}
        state={sim}
        distance={settings.followCameraDistance}
        setDistance={(updater) =>
          setSettings((s) => ({
            ...s,
            followCameraDistance:
              typeof updater === 'function' ? updater(s.followCameraDistance) : updater,
          }))
        }
      />
      <DriverCameraController enabled={settings.cameraMode === CAMERA_MODE_DRIVER} state={sim} />
      <OrbitControls
        enabled={settings.cameraMode === CAMERA_MODE_OVERVIEW}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={5}
        maxDistance={30}
        target={[0, 0.8, 0]}
      />
      <Grid args={[40, 40]} cellSize={1} cellThickness={0.6} sectionSize={5} sectionThickness={1.2} fadeDistance={40} />
      <ParkingLot parkedCars={PARKED_CARS} parkedCarDimensions={parkedCarDimensions} />
      <CarModel
        state={sim}
        dimensions={dimensions}
        showLabels={settings.showLabels}
        showWheelPaths={settings.showWheelPaths}
        steeringMode={settings.steeringMode}
        cameraMode={settings.cameraMode}
      />
    </>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${accent}`}>{value}</div>
    </div>
  );
}

export default function App() {
  const defaultSettings = {
    wheelbase: 2.7,
    track: 1.55,
    overhangFront: 0.95,
    overhangRear: 0.9,
    maxSteer: degToRad(34),
    maxForwardSpeed: 4.5,
    maxReverseSpeed: 2.8,
    accel: 3.6,
    drag: 1.9,
    steerSpeed: degToRad(90),
    returnSteer: degToRad(70),
    steerResponse: degToRad(160),
    showWheelPaths: true,
    showLabels: true,
    steeringMode: STEERING_MODE_ACKERMANN,
    cameraMode: CAMERA_MODE_OVERVIEW,
    followCameraDistance: 8.4,
    keyboardMode: true,
    manualSpeed: -1.2,
    manualSteer: degToRad(24),
  };

  const createInitialSim = () => ({
    x: 0,
    z: 2.2,
    heading: Math.PI,
    speed: 0,
    steer: 0,
    targetSteer: 0,
    trailFrontLeft: [],
    trailFrontRight: [],
    trailRearLeft: [],
    trailRearRight: [],
    centerTrail: [],
    crashed: false,
    crashLabel: '',
  });

  const [settings, setSettings] = useState(defaultSettings);
  const [sim, setSim] = useState(createInitialSim);

  const wheelSteering = getWheelSteering(settings.wheelbase, settings.track, sim.steer, settings.steeringMode);
  const turningRadius = Number.isFinite(wheelSteering.radiusRearAxle) ? Math.abs(wheelSteering.radiusRearAxle).toFixed(2) : '∞';
  const modeText = settings.keyboardMode ? '키보드 조작' : '슬라이더 재생';
  const steeringModeText =
    settings.steeringMode === STEERING_MODE_SAME_DIRECTION ? '오해 모드: 네 바퀴 같은 방향' : '실제 모드: 앞바퀴 Ackermann';
  const cameraModeText =
    settings.cameraMode === CAMERA_MODE_DRIVER
      ? '운전석 뷰'
      : settings.cameraMode === CAMERA_MODE_FOLLOW
        ? '차 중심 고정 카메라'
        : '자유 카메라';

  const resetSim = () => setSim(createInitialSim());
  const clearTrails = () => setSim((p) => ({ ...p, trailFrontLeft: [], trailFrontRight: [], trailRearLeft: [], trailRearRight: [], centerTrail: [] }));

  const setPresetStraight = () => {
    setSettings((s) => ({ ...s, keyboardMode: false, manualSpeed: -1.4, manualSteer: 0 }));
    resetSim();
  };

  const setPresetReverseParking = () => {
    setSettings((s) => ({ ...s, keyboardMode: false, manualSpeed: -1.35, manualSteer: degToRad(28) }));
    resetSim();
  };

  const setPresetTightTurn = () => {
    setSettings((s) => ({ ...s, keyboardMode: false, manualSpeed: 2.0, manualSteer: degToRad(-30) }));
    resetSim();
  };

  return (
    <div className="app-shell">
      <div className="layout">
        <Card>
          <CardHeader>
            <div className="header-row">
              <div>
                <CardTitle>자동차 조향·주차 3D 시뮬레이터</CardTitle>
                <p className="intro-text">
                  앞바퀴 조향, 뒷바퀴 추종 궤적, 후진 주차에서의 회전 중심을 시각적으로 보여줍니다.
                </p>
              </div>
              <Badge>{modeText}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="stat-grid">
              <Stat label="현재 속도" value={`${sim.speed.toFixed(2)} m/s`} accent="accent-dark" />
              <Stat label="핸들각(가상)" value={`${radToDeg(sim.steer).toFixed(1)}°`} accent="accent-sky" />
              <Stat label="앞왼쪽 바퀴" value={`${radToDeg(wheelSteering.frontLeft).toFixed(1)}°`} accent="accent-cyan" />
              <Stat label="앞오른쪽 바퀴" value={`${radToDeg(wheelSteering.frontRight).toFixed(1)}°`} accent="accent-blue" />
              <Stat label={settings.steeringMode === STEERING_MODE_SAME_DIRECTION ? '차체 회전 반경' : '회전 반경'} value={`${turningRadius} m`} accent="accent-amber" />
              <Stat label="주행 방향" value={sim.speed < 0 ? '후진' : sim.speed > 0 ? '전진' : '정지'} accent="accent-green" />
            </div>

            {sim.crashed && (
              <div className="crash-banner">
                <strong>충돌 감지:</strong> {sim.crashLabel} 와 부딪혀서 차량을 정지시켰습니다. 다시 움직이려면 초기화를 눌러주세요.
              </div>
            )}

            <div className="panel">
              <div className="panel-header">
                <Label>조향 개념 비교</Label>
                <Badge className="badge-secondary">{steeringModeText}</Badge>
              </div>
              <div className="segmented-control">
                <Button
                  variant={settings.steeringMode === STEERING_MODE_ACKERMANN ? 'primary' : 'outline'}
                  className="segment-button"
                  onClick={() => {
                    setSettings((s) => ({ ...s, steeringMode: STEERING_MODE_ACKERMANN }));
                    resetSim();
                  }}
                >
                  실제 자동차
                </Button>
                <Button
                  variant={settings.steeringMode === STEERING_MODE_SAME_DIRECTION ? 'primary' : 'outline'}
                  className="segment-button"
                  onClick={() => {
                    setSettings((s) => ({ ...s, steeringMode: STEERING_MODE_SAME_DIRECTION }));
                    resetSim();
                  }}
                >
                  네 바퀴 같은 방향
                </Button>
              </div>
              <p className="help-text">
                {settings.steeringMode === STEERING_MODE_SAME_DIRECTION
                  ? '오해 모드에서는 앞·뒤 바퀴가 모두 같은 방향으로 꺾여서, 차가 제자리 회전보다 대각선으로 “게걸음” 하듯 움직입니다.'
                  : '실제 자동차 모드에서는 앞바퀴만 조향하고, 좌우 바퀴 각도도 조금 달라지며 뒷바퀴는 그 궤적을 따라옵니다.'}
              </p>
            </div>

            <div className="panel">
              <div className="panel-header">
                <Label>카메라 모드</Label>
                <Badge className="badge-secondary">{cameraModeText}</Badge>
              </div>
              <div className="segmented-control segmented-control-3">
                <Button
                  variant={settings.cameraMode === CAMERA_MODE_OVERVIEW ? 'primary' : 'outline'}
                  className="segment-button"
                  onClick={() => setSettings((s) => ({ ...s, cameraMode: CAMERA_MODE_OVERVIEW }))}
                >
                  자유 카메라
                </Button>
                <Button
                  variant={settings.cameraMode === CAMERA_MODE_FOLLOW ? 'primary' : 'outline'}
                  className="segment-button"
                  onClick={() => setSettings((s) => ({ ...s, cameraMode: CAMERA_MODE_FOLLOW }))}
                >
                  차 중심 고정
                </Button>
                <Button
                  variant={settings.cameraMode === CAMERA_MODE_DRIVER ? 'primary' : 'outline'}
                  className="segment-button"
                  onClick={() => setSettings((s) => ({ ...s, cameraMode: CAMERA_MODE_DRIVER }))}
                >
                  운전석 뷰
                </Button>
              </div>
              <p className="help-text">
                차 중심 고정 모드에서는 카메라가 차 뒤·위쪽에 붙어서 함께 움직이고, 운전석 뷰에서는 대시보드/핸들/후방카메라/사이드미러가 함께 표시됩니다.
              </p>
              {settings.cameraMode === CAMERA_MODE_FOLLOW && (
                <div className="camera-follow-controls">
                  <div className="slider-header">
                    <Label>카메라 거리</Label>
                    <span>{settings.followCameraDistance.toFixed(1)} m</span>
                  </div>
                  <Slider
                    value={[settings.followCameraDistance]}
                    min={5.8}
                    max={14}
                    step={0.1}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, followCameraDistance: v }))}
                  />
                  <p className="help-text">차 중심 고정 모드에서는 마우스 휠로도 줌인/줌아웃할 수 있습니다.</p>
                </div>
              )}
              {settings.cameraMode === CAMERA_MODE_DRIVER && (
                <p className="help-text">
                  운전석 뷰에서는 앞유리 너머 전방 장면을 보면서, BMW 스타일처럼 가운데 후방카메라와 좌우 미러를 함께 참고할 수 있습니다.
                </p>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">
                <Label>조작 방식</Label>
                <div className="inline-row mode-toggle">
                  <span className={settings.keyboardMode ? 'emphasis' : 'muted'}>키보드</span>
                  <Switch
                    checked={!settings.keyboardMode}
                    onCheckedChange={(checked) => setSettings((s) => ({ ...s, keyboardMode: !checked }))}
                  />
                  <span className={!settings.keyboardMode ? 'emphasis' : 'muted'}>슬라이더</span>
                </div>
              </div>
              <p className="help-text">
                키보드: W/S 또는 ↑/↓로 전진·후진, A/D 또는 ←/→로 핸들.<br />
                슬라이더: 일정 속도와 조향각을 유지하며 궤적 비교.
              </p>
            </div>

            {!settings.keyboardMode && (
              <div className="panel stack-gap">
                <div>
                  <div className="slider-header"><Label>속도</Label><span>{settings.manualSpeed.toFixed(2)} m/s</span></div>
                  <Slider
                    value={[settings.manualSpeed]}
                    min={-settings.maxReverseSpeed}
                    max={settings.maxForwardSpeed}
                    step={0.05}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, manualSpeed: v }))}
                  />
                </div>
                <div>
                  <div className="slider-header"><Label>조향각</Label><span>{radToDeg(settings.manualSteer).toFixed(1)}°</span></div>
                  <Slider
                    value={[radToDeg(settings.manualSteer)]}
                    min={-radToDeg(settings.maxSteer)}
                    max={radToDeg(settings.maxSteer)}
                    step={0.5}
                    onValueChange={([v]) => setSettings((s) => ({ ...s, manualSteer: degToRad(v) }))}
                  />
                </div>
              </div>
            )}

            <div className="panel stack-gap">
              <div>
                <div className="slider-header"><Label>축간거리 (휠베이스)</Label><span>{settings.wheelbase.toFixed(2)} m</span></div>
                <Slider
                  value={[settings.wheelbase]}
                  min={2.2}
                  max={3.4}
                  step={0.05}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, wheelbase: v }))}
                />
              </div>
              <div>
                <div className="slider-header"><Label>좌우 바퀴 간격 (트랙)</Label><span>{settings.track.toFixed(2)} m</span></div>
                <Slider
                  value={[settings.track]}
                  min={1.4}
                  max={1.9}
                  step={0.01}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, track: v }))}
                />
              </div>
              <div>
                <div className="slider-header"><Label>최대 조향각</Label><span>{radToDeg(settings.maxSteer).toFixed(0)}°</span></div>
                <Slider
                  value={[radToDeg(settings.maxSteer)]}
                  min={20}
                  max={42}
                  step={1}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, maxSteer: degToRad(v) }))}
                />
              </div>
            </div>

            <div className="panel">
              <div className="info-title parking-title">주차장 변경</div>
              <ul className="parking-notes">
                <li>• 주행 통로 폭을 조금 넓혀서 차를 빼고 넣을 때 여유가 더 생겼습니다.</li>
                <li>• 주차된 차들은 이제 실제 주차칸 중심에 들어가도록 다시 맞췄습니다.</li>
                <li>• 옵션으로 가벼운 충돌 감지/정지 효과를 넣었습니다. 완전한 물리엔진은 아니고, 교육용으로 “부딪히면 멈춤”만 보여줍니다.</li>
              </ul>
            </div>

            <div className="panel stack-gap">
              <div className="toggle-row">
                <Label>바퀴별 궤적 표시</Label>
                <Switch
                  checked={settings.showWheelPaths}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, showWheelPaths: checked }))}
                />
              </div>
              <div className="toggle-row">
                <Label>설명 라벨 표시</Label>
                <Switch
                  checked={settings.showLabels}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, showLabels: checked }))}
                />
              </div>
            </div>

            <div className="button-grid">
              <Button onClick={resetSim}>초기화</Button>
              <Button variant="outline" onClick={clearTrails}>궤적 지우기</Button>
              <Button variant="secondary" onClick={setPresetStraight}>직진 후진</Button>
              <Button variant="secondary" onClick={setPresetReverseParking}>후진 주차</Button>
              <Button variant="secondary" className="full-width" onClick={setPresetTightTurn}>좁은 공간 회전</Button>
            </div>

            <div className="info-panel">
              <div className="info-title">어떻게 읽으면 좋은가</div>
              <ul>
                <li>• 파란 선은 앞바퀴 궤적, 초록 선은 뒷바퀴 궤적입니다.</li>
                <li>• 후진할수록 차 뒤쪽이 회전 중심처럼 느껴지고, 뒷바퀴가 안쪽으로 파고듭니다.</li>
                {settings.steeringMode === STEERING_MODE_SAME_DIRECTION ? (
                  <>
                    <li>• 이 모드에서는 네 바퀴가 같은 방향을 보므로 차체 방향은 거의 안 바뀌고, 차 전체가 비스듬히 이동합니다.</li>
                    <li>• 즉 “핸들을 돌리면 네 바퀴가 다 같은 방향으로 돈다”는 생각은 일반 자동차 회전 방식과 다르다는 걸 보여줍니다.</li>
                  </>
                ) : (
                  <li>• 같은 핸들 입력이어도 앞왼쪽/앞오른쪽 바퀴 각도가 다르게 보이는 이유가 Ackermann 조향입니다.</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="canvas-card">
          <CardContent className="canvas-content">
            <Canvas shadows gl={{ antialias: true }}>
              <Scene sim={sim} setSim={setSim} settings={settings} setSettings={setSettings} />
            </Canvas>
            <CockpitOverlay sim={sim} settings={settings} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
