// The flight model: one small prop plane with throttle, bank, pitch, fuel and
// damage. It flies in track coordinates — x is sideways from the centreline,
// y is feet above the terrain under it, z is distance down the route — so the
// renderer can put the camera right behind it. Every decision the pilot makes
// costs something: throttle burns fuel, bank bleeds speed, climbing costs
// speed, and going slow near the ground ends the sortie.
import { SEG_LEN, centreAt, groundAt, segmentAt } from './world.js';

export const STALL_SPEED = 42;
export const TOUCHDOWN_SPEED = 95;

export function createPlane(mission, ground0 = 0) {
  return {
    x: 0,
    y: ground0 + 90,
    z: 0,
    speed: 60,
    heading: 0,
    bank: 0,
    pitch: 0,
    throttle: 0.55,
    fuel: mission.fuel,
    score: 0,
    rings: 0,
    villages: 0,
    status: 'flying',
    statusReason: '',
    message: '',
    messageTime: 0,
    time: 0,
    verticalSpeed: 0,
    maxAlt: 0,
  };
}

// One fixed step (dt seconds). `input` is { steer, pitch, throttleUp,
// throttleDown } with steer/pitch in -1..1. Returns the events that happened
// this step: 'ring', 'miss', 'village', 'landed', 'crashed', 'complete',
// 'lowfuel', 'stall'.
export function stepPlane(plane, input, world, dt) {
  const mission = world.mission;
  const events = [];
  if (plane.status !== 'flying') return events;
  plane.time += dt;

  // Throttle: W/S move it, the wheel moves it, and empty tanks force idle.
  if (input.throttleUp) plane.throttle = Math.min(1, plane.throttle + 0.5 * dt);
  if (input.throttleDown) plane.throttle = Math.max(0, plane.throttle - 0.6 * dt);
  if (plane.fuel <= 0) {
    plane.fuel = 0;
    plane.throttle = 0;
  }

  // Speed chases the throttle setting; banking and climbing bleed it off.
  const targetSpeed = plane.throttle * mission.maxSpeed;
  const drag = 0.35 + Math.abs(plane.bank) * 0.35 + Math.max(0, plane.pitch) * 0.3;
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, drag * dt);
  plane.speed = Math.max(0, plane.speed);

  // Bank eases toward the stick; the turn follows the bank, and the bank
  // slides the plane sideways off the centreline.
  const targetBank = input.steer * 0.85;
  plane.bank += (targetBank - plane.bank) * Math.min(1, 3.2 * dt);
  plane.heading += plane.bank * (plane.speed / 140) * dt * 0.9;
  const windPush = Math.sin(plane.time * 0.35) * mission.wind;
  plane.x += (plane.bank * plane.speed * 0.85 + windPush) * dt;

  // Pitch: up climbs, down descends; climb rate scales with speed, and a
  // stalled wing sinks instead of flying.
  const targetPitch = input.pitch * 0.55;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, 2.6 * dt);
  let climb = plane.pitch * plane.speed * 0.9;
  if (plane.speed < STALL_SPEED) {
    climb -= (STALL_SPEED - plane.speed) * 1.6;
    if (plane.time - (plane.lastStall || -99) > 4) {
      events.push('stall');
      plane.lastStall = plane.time;
    }
  }
  plane.verticalSpeed = climb;
  plane.y += climb * dt;
  plane.y = Math.max(0, plane.y);
  if (plane.y > plane.maxAlt) plane.maxAlt = plane.y;

  plane.z += plane.speed * dt;

  // Fuel burns with throttle; the needle hitting a quarter earns a warning.
  const before = plane.fuel;
  plane.fuel -= plane.throttle * mission.burn * dt * 0.9;
  if (before > 25 && plane.fuel <= 25) events.push('lowfuel');

  // Rings: crossing a ring's plane inside its circle scores; outside misses.
  // Rings are checked in route order: the first ring not yet decided whose
  // plane the nose has crossed is judged this step, so a fast plane can never
  // skip past one between segments.
  for (const ring of world.rings) {
    if (ring.passed || ring.missed) continue;
    const ringZ = world.segments[ring.seg].z;
    if (plane.z < ringZ) break;
    const dx = plane.x - ring.dx;
    const dy = plane.y - ring.dy;
    if (Math.hypot(dx, dy) < ring.r) {
      ring.passed = true;
      plane.rings += 1;
      plane.score += 150;
      plane.fuel = Math.min(100, plane.fuel + 12);
      plane.message = `RING ${plane.rings}/${mission.rings}  +150`;
      plane.messageTime = 2.2;
      events.push('ring');
    } else {
      ring.missed = true;
      plane.message = 'RING MISSED';
      plane.messageTime = 1.6;
      events.push('miss');
    }
    break;
  }

  // Villages: a mail drop counts when the plane is low over the village.
  const seg = segmentAt(world, plane.z);
  if (seg.village && !seg.village.delivered) {
    const vz = seg.z;
    if (plane.z >= vz && plane.z < vz + SEG_LEN * 2) {
      if (plane.y < 220 && Math.abs(plane.x) < 320) {
        seg.village.delivered = true;
        plane.villages += 1;
        plane.score += 200;
        plane.message = `MAIL DELIVERED ${plane.villages}/${mission.villages}  +200`;
        plane.messageTime = 2.4;
        events.push('village');
      }
    }
  }

  // The ground: plane.y is height above the terrain under it, so touching
  // down means y near zero. Touching down on the runway, slow and level, is
  // a landing; touching anywhere else, or too fast, or banked over, is a crash.
  const ground = groundAt(world, plane.z);
  const onRunway = world.runwayStart > 0 && plane.z >= world.runwayStart * SEG_LEN;
  if (plane.y <= 2) {
    plane.y = 0;
    if (onRunway && plane.speed <= TOUCHDOWN_SPEED && Math.abs(plane.bank) < 0.3 && Math.abs(plane.verticalSpeed) < 26) {
      plane.status = 'landed';
      plane.statusReason = 'TOUCHDOWN — CLEAN LANDING';
      plane.score += 300;
      events.push('landed');
    } else if (onRunway && plane.speed > TOUCHDOWN_SPEED) {
      plane.status = 'crashed';
      plane.statusReason = 'TOO FAST ON TOUCHDOWN';
      events.push('crashed');
    } else if (onRunway && Math.abs(plane.bank) >= 0.3) {
      plane.status = 'crashed';
      plane.statusReason = 'WING DOWN ON TOUCHDOWN';
      events.push('crashed');
    } else {
      plane.status = 'crashed';
      plane.statusReason = ground > 60 ? 'INTO THE RIDGE' : 'INTO THE GROUND';
      events.push('crashed');
    }
    return events;
  }

  // Running out of road: the route ends past the last segment.
  if (plane.z >= world.length * SEG_LEN) {
    if (mission.landing) {
      plane.status = 'crashed';
      plane.statusReason = 'OVERSHOT THE STRIP';
      events.push('crashed');
    } else {
      plane.status = 'done';
      plane.statusReason = 'ROUTE COMPLETE';
      plane.score += 250;
      events.push('complete');
    }
    return events;
  }

  // Out of fuel over land with no runway left is a forced landing, not a win.
  if (plane.fuel <= 0 && plane.y <= 2) {
    plane.status = 'crashed';
    plane.statusReason = 'OUT OF FUEL';
    events.push('crashed');
  }
  if (plane.messageTime > 0) plane.messageTime -= dt;
  return events;
}

// A mission is won when its own goal is met: all rings, or a clean landing
// after every village has its mail.
export function missionWon(plane, world) {
  const mission = world.mission;
  if (mission.landing) {
    return plane.status === 'landed' && plane.villages >= mission.villages;
  }
  return plane.status === 'done' && plane.rings >= mission.rings;
}
