// Everything the eye sees: the pseudo-3D chase view, the plane, the HUD and
// the title / pause / end screens. The world is drawn back to front — sky,
// sun, clouds, far ridges, then one ground band per segment from far to near,
// the valley corridor and runway on top of it, trees, houses and rings, then
// the plane's shadow, the plane itself, and finally the instruments. The HUD
// is drawn on the same canvas, so a screenshot always carries it.
import { DRAW_AHEAD, SEG_LEN, centreAt, groundAt } from './world.js';

const CAM_DEPTH = 0.84;

const PALETTES = {
  day: {
    skyTop: '#3f7fc1', skyMid: '#8fc3e8', skyBot: '#d8ecf7', sun: '#fff3c4',
    fog: '#cfe4f2', ridgeFar: '#7d9cc4', ridgeNear: '#5d7f9e',
    ground: { sea: ['#2e6f92', '#2c6b8d'], sand: ['#dcc793', '#d8c28c'], field: ['#79a94b', '#75a448'], forest: ['#3e7a38', '#3c7536'], rock: ['#8a7d6d', '#857a69'], town: ['#9c9078', '#978c74'], runway: ['#3a3d44', '#383b42'] },
    corridor: '#b9a06a', corridorLine: '#e8e2c8',
  },
  gold: {
    skyTop: '#e8915a', skyMid: '#f2b879', skyBot: '#fbe3b0', sun: '#fff8dc',
    fog: '#f6d9a8', ridgeFar: '#b98a6d', ridgeNear: '#96684f',
    ground: { sea: ['#4a7d99', '#477a95'], sand: ['#e6cf9a', '#e1ca94'], field: ['#93b45a', '#8faf57'], forest: ['#4d8440', '#4a7f3e'], rock: ['#97806a', '#927c66'], town: ['#a89a80', '#a3967c'], runway: ['#3a3d44', '#383b42'] },
    corridor: '#c2a670', corridorLine: '#f4ecd2',
  },
  storm: {
    skyTop: '#4a5568', skyMid: '#6b7a8f', skyBot: '#9aa5b1', sun: '#d8dde2',
    fog: '#8b98a5', ridgeFar: '#5d6a78', ridgeNear: '#46525f',
    ground: { sea: ['#3d5a6e', '#3b576a'], sand: ['#b3a37e', '#ae9e79'], field: ['#5d8148', '#5a7c46'], forest: ['#2f5c2e', '#2d582c'], rock: ['#6e655c', '#6a6158'], town: ['#7d7466', '#797062'], runway: ['#33363d', '#31343b'] },
    corridor: '#8f7f5e', corridorLine: '#cfc6a8',
  },
};

function project(camX, camY, camZ, x, y, z, w, h, horizonY) {
  const dz = z - camZ;
  if (dz < 1) return null;
  const scale = CAM_DEPTH / dz;
  return {
    x: w / 2 + scale * (x - camX) * (w / 2),
    y: horizonY - scale * (y - camY) * (h / 2),
    scale,
  };
}

function ridgePoints(seed, count, w, base, amp, freq) {
  const pts = [];
  for (let i = 0; i <= count; i += 1) {
    const n = Math.sin(i * freq + seed) * 0.5 + Math.sin(i * freq * 2.7 + seed * 1.3) * 0.3 + Math.sin(i * freq * 6.1) * 0.2;
    pts.push([ (i / count) * w, base - (0.35 + n * 0.65) * amp ]);
  }
  return pts;
}

export function drawSky(ctx, w, h, palette, heading, time) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  g.addColorStop(0, palette.skyTop);
  g.addColorStop(0.55, palette.skyMid);
  g.addColorStop(1, palette.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * 0.62 + 2);

  // Sun, fixed in the sky, drifting slowly with the heading.
  const sunX = w * 0.78 - heading * 40;
  const sunY = h * 0.13;
  const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  sg.addColorStop(0, palette.sun);
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 90, 0, Math.PI * 2);
  ctx.fill();

  // Two ridge layers for parallax depth, offset by the heading.
  const horizonY = h * 0.46;
  const offFar = ((-heading * 60) % (w * 0.5) + w * 0.5) % (w * 0.5) - w * 0.25;
  ctx.fillStyle = palette.ridgeFar;
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 2);
  for (const [x, y] of ridgePoints(3, 24, w, horizonY, h * 0.1, 0.35)) ctx.lineTo(x + offFar, y);
  ctx.lineTo(w, horizonY + 2);
  ctx.closePath();
  ctx.fill();
  const offNear = ((-heading * 140) % (w * 0.5) + w * 0.5) % (w * 0.5) - w * 0.25;
  ctx.fillStyle = palette.ridgeNear;
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 2);
  for (const [x, y] of ridgePoints(11, 18, w, horizonY, h * 0.07, 0.5)) ctx.lineTo(x + offNear, y);
  ctx.lineTo(w, horizonY + 2);
  ctx.closePath();
  ctx.fill();
}

export function drawGround(ctx, w, h, world, plane, horizonY) {
  const palette = PALETTES[world.mission.palette];
  const camX = centreAt(world, plane.z) + plane.x;
  const camY = groundAt(world, plane.z) + plane.y + 14;
  const camZ = plane.z - 30;
  const k0 = Math.floor(plane.z / SEG_LEN);
  const kMax = Math.min(world.length - 1, k0 + DRAW_AHEAD);

  // Far to near: each band paints over the one behind it.
  for (let k = kMax; k >= k0; k -= 1) {
    const seg = world.segments[k];
    if (!seg) continue;
    const zNear = Math.max(seg.z, camZ + 2);
    const zFar = seg.z + SEG_LEN;
    const pNear = project(camX, camY, camZ, seg.cx, seg.ground, zNear, w, h, horizonY);
    const pFar = project(camX, camY, camZ, world.segments[Math.min(k + 1, world.length - 1)].cx, world.segments[Math.min(k + 1, world.length - 1)].ground, zFar, w, h, horizonY);
    if (!pNear || !pFar) continue;
    const top = Math.min(pNear.y, pFar.y);
    const bottom = Math.max(pNear.y, pFar.y);
    if (bottom < horizonY - 2 || top > h) continue;
    // The runway's asphalt is drawn as a strip below, over grass; if the
    // whole band were asphalt, the strip would read as a wall, not a strip.
    const colors = palette.ground[seg.type === 'runway' ? 'field' : seg.type] || palette.ground.field;
    ctx.fillStyle = colors[seg.shade];
    ctx.fillRect(0, top, w, Math.max(1, bottom - top + 1));

    // The valley floor: a strip that follows the track's bends.
    const half = 170;
    const a = project(camX, camY, camZ, seg.cx - half, seg.ground, zNear, w, h, horizonY);
    const b = project(camX, camY, camZ, seg.cx + half, seg.ground, zNear, w, h, horizonY);
    const c = project(camX, camY, camZ, world.segments[Math.min(k + 1, world.length - 1)].cx + half, world.segments[Math.min(k + 1, world.length - 1)].ground, zFar, w, h, horizonY);
    const d = project(camX, camY, camZ, world.segments[Math.min(k + 1, world.length - 1)].cx - half, world.segments[Math.min(k + 1, world.length - 1)].ground, zFar, w, h, horizonY);
    if (a && b && c && d) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      if (seg.type === 'runway') {
        ctx.fillStyle = '#33363d';
        ctx.fill();
        // Centreline dashes, one per segment, only where the strip is wide.
        if (k % 2 === 0 && b.x - a.x > 6) {
          ctx.fillStyle = '#f2f2e8';
          const mx = (a.x + b.x) / 2;
          const mw = Math.max(2, (b.x - a.x) * 0.02);
          ctx.fillRect(mx - mw / 2, Math.min(a.y, b.y), mw, Math.abs(b.y - a.y) * 0.7 + 1);
        }
      } else {
        ctx.fillStyle = palette.corridor;
        ctx.globalAlpha = 0.38;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Trees and houses near the camera, as billboards on the ground.
    if (k - k0 < 30) {
      for (const tree of seg.trees) drawTree(ctx, camX, camY, camZ, seg, tree, w, h, horizonY);
      for (const house of seg.houses) drawHouse(ctx, camX, camY, camZ, seg, house, w, h, horizonY);
    }
  }
}

function drawTree(ctx, camX, camY, camZ, seg, tree, w, h, horizonY) {
  const p = project(camX, camY, camZ, seg.cx + tree.dx, seg.ground, seg.z + SEG_LEN / 2, w, h, horizonY);
  if (!p || p.x < -40 || p.x > w + 40 || p.y < horizonY - 10 || p.y > h) return;
  const s = Math.max(2, p.scale * tree.s * (h / 2));
  ctx.fillStyle = '#2c5a26';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - s * 2.2);
  ctx.lineTo(p.x - s, p.y);
  ctx.lineTo(p.x + s, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(p.x - s * 0.12, p.y - s * 0.4, s * 0.24, s * 0.4);
}

const HOUSE_COLORS = ['#c96f4a', '#d9a441', '#7d9cc4', '#8a6f9e', '#6f9e6a', '#b8546a'];

function drawHouse(ctx, camX, camY, camZ, seg, house, w, h, horizonY) {
  const p = project(camX, camY, camZ, seg.cx + house.dx, seg.ground, seg.z + SEG_LEN / 2, w, h, horizonY);
  if (!p || p.x < -60 || p.x > w + 60 || p.y < horizonY - 10 || p.y > h) return;
  const s = Math.max(3, p.scale * house.w * (h / 2));
  ctx.fillStyle = HOUSE_COLORS[house.hue % HOUSE_COLORS.length];
  ctx.fillRect(p.x - s / 2, p.y - s * 0.7, s, s * 0.7);
  ctx.fillStyle = '#5a3a28';
  ctx.beginPath();
  ctx.moveTo(p.x - s * 0.6, p.y - s * 0.7);
  ctx.lineTo(p.x, p.y - s * 1.15);
  ctx.lineTo(p.x + s * 0.6, p.y - s * 0.7);
  ctx.closePath();
  ctx.fill();
}

export function drawClouds(ctx, w, h, world, plane, horizonY) {
  const camX = centreAt(world, plane.z) + plane.x;
  const camY = groundAt(world, plane.z) + plane.y + 14;
  const camZ = plane.z - 30;
  const storm = world.mission.palette === 'storm';
  for (const cloud of world.clouds) {
    if (cloud.z < plane.z - 100 || cloud.z > plane.z + DRAW_AHEAD * SEG_LEN) continue;
    const p = project(camX, camY, camZ, cloud.x, cloud.y, cloud.z, w, h, horizonY);
    if (!p || p.x < -200 || p.x > w + 200 || p.y < -40 || p.y > horizonY) continue;
    const s = Math.max(6, p.scale * cloud.s * (h / 2) * 0.02);
    ctx.fillStyle = storm ? 'rgba(70,78,90,0.75)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s * 1.6, s * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.7, p.y + s * 0.12, s * 0.9, s * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.7, p.y + s * 0.1, s, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawRings(ctx, w, h, world, plane, horizonY) {
  const camX = centreAt(world, plane.z) + plane.x;
  const camY = groundAt(world, plane.z) + plane.y + 14;
  const camZ = plane.z - 30;
  for (const ring of world.rings) {
    const seg = world.segments[ring.seg];
    if (seg.z < plane.z - 40 || seg.z > plane.z + DRAW_AHEAD * SEG_LEN) continue;
    const p = project(camX, camY, camZ, seg.cx + ring.dx, seg.ground + ring.dy, seg.z, w, h, horizonY);
    if (!p) continue;
    const rx = Math.max(3, p.scale * ring.r * (w / 2));
    const ry = Math.max(3, p.scale * ring.r * (h / 2));
    const next = nextRing(world) === ring;
    ctx.lineWidth = Math.max(2, rx * 0.12);
    ctx.strokeStyle = ring.passed ? '#37d67a' : ring.missed ? '#8a8f96' : next ? '#ffc93c' : '#f2f2f2';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (next) {
      ctx.lineWidth = Math.max(1, rx * 0.05);
      ctx.strokeStyle = 'rgba(255,201,60,0.45)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * 1.25, ry * 1.25, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function nextRing(world) {
  for (const ring of world.rings) {
    if (!ring.passed && !ring.missed) return ring;
  }
  return null;
}

// The plane itself, seen from behind and slightly above: wide wings, a short
// body, tail fin on top, prop disc at the nose, banked with the turn.
export function drawPlane(ctx, x, y, s, bank, pitch, throttle, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bank * 0.85);
  ctx.scale(s, s);
  // Wings, with amber tips and a slight dihedral.
  ctx.fillStyle = '#f4ead2';
  ctx.beginPath();
  ctx.moveTo(-92, -6);
  ctx.lineTo(-30, -14);
  ctx.lineTo(30, -14);
  ctx.lineTo(92, -6);
  ctx.lineTo(86, 4);
  ctx.lineTo(-86, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f0a13c';
  ctx.beginPath();
  ctx.moveTo(-92, -6);
  ctx.lineTo(-74, -9);
  ctx.lineTo(-72, 3);
  ctx.lineTo(-86, 4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(92, -6);
  ctx.lineTo(74, -9);
  ctx.lineTo(72, 3);
  ctx.lineTo(86, 4);
  ctx.closePath();
  ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(-30, 26, 60, 7);
  ctx.fillStyle = '#0e7c7b';
  ctx.beginPath();
  ctx.moveTo(-4, 26);
  ctx.lineTo(-4, 2);
  ctx.lineTo(6, 2);
  ctx.lineTo(10, 26);
  ctx.closePath();
  ctx.fill();
  // Fuselage: a rounded body, teal belly stripe, dark cockpit glass.
  ctx.fillStyle = '#f8f2e2';
  ctx.beginPath();
  ctx.moveTo(-13, -18);
  ctx.quadraticCurveTo(0, -26, 13, -18);
  ctx.lineTo(11, 24);
  ctx.quadraticCurveTo(0, 32, -11, 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0e7c7b';
  ctx.fillRect(-13, 8, 26, 7);
  ctx.fillStyle = '#22303c';
  ctx.beginPath();
  ctx.ellipse(0, -8, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nav lights: red port, green starboard.
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath();
  ctx.arc(-90, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#37d67a';
  ctx.beginPath();
  ctx.arc(90, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  // Gear legs and wheels, tucked but visible from behind.
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(-9, 28, 3, 8);
  ctx.fillRect(6, 28, 3, 8);
  ctx.beginPath();
  ctx.arc(-7, 38, 4, 0, Math.PI * 2);
  ctx.arc(8, 38, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void pitch;
  void throttle;
}


// ---------------------------------------------------------------------------
// HUD and screens
// ---------------------------------------------------------------------------

function fmt(n) {
  return String(Math.round(n)).padStart(3, '0');
}

function headingDeg(plane) {
  return ((plane.heading * 180 / Math.PI) % 360 + 360) % 360;
}

function compassLabel(deg) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(deg / 22.5) % 16];
}

export function drawHUD(ctx, w, h, world, plane) {
  const mission = world.mission;
  ctx.textBaseline = 'alphabetic';

  // Top-left: the three numbers a pilot lives by.
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(14, 12, 218, 96);
  ctx.fillStyle = '#e8f2f8';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText('ALTITUDE', 26, 32);
  ctx.fillText('SPEED', 26, 60);
  ctx.fillText('HEADING', 26, 88);
  ctx.font = '700 22px ui-monospace, monospace';
  ctx.fillText(`${fmt(plane.y * 3)} FT`, 118, 34);
  ctx.fillText(`${fmt(plane.speed)} KT`, 118, 62);
  ctx.fillText(`${fmt(headingDeg(plane))}° ${compassLabel(headingDeg(plane))}`, 118, 90);
  const vs = Math.round(plane.verticalSpeed * 3);
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillStyle = vs > 0 ? '#8fe3a8' : vs < 0 ? '#ffb35c' : '#c8d4de';
  ctx.fillText(vs > 0 ? `▲ ${vs} FT/S` : vs < 0 ? `▼ ${-vs} FT/S` : '— LEVEL', 118, 104);

  // Top-centre: a compass strip that scrolls with the heading.
  const cx = w / 2;
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(cx - 150, 12, 300, 34);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 150, 12, 300, 34);
  ctx.clip();
  const deg = headingDeg(plane);
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -90; d <= 90; d += 15) {
    const a = (deg + d + 360) % 360;
    const x = cx + (d / 90) * 150;
    const major = a % 45 === 0;
    ctx.fillStyle = '#e8f2f8';
    ctx.fillRect(x - 1, 18, 2, major ? 12 : 7);
    if (major) ctx.fillText(compassLabel(a), x, 42);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffc93c';
  ctx.beginPath();
  ctx.moveTo(cx - 6, 12);
  ctx.lineTo(cx + 6, 12);
  ctx.lineTo(cx, 22);
  ctx.closePath();
  ctx.fill();

  // Top-right: the sortie and the score.
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(w - 252, 12, 238, 96);
  ctx.fillStyle = '#e8f2f8';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText(mission.name, w - 240, 32);
  ctx.font = '400 13px system-ui, sans-serif';
  const goal = mission.landing
    ? (mission.villages ? `MAIL ${plane.villages}/${mission.villages} · LAND` : 'LAND ON THE STRIP')
    : `RINGS ${plane.rings}/${mission.rings}`;
  ctx.fillText(goal, w - 240, 56);
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText(`SCORE ${plane.score}`, w - 240, 80);
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.fillText(`TIME ${Math.floor(plane.time / 60)}:${String(Math.floor(plane.time % 60)).padStart(2, '0')}`, w - 240, 100);

  // Bottom-left: fuel and throttle bars.
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(14, h - 66, 238, 54);
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillStyle = '#e8f2f8';
  ctx.fillText('FUEL', 26, h - 46);
  ctx.fillText('THR', 26, h - 22);
  const fuelW = 150 * Math.max(0, plane.fuel / 100);
  ctx.fillStyle = plane.fuel < 25 ? '#ff5c5c' : plane.fuel < 50 ? '#ffc93c' : '#37d67a';
  ctx.fillRect(72, h - 56, fuelW, 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(72, h - 56, 150, 12);
  ctx.fillStyle = '#8fc3e8';
  ctx.fillRect(72, h - 32, 150 * plane.throttle, 12);
  ctx.strokeRect(72, h - 32, 150, 12);

  // Bottom-right: where the next thing is, and how far.
  const ring = nextRing(world);
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(w - 252, h - 66, 238, 54);
  ctx.fillStyle = '#e8f2f8';
  ctx.font = '700 12px system-ui, sans-serif';
  if (ring) {
    const seg = world.segments[ring.seg];
    const dist = Math.max(0, (seg.z - plane.z) * 0.9);
    const side = ring.dx - plane.x;
    ctx.fillText('NEXT RING', w - 240, h - 46);
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.fillText(`${side < -18 ? '◀ ' : side > 18 ? '▶ ' : '● '}${dist < 1000 ? `${Math.round(dist)} M` : `${(dist / 1000).toFixed(1)} KM`}`, w - 240, h - 20);
  } else if (world.runwayStart > 0) {
    const dist = Math.max(0, (world.runwayStart * SEG_LEN - plane.z) * 0.9);
    ctx.fillText('RUNWAY', w - 240, h - 46);
    ctx.font = '700 20px ui-monospace, monospace';
    const align = Math.abs(plane.x) < 120 ? '● ALIGNED' : plane.x < 0 ? '◀ LEFT' : '▶ RIGHT';
    ctx.fillText(`${dist < 1000 ? `${Math.round(dist)} M` : `${(dist / 1000).toFixed(1)} KM`} ${align}`, w - 240, h - 20);
  } else {
    ctx.fillText('ROUTE CLEAR', w - 240, h - 46);
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.fillText('FLY THE VALLEY', w - 240, h - 20);
  }

  // Centre message, fading with its timer.
  if (plane.message && plane.messageTime > 0) {
    ctx.globalAlpha = Math.min(1, plane.messageTime);
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc93c';
    ctx.fillText(plane.message, w / 2, h * 0.3);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Warnings, flashing: low ground, low fuel, stalled wing. Low ground does
  // not warn on final approach — descending to the strip is the job there.
  const distToRunway = world.runwayStart > 0 ? world.runwayStart * SEG_LEN - plane.z : Infinity;
  const warnings = [];
  if (plane.status === 'flying' && plane.y < 45 && distToRunway > 1200) warnings.push('PULL UP');
  if (plane.fuel < 25) warnings.push('LOW FUEL');
  if (plane.speed < 42 && plane.status === 'flying') warnings.push('STALL — THROTTLE UP');
  if (warnings.length > 0 && Math.floor(plane.time * 4) % 2 === 0) {
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5c5c';
    ctx.fillText(warnings.join('  ·  '), w / 2, h * 0.42);
    ctx.textAlign = 'left';
  }
}

// The title screen: the world flies itself behind the panel.
export function drawTitle(ctx, w, h, missions, selected, cardsOut) {
  ctx.fillStyle = 'rgba(8,16,26,0.45)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8f2e2';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText('SKY COURIER', w / 2, 108);
  ctx.font = '400 22px system-ui, sans-serif';
  ctx.fillStyle = '#ffc93c';
  ctx.fillText('Island Airmail — a bush-plane courier game', w / 2, 142);
  ctx.textAlign = 'left';

  const cw = 300;
  const ch = 240;
  const gap = 28;
  const total = cw * 3 + gap * 2;
  const x0 = (w - total) / 2;
  const y0 = 190;
  cardsOut.length = 0;
  missions.forEach((m, i) => {
    const x = x0 + i * (cw + gap);
    const sel = i === selected;
    ctx.fillStyle = sel ? 'rgba(255,201,60,0.92)' : 'rgba(10,18,28,0.82)';
    ctx.fillRect(x, y0, cw, ch);
    ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = sel ? 4 : 2;
    ctx.strokeRect(x, y0, cw, ch);
    ctx.fillStyle = sel ? '#1c2733' : '#e8f2f8';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(m.name, x + 20, y0 + 44);
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillStyle = sel ? '#5a4a1a' : '#9fc3d8';
    ctx.fillText(m.place, x + 20, y0 + 70);
    ctx.fillStyle = sel ? '#1c2733' : '#e8f2f8';
    ctx.font = '400 14px system-ui, sans-serif';
    const words = m.tagline.split(' ');
    let line = '';
    let ly = y0 + 100;
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 34) {
        ctx.fillText(line.trim(), x + 20, ly);
        line = word;
        ly += 20;
      } else line += ' ' + word;
    }
    ctx.fillText(line.trim(), x + 20, ly);
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.fillStyle = sel ? '#3a3f46' : '#b8c8d4';
    m.brief.forEach((b, j) => ctx.fillText('· ' + b, x + 20, y0 + 158 + j * 20));
    cardsOut.push({ x, y: y0, w: cw, h: ch, index: i });
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8f2f8';
  ctx.font = '400 15px system-ui, sans-serif';
  ctx.fillText('Click a mission, or use ← → and press Enter.  Fly: ← → steer · ↑ climb · ↓ descend · W/S throttle · mouse steers, wheel throttles.', w / 2, h - 64);
  ctx.fillText('P pause · M mute · R restart', w / 2, h - 40);
  ctx.textAlign = 'left';
}

function drawPanel(ctx, w, h, title, titleColor, lines, footer) {
  ctx.fillStyle = 'rgba(8,16,26,0.55)';
  ctx.fillRect(0, 0, w, h);
  const pw = 520;
  const ph = 110 + lines.length * 30 + 60;
  const x = (w - pw) / 2;
  const y = (h - ph) / 2;
  ctx.fillStyle = 'rgba(12,20,30,0.92)';
  ctx.fillRect(x, y, pw, ph);
  ctx.strokeStyle = titleColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, pw, ph);
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText(title, w / 2, y + 58);
  ctx.fillStyle = '#e8f2f8';
  ctx.font = '400 17px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, w / 2, y + 104 + i * 30));
  ctx.font = '400 15px system-ui, sans-serif';
  ctx.fillStyle = '#9fc3d8';
  ctx.fillText(footer, w / 2, y + ph - 22);
  ctx.textAlign = 'left';
}

export function drawPause(ctx, w, h) {
  drawPanel(ctx, w, h, 'PAUSED', '#8fc3e8', ['The Pelican is holding station.'], 'P resume · R restart · T title');
}

export function drawOver(ctx, w, h, plane, world) {
  const won = plane.status === 'landed' || plane.status === 'done';
  const title = plane.status === 'landed' ? 'TOUCHDOWN!' : plane.status === 'done' ? 'ROUTE COMPLETE!' : 'CRASHED';
  const color = won ? '#37d67a' : '#ff5c5c';
  const lines = [
    plane.statusReason || '',
    `Score ${plane.score} · Rings ${plane.rings}/${world.mission.rings}` + (world.mission.villages ? ` · Mail ${plane.villages}/${world.mission.villages}` : ''),
    `Time ${Math.floor(plane.time / 60)}:${String(Math.floor(plane.time % 60)).padStart(2, '0')} · Top altitude ${Math.round(plane.maxAlt * 3)} ft`,
  ];
  drawPanel(ctx, w, h, title, color, lines, 'R retry this mission · N next mission · T title');
}

// One frame: world first, then the plane, then the instruments, then the
// screen on top. `view` carries everything the frame needs.
export function renderFrame(ctx, view) {
  const { w, h, world, plane, screen, time } = view;
  const palette = PALETTES[world.mission.palette];
  const horizonY = h * 0.46;
  drawSky(ctx, w, h, palette, plane.heading, time);
  drawClouds(ctx, w, h, world, plane, horizonY);
  drawGround(ctx, w, h, world, plane, horizonY);
  drawRings(ctx, w, h, world, plane, horizonY);

  // The plane's shadow on the ground below it, shrinking with height.
  const camX = centreAt(world, plane.z) + plane.x;
  const camY = groundAt(world, plane.z) + plane.y + 14;
  const camZ = plane.z - 30;
  const groundY = groundAt(world, plane.z);
  const shadow = project(camX, camY, camZ, camX, groundY, plane.z, w, h, horizonY);
  if (shadow) {
    const sw = Math.max(4, shadow.scale * 60 * (w / 2) * 0.02);
    ctx.fillStyle = `rgba(10,14,18,${Math.max(0.08, 0.4 - plane.y / 500)})`;
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, sw, sw * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The plane, low and centred, banked with the turn.
  const s = Math.min(w, h) / 540;
  drawPlane(ctx, w / 2 + plane.bank * 70, h * 0.74 - plane.pitch * 46, s, plane.bank, plane.pitch, plane.throttle, time);

  if (screen === 'play' || screen === 'pause') drawHUD(ctx, w, h, world, plane);
  if (screen === 'title') drawTitle(ctx, w, h, view.missions, view.selected, view.cards);
  if (screen === 'pause') drawPause(ctx, w, h);
  if (screen === 'over') drawOver(ctx, w, h, plane, world);
}
