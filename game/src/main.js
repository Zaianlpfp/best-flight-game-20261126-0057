// Boot and the game loop. Screens: title (the world flies itself behind
// the menu), play, pause, over. A ?shot=name&seed=N URL stages one frozen
// screenshot scene instead of the menu, so the screenshots are renders of the
// real game. Everything runs on a fixed 1/60 step with an accumulator, so the
// flight model behaves the same on any display.
import { buildWorld, groundAt } from './world.js';
import { createPlane, missionWon, stepPlane } from './plane.js';
import { createInput, readFlightInput, consumeClick, consumePress, consumeWheel } from './input.js';
import { createAudio } from './audio.js';
import { renderFrame } from './render.js';
import { stageShot, createDemo, stepDemo } from './shots.js';
import { MISSIONS, missionById } from './missions.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seedParam = Number.parseInt(params.get('seed') || '7', 10);
const seed = Number.isFinite(seedParam) ? seedParam : 7;

const input = createInput(canvas);
const audio = createAudio();
const statusEl = document.getElementById('status');

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const game = {
  screen: 'title',
  mission: MISSIONS[0],
  world: null,
  plane: null,
  selected: 0,
  cards: [],
  demo: createDemo(seed),
  muted: false,
  time: 0,
};

function startMission(mission) {
  game.mission = mission;
  game.world = buildWorld(mission, seed);
  game.plane = createPlane(mission, groundAt(game.world, 0));
  game.screen = 'play';
  game.plane.message = mission.name + ' — ' + mission.place;
  game.plane.messageTime = 3;
  statusEl.textContent = `${mission.name}: ${mission.tagline}`;
  audio.unlock();
}

function backToTitle() {
  game.demo = createDemo(seed);
  game.screen = 'title';
  statusEl.textContent = 'Sky Courier: pick a mission.';
}

function handleEvents(events) {
  for (const e of events) {
    if (e === 'ring' || e === 'village') audio.chime();
    if (e === 'landed' || e === 'complete') {
      audio.thud();
      audio.engine(0, false);
      game.screen = 'over';
      statusEl.textContent = game.plane.statusReason;
    }
    if (e === 'crashed') {
      audio.crash();
      audio.engine(0, false);
      game.screen = 'over';
      statusEl.textContent = game.plane.statusReason;
    }
  }
}

// A frozen screenshot scene: stage it once, then draw the same state forever.
const shotName = params.get('shot');
let frozen = null;
if (shotName) {
  frozen = stageShot(shotName, seed);
  game.world = frozen.world;
  game.plane = frozen.plane;
  game.screen = frozen.screen;
  game.mission = frozen.world.mission;
}

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  game.time += dt;
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (frozen) {
    renderFrame(ctx, { w, h, world: frozen.world, plane: frozen.plane, screen: frozen.screen, time: game.time, missions: MISSIONS, selected: 0, cards: game.cards });
    return;
  }

  const press = consumePress(input);
  const click = consumeClick(input);

  if (game.screen === 'title') {
    stepDemo(game.demo, dt);
    if (press === 'ArrowRight' || press === 'ArrowDown') game.selected = (game.selected + 1) % MISSIONS.length;
    if (press === 'ArrowLeft' || press === 'ArrowUp') game.selected = (game.selected + MISSIONS.length - 1) % MISSIONS.length;
    if (press === 'Enter' || press === ' ') startMission(MISSIONS[game.selected]);
    if (click) {
      for (const card of game.cards) {
        if (click.x >= card.x && click.x <= card.x + card.w && click.y >= card.y && click.y <= card.y + card.h) {
          startMission(MISSIONS[card.index]);
          break;
        }
      }
    }
    renderFrame(ctx, { w, h, world: game.demo.world, plane: game.demo.plane, screen: 'title', time: game.time, missions: MISSIONS, selected: game.selected, cards: game.cards });
    return;
  }

  if (game.screen === 'play') {
    if (press === 'p' || press === 'P' || press === 'Escape') {
      game.screen = 'pause';
    } else if (press === 'm' || press === 'M') {
      game.muted = audio.toggleMute();
    } else if (press === 'r' || press === 'R') {
      startMission(game.mission);
    } else {
      const flight = readFlightInput(input);
      consumeWheel(input);
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        const events = stepPlane(game.plane, flight, game.world, STEP);
        handleEvents(events);
        if (game.screen !== 'play') break;
      }
      audio.engine(game.plane.throttle, game.screen === 'play');
    }
    renderFrame(ctx, { w, h, world: game.world, plane: game.plane, screen: game.screen, time: game.time, missions: MISSIONS, selected: game.selected, cards: game.cards });
    return;
  }

  if (game.screen === 'pause') {
    if (press === 'p' || press === 'P' || press === 'Escape') game.screen = 'play';
    if (press === 'r' || press === 'R') startMission(game.mission);
    if (press === 't' || press === 'T') backToTitle();
    renderFrame(ctx, { w, h, world: game.world, plane: game.plane, screen: 'pause', time: game.time, missions: MISSIONS, selected: game.selected, cards: game.cards });
    return;
  }

  // over
  if (press === 'r' || press === 'R') startMission(game.mission);
  if (press === 't' || press === 'T') backToTitle();
  if (press === 'n' || press === 'N') {
    const next = MISSIONS[(MISSIONS.indexOf(game.mission) + 1) % MISSIONS.length];
    startMission(next);
  }
  renderFrame(ctx, { w, h, world: game.world, plane: game.plane, screen: 'over', time: game.time, missions: MISSIONS, selected: game.selected, cards: game.cards });
  void missionWon;
}

requestAnimationFrame(frame);
