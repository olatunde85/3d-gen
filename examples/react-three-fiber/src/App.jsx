import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { PRESET_NAMES } from 'ara3d';
import { Character } from './Character';

export default function App() {
  const [preset, setPreset] = useState('The Priest');
  const [goal, setGoal] = useState(null);
  const [run, setRun] = useState(false);
  const [ready, setReady] = useState(false);

  // Click the ground to walk there, double-click to run.
  const walkTo = (event, running) => { event.stopPropagation(); setGoal(event.point.clone().setY(0)); setRun(running); };

  return (
    <>
      <Canvas shadows camera={{ position: [0, 2.2, 6], fov: 40 }}>
        <color attach="background" args={['#15161a']} />
        <hemisphereLight args={['#dfe8ff', '#2a2f3a', 1.6]} />
        <directionalLight position={[4, 8, 5]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={(e) => walkTo(e, false)} onDoubleClick={(e) => walkTo(e, true)}>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#25262c" />
        </mesh>
        <Grid args={[60, 60]} position-y={0.002} cellColor="#2c2d34" sectionColor="#3a3b44" fadeDistance={30} />
        <Character key={preset} preset={preset} goal={goal} run={run} onArrive={() => setGoal(null)} onReady={() => setReady(true)} />
        <OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI * 0.49} />
      </Canvas>
      <div style={{ position: 'fixed', left: 16, top: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <select value={preset} onChange={(e) => { setReady(false); setGoal(null); setPreset(e.target.value); }}
          style={{ background: '#111114', color: '#f4f4f5', border: '1px solid #2a2a31', borderRadius: 8, padding: '8px 10px' }}>
          {PRESET_NAMES.map((name) => <option key={name}>{name}</option>)}
        </select>
        <span style={{ color: '#a1a1aa' }}>{ready ? 'Click the ground to walk there, double-click to run. Drag to look around.' : 'Building…'}</span>
      </div>
    </>
  );
}
