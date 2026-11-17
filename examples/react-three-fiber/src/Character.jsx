import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createCharacter } from 'ara3d';

/**
 * An Ara character that walks to `goal` (a THREE.Vector3, or null to stand), running when `run` is set. Standing
 * still, it looks at the camera. `preset` is any preset name, such as "The Priest".
 */
export function Character({ preset, goal, run = false, onArrive, onReady }) {
  const [hero, setHero] = useState(null);
  const state = useRef({ mixer: null, legs: null, speed: 0 });

  // Build the character once per preset, and free it when it's replaced or the component goes away.
  useEffect(() => {
    let cancelled = false, built = null;
    createCharacter(preset, { animations: ['idle', 'walk', 'run'] }).then((h) => {
      if (cancelled) { h.dispose(); return; }
      built = h;
      h.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const mixer = new THREE.AnimationMixer(h.scene);
      state.current = { mixer, legs: h.locomotion(mixer), speed: 0 };
      setHero(h);
      onReady?.(h);
    });
    return () => { cancelled = true; built?.dispose(); setHero(null); };
  }, [preset]);

  useFrame(({ camera }, delta) => {
    const s = state.current;
    if (!hero || !s.mixer) return;
    const body = hero.scene, to = goal ? new THREE.Vector3().subVectors(goal, body.position).setY(0) : null;
    const moving = to && to.length() > 0.15;
    if (to && !moving) onArrive?.();

    // Ease towards the character's natural walking or running pace.
    const wanted = moving ? (run ? s.legs.runSpeed : s.legs.walkSpeed) : 0;
    s.speed = THREE.MathUtils.damp(s.speed, wanted, 6, delta);
    if (moving) {
      const heading = Math.atan2(to.x, to.z), turn = Math.atan2(Math.sin(heading - body.rotation.y), Math.cos(heading - body.rotation.y));
      body.rotation.y += turn * Math.min(1, delta * 10);
    }
    body.position.x += Math.sin(body.rotation.y) * s.speed * delta;
    body.position.z += Math.cos(body.rotation.y) * s.speed * delta;
    s.legs.speed = s.speed;

    hero.lookAt(s.speed < 0.2 ? camera : null);
    s.mixer.update(delta);
    hero.update(delta); // blinking and looking, after the mixer has posed the body
  });

  return hero ? <primitive object={hero.scene} /> : null;
}
