// The world is a strip of segments laid out from a mission and a seed. Every
// hill, bend, ring, tree and house is decided here, once, so the flight model
// and the renderer both read the same fixed track. The track bends sideways
// (cx), rises and falls (ground), and changes terrain as the sortie goes on;
// the plane flies along it, and the renderer draws it back to front.
import { makeStream, noise1, range, rangeInt } from './rng.js';

export const SEG_LEN = 40;
export const DRAW_AHEAD = 110;
export const CORRIDOR_HALF = 260;

const PROFILES = {
  valley: { bendAmp: 620, bendFreq: 0.008, hillAmp: 55, hillFreq: 0.02, base: 0 },
  coast: { bendAmp: 260, bendFreq: 0.006, hillAmp: 26, hillFreq: 0.015, base: 0 },
  pass: { bendAmp: 480, bendFreq: 0.011, hillAmp: 150, hillFreq: 0.018, base: 40 },
};

function terrainAt(profile, i, length, runwayStart) {
  if (runwayStart > 0 && i >= runwayStart) return 'runway';
  if (profile === 'coast') {
    if (i < 150) return 'sea';
    if (i < 185) return 'sand';
    if (i < 300) return 'field';
    if (i < 430) return 'forest';
    return 'field';
  }
  if (profile === 'pass') {
    if (i < 70) return 'field';
    if (i < 160) return 'forest';
    if (i < 260) return 'rock';
    if (i < 340) return 'forest';
    if (i < 440) return 'rock';
    return 'field';
  }
  if (i < 70) return 'field';
  if (i < 190) return 'forest';
  if (i < 250) return 'town';
  if (i < 340) return 'field';
  return 'forest';
}

export function buildWorld(mission, seed) {
  const prof = PROFILES[mission.profile];
  const rng = makeStream(seed, 11);
  const length = mission.length;
  const runwayStart = mission.landing ? length - 25 : -1;

  const segments = [];
  let cx = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const targetCx = prof.bendAmp * (noise1(seed, i * prof.bendFreq) - 0.5) * 2;
    cx += (targetCx - cx) * 0.06;
    let ground = prof.base + prof.hillAmp * noise1(seed + 7, i * prof.hillFreq);
    if (profileIsSea(mission.profile, i)) ground = 0;
    if (runwayStart > 0 && i >= runwayStart - 6) {
      ground = prof.base + prof.hillAmp * noise1(seed + 7, (runwayStart - 6) * prof.hillFreq);
    }
    const type = terrainAt(mission.profile, i, length, runwayStart);
    const seg = {
      i,
      z: i * SEG_LEN,
      cx,
      ground,
      type,
      shade: i % 2,
      ring: null,
      trees: [],
      houses: [],
      village: null,
    };
    if (type === 'forest' || type === 'field') {
      const count = type === 'forest' ? rangeInt(rng, 1, 4) : rangeInt(rng, 0, 2);
      for (let k = 0; k < count; k += 1) {
        const side = rng() < 0.5 ? -1 : 1;
        seg.trees.push({ dx: side * range(rng, CORRIDOR_HALF + 60, 1500), s: range(rng, 16, 34) });
      }
    }
    if (type === 'town') {
      const count = rangeInt(rng, 0, 3);
      for (let k = 0; k < count; k += 1) {
        const side = rng() < 0.5 ? -1 : 1;
        seg.houses.push({ dx: side * range(rng, CORRIDOR_HALF + 50, 900), w: range(rng, 26, 52), hue: rangeInt(rng, 0, 5) });
      }
    }
    segments.push(seg);
  }

  // Rings: spread down the route, sitting above the track so the pilot flies
  // through them, never around them.
  const rings = [];
  const ringRng = makeStream(seed, 23);
  for (let r = 0; r < mission.rings; r += 1) {
    const fi = 50 + Math.floor(((r + 0.5) / mission.rings) * (length - 130)) + rangeInt(ringRng, -8, 8);
    const seg = segments[Math.min(fi, length - 2)];
    const ring = { seg: seg.i, dx: range(ringRng, -70, 70), dy: range(ringRng, 80, 135), r: 26, passed: false };
    seg.ring = ring;
    rings.push(ring);
  }

  // Villages: a checkpoint is a stretch of houses with a low drop window.
  const villages = [];
  const vilRng = makeStream(seed, 37);
  for (let v = 0; v < mission.villages; v += 1) {
    const fi = Math.floor(length * (0.32 + v * 0.22)) + rangeInt(vilRng, -6, 6);
    const seg = segments[Math.min(fi, length - 30)];
    const village = { seg: seg.i, delivered: false };
    seg.village = village;
    for (let d = -2; d <= 2; d += 1) {
      const s = segments[seg.i + d];
      if (!s) continue;
      const count = rangeInt(vilRng, 1, 3);
      for (let k = 0; k < count; k += 1) {
        const side = vilRng() < 0.5 ? -1 : 1;
        s.houses.push({ dx: side * range(vilRng, CORRIDOR_HALF + 20, 420), w: range(vilRng, 24, 46), hue: rangeInt(vilRng, 0, 5) });
      }
    }
    villages.push(village);
  }

  // Clouds drift far above the route; the storm profile keeps them low and grey.
  const clouds = [];
  const clRng = makeStream(seed, 51);
  for (let c = 0; c < 16; c += 1) {
    clouds.push({
      x: range(clRng, -2600, 2600),
      y: mission.palette === 'storm' ? range(clRng, 200, 320) : range(clRng, 340, 560),
      z: range(clRng, 0, length * SEG_LEN),
      s: range(clRng, 120, 300),
    });
  }

  return { mission, seed, segments, length, rings, villages, clouds, runwayStart };
}

function profileIsSea(profile, i) {
  return profile === 'coast' && i < 150;
}

// The segment under a distance z, clamped to the track ends.
export function segmentAt(world, z) {
  const i = Math.max(0, Math.min(world.length - 1, Math.floor(z / SEG_LEN)));
  return world.segments[i];
}

// Terrain height under a distance z, interpolated between segments.
export function groundAt(world, z) {
  const i = Math.max(0, Math.min(world.length - 1, z / SEG_LEN));
  const a = world.segments[Math.floor(i)];
  const b = world.segments[Math.min(world.length - 1, Math.ceil(i))];
  const f = i - Math.floor(i);
  return a.ground + (b.ground - a.ground) * f;
}

// Track centreline x at a distance z, interpolated the same way.
export function centreAt(world, z) {
  const i = Math.max(0, Math.min(world.length - 1, z / SEG_LEN));
  const a = world.segments[Math.floor(i)];
  const b = world.segments[Math.min(world.length - 1, Math.ceil(i))];
  const f = i - Math.floor(i);
  return a.cx + (b.cx - a.cx) * f;
}
