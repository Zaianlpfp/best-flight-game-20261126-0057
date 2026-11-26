// Seeded random numbers, so a world built from one seed always looks the same.
// The game never reads Math.random for world content: every hill, tree, ring and
// gust comes from one of these streams, which is what makes screenshot scenes
// reproducible from a seed in the URL.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small helper stream: one function per call site keeps the draws in a fixed
// order, so adding a feature later does not reshuffle the world built before it.
export function makeStream(seed, salt) {
  return mulberry32((seed ^ Math.imul(salt, 2654435761)) >>> 0);
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

// Smooth 1-D noise: random values at integer points, cosine-interpolated.
export function noise1(seed, x) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const hash = (n) => {
    let h = Math.imul(n ^ seed, 2654435761);
    h ^= h >>> 13;
    h = Math.imul(h, 1597334677);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const a = hash(xi);
  const b = hash(xi + 1);
  const t = (1 - Math.cos(xf * Math.PI)) / 2;
  return a + (b - a) * t;
}
