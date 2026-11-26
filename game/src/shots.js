// Screenshot scenes: each one plays the real rules forward from a fresh world
// for a fixed number of steps, steered by a simple autopilot, so the frame is
// what a short game really looks like and the same seed always gives the same
// frame. The autopilot chases the next ring (or the runway centreline on
// final), holds a target speed and altitude, and never does anything a player
// could not do — it only reads the same state the game shows.
import { buildWorld, groundAt } from './world.js';
import { createPlane, stepPlane } from './plane.js';
import { missionById } from './missions.js';

const STEP = 1 / 30;

// Steer toward a lateral target, climb or dive toward an altitude target, and
// hold a speed target. Returns the input shape stepPlane takes.
function autopilot(plane, world, target) {
  const steer = Math.max(-1, Math.min(1, (target.x - plane.x) * 0.012));
  const pitch = Math.max(-1, Math.min(1, (target.y - plane.y) * 0.02));
  const throttleUp = plane.speed < target.speed - 6;
  const throttleDown = plane.speed > target.speed + 6;
  return { steer, pitch, throttleUp, throttleDown };
}

function runUntil(plane, world, maxSeconds, targetFn, stopFn) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (plane.status !== 'flying') break;
    stepPlane(plane, autopilot(plane, world, targetFn(plane, world)), world, STEP);
    if (stopFn && stopFn(plane, world)) break;
  }
}

function ringTarget(plane, world) {
  for (const ring of world.rings) {
    if (ring.passed || ring.missed) continue;
    return { x: ring.dx, y: ring.dy, speed: 150 };
  }
  return { x: 0, y: 110, speed: 150 };
}

function runwayTarget(plane, world) {
  const dist = world.runwayStart * 40 - plane.z;
  // Glidepath that reaches the pavement: the floor is 0, so the autopilot
  // is still descending onto the strip when it gets there, not floating over it.
  const glide = Math.max(0, Math.min(120, dist * 0.06));
  return { x: 0, y: glide, speed: dist < 600 ? 82 : 140 };
}

// Distance to the next ring the pilot has not decided yet, in world units.
function distToNextRing(plane, world) {
  for (const ring of world.rings) {
    if (ring.passed || ring.missed) continue;
    return world.segments[ring.seg].z - plane.z;
  }
  return Infinity;
}

// The four scenes in shots.json. Each returns a ready-to-draw game state,
// staged so its subject — a ring, the runway, a village — sits close ahead
// and reads at a glance.
export function stageShot(name, seed) {
  if (name === 'landing') {
    const mission = missionById('island');
    const world = buildWorld(mission, seed);
    const plane = createPlane(mission, groundAt(world, 0));
    runUntil(plane, world, 170, (p, w) => {
      const dist = w.runwayStart * 40 - p.z;
      return dist < 4000 ? runwayTarget(p, w) : ringTarget(p, w);
    }, (p, w) => w.runwayStart * 40 - p.z < 320);
    plane.message = '';
    plane.messageTime = 0;
    return { world, plane, screen: 'play' };
  }
  if (name === 'storm') {
    const mission = missionById('mail');
    const world = buildWorld(mission, seed);
    const plane = createPlane(mission, groundAt(world, 0));
    const firstVillage = world.villages[0];
    const villageZ = firstVillage ? world.segments[firstVillage.seg].z : 6000;
    // Stop with the first village about 450 units ahead, so its houses sit
    // in the mid-field on both sides of the corridor, in frame.
    runUntil(plane, world, 70, (p, w) => {
      const seg = w.segments[Math.min((p.z / 40) | 0, w.length - 1)];
      if (seg.village) return { x: 0, y: 150, speed: 135 };
      return ringTarget(p, w);
    }, (p) => p.z > villageZ - 450);
    plane.message = '';
    plane.messageTime = 0;
    return { world, plane, screen: 'play' };
  }
  if (name === 'rings') {
    const mission = missionById('rings');
    const world = buildWorld(mission, seed);
    const plane = createPlane(mission, groundAt(world, 0));
    runUntil(plane, world, 40, ringTarget, (p, w) => p.rings >= 1 && distToNextRing(p, w) < 380);
    plane.message = '';
    plane.messageTime = 0;
    return { world, plane, screen: 'play' };
  }
  // cover: the valley run, deep in, a ring dead ahead and the sea behind.
  const mission = missionById('rings');
  const world = buildWorld(mission, seed);
  const plane = createPlane(mission, groundAt(world, 0));
  runUntil(plane, world, 90, ringTarget, (p, w) => p.rings >= 3 && distToNextRing(p, w) < 380);
  if (plane.rings > 0) {
    plane.message = `RING ${plane.rings}/8  +150`;
    plane.messageTime = 99;
  }
  return { world, plane, screen: 'play' };
}

// The title screen's demo flight: the valley mission flying itself, looping
// back to the start whenever it finishes, so the menu always sits over a
// living sky.
export function createDemo(seed) {
  const mission = missionById('rings');
  const world = buildWorld(mission, seed);
  const plane = createPlane(mission, groundAt(world, 0));
  return { world, plane };
}

export function stepDemo(demo, dt) {
  const { plane, world } = demo;
  if (plane.status !== 'flying') {
    const fresh = createDemo(world.seed);
    demo.world = fresh.world;
    demo.plane = fresh.plane;
    return demo;
  }
  stepPlane(plane, autopilot(plane, world, ringTarget(plane, world)), world, dt);
  return demo;
}
