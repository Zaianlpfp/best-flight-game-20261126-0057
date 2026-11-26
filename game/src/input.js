// Keyboard and mouse, read as one input state. The plane answers both: keys
// for throttle, bank and pitch, and the mouse for the same three — move to
// steer, wheel for throttle, hold a button to climb or dive. Nothing here
// knows about the game screens; main.js decides which inputs are live when.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    steer: 0,
    pitch: 0,
    throttleUp: false,
    throttleDown: false,
    mouseSteer: 0,
    mouseActive: false,
    mouseClimb: false,
    mouseDive: false,
    wheel: 0,
    clicked: null,
    pressed: null,
  };

  const keyOf = (e) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    input.keys.add(keyOf(e));
    input.pressed = keyOf(e);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(keyOf(e));
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseClimb = false;
    input.mouseDive = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    input.mouseSteer = Math.max(-1, Math.min(1, nx * 1.4));
    input.mouseActive = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.mouseClimb = true;
    if (e.button === 2) input.mouseDive = true;
    const rect = canvas.getBoundingClientRect();
    input.clicked = { x: e.clientX - rect.left, y: e.clientY - rect.top, button: e.button };
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseClimb = false;
    if (e.button === 2) input.mouseDive = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheel += e.deltaY < 0 ? 1 : -1;
  }, { passive: false });

  return input;
}

// Fold the raw keys and mouse into the flight controls for one frame.
// Keyboard wins when it is held; otherwise the mouse steers.
export function readFlightInput(input) {
  const k = input.keys;
  const keySteer = (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0);
  const keyPitch = (k.has('ArrowUp') || k.has(' ') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
  const steer = keySteer !== 0 ? keySteer : (input.mouseActive ? input.mouseSteer : 0);
  const pitch = keyPitch !== 0 ? keyPitch : (input.mouseClimb ? 1 : input.mouseDive ? -1 : 0);
  return {
    steer,
    pitch,
    throttleUp: k.has('w') || input.wheel > 0,
    throttleDown: k.has('s') || input.wheel < 0,
  };
}

export function consumeWheel(input) {
  input.wheel = 0;
}

export function consumeClick(input) {
  const c = input.clicked;
  input.clicked = null;
  return c;
}

export function consumePress(input) {
  const p = input.pressed;
  input.pressed = null;
  return p;
}
