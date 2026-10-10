import { lerp, shade } from './util';

type G = CanvasRenderingContext2D;

export interface Spr {
  c: HTMLCanvasElement;
  w: number;
  h: number;
  ww: number; // world width
}

export const S: Record<string, Spr> = {};

const OUT = '#1d1209';
const PI = Math.PI;
const FONT = 'Bungee, "Arial Black", Impact, sans-serif';

function mk(id: string, w: number, h: number, ww: number, draw: (g: G, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  try {
    draw(g, w, h);
  } catch (err) {
    // a single faulty sprite must never take the whole game down
    console.warn('sprite failed', id, err);
  }
  S[id] = { c, w, h, ww };
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function ell(g: G, x: number, y: number, rx: number, ry: number) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, PI * 2);
}
function circ(g: G, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, PI * 2);
}
function shadow(g: G, cx: number, cy: number, rx: number, ry: number, a = 0.3) {
  g.fillStyle = `rgba(0,0,0,${a})`;
  ell(g, cx, cy, rx, ry);
  g.fill();
}
function fillStroke(g: G, fill: string | CanvasGradient, lw = 2, stroke = OUT) {
  g.fillStyle = fill;
  g.fill();
  if (lw > 0) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}
function poly(g: G, pts: number[]) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}
function fitText(g: G, text: string, cx: number, cy: number, maxW: number, size: number) {
  let s = size;
  g.font = `${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 6) {
    s -= 1;
    g.font = `${s}px ${FONT}`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy);
}

/* ------------------------------------------------------------------ */
/* RIDER (rear view) — shared by the player (live) and rival sprites   */
/* ------------------------------------------------------------------ */

export interface RiderOpts {
  shirt: string;
  shirt2: string;
  bottom: 'mundu' | 'khaki' | 'jeans';
  skin: string;
  hair: string;
  bike: string;
  helmet: string | null;
  band: string | null;
  stick: string | null;
  cop: boolean;
  brake: boolean;
  lean: number;
  armL: number;
  armR: number;
}

export const PLAYER_STYLE: RiderOpts = {
  shirt: '#b3122e',
  shirt2: '#ffd23f',
  bottom: 'mundu',
  skin: '#c68642',
  hair: '#14100c',
  bike: '#ff8a00',
  helmet: null,
  band: '#ffd23f',
  stick: null,
  cop: false,
  brake: false,
  lean: 0,
  armL: 0,
  armR: 0,
};

export const RIVAL_STYLES: Omit<RiderOpts, 'lean' | 'armL' | 'armR'>[] = [
  { shirt: '#2a9d8f', shirt2: '#e9fff9', bottom: 'jeans', skin: '#b87333', hair: '#111', bike: '#1f6f8b', helmet: null, band: null, stick: null, cop: false, brake: false },
  { shirt: '#3a86ff', shirt2: '#ffffff', bottom: 'jeans', skin: '#a8693a', hair: '#161616', bike: '#274690', helmet: '#3a86ff', band: null, stick: null, cop: false, brake: false },
  { shirt: '#7b2cbf', shirt2: '#f1d4ff', bottom: 'mundu', skin: '#c68642', hair: '#0e0e0e', bike: '#5a189a', helmet: null, band: '#ffffff', stick: null, cop: false, brake: false },
  { shirt: '#06a77d', shirt2: '#d6ffe9', bottom: 'jeans', skin: '#9c6233', hair: '#111', bike: '#047857', helmet: '#06a77d', band: null, stick: null, cop: false, brake: false },
  { shirt: '#f2c14e', shirt2: '#5a3b00', bottom: 'mundu', skin: '#c28a55', hair: '#1a120c', bike: '#8f6b00', helmet: null, band: '#d62839', stick: null, cop: false, brake: false },
  { shirt: '#e5383b', shirt2: '#ffe3e3', bottom: 'jeans', skin: '#b5763f', hair: '#0b0b0b', bike: '#9d0208', helmet: '#e5383b', band: null, stick: null, cop: false, brake: false },
  { shirt: '#222831', shirt2: '#00adb5', bottom: 'jeans', skin: '#a9703f', hair: '#0c0c0c', bike: '#393e46', helmet: '#222831', band: null, stick: null, cop: false, brake: false },
  { shirt: '#ff5d8f', shirt2: '#ffffff', bottom: 'mundu', skin: '#c68a5a', hair: '#161616', bike: '#c9184a', helmet: null, band: '#ffffff', stick: null, cop: false, brake: false },
];

export const COP_STYLE: Omit<RiderOpts, 'lean' | 'armL' | 'armR'> = {
  shirt: '#cdb978',
  shirt2: '#3b4a7a',
  bottom: 'khaki',
  skin: '#b87a45',
  hair: '#111',
  bike: '#1b2f6b',
  helmet: '#f4f6fb',
  band: null,
  stick: '#f4f6fb',
  cop: true,
  brake: false,
};

export const RIDER_W = 140;
export const RIDER_H = 170;
export const RIDER_WW = 345;

/** Rider looks used for other human players in a multiplayer room. */
export const MP_STYLES: Omit<RiderOpts, 'lean' | 'armL' | 'armR'>[] = [
  { shirt: '#b3122e', shirt2: '#ffd23f', bottom: 'mundu', skin: '#c68642', hair: '#14100c', bike: '#ff8a00', helmet: null, band: '#ffd23f', stick: null, cop: false, brake: false },
  { shirt: '#0f8b8d', shirt2: '#e9fff9', bottom: 'jeans', skin: '#b87333', hair: '#111', bike: '#1f6f8b', helmet: null, band: null, stick: null, cop: false, brake: false },
  { shirt: '#f2c14e', shirt2: '#5a3b00', bottom: 'mundu', skin: '#c28a55', hair: '#1a120c', bike: '#8f6b00', helmet: null, band: '#d62839', stick: null, cop: false, brake: false },
  { shirt: '#7b2cbf', shirt2: '#f1d4ff', bottom: 'jeans', skin: '#a8693a', hair: '#161616', bike: '#5a189a', helmet: '#7b2cbf', band: null, stick: null, cop: false, brake: false },
  { shirt: '#3a86ff', shirt2: '#ffffff', bottom: 'jeans', skin: '#9c6233', hair: '#111', bike: '#274690', helmet: '#3a86ff', band: null, stick: null, cop: false, brake: false },
  { shirt: '#06a77d', shirt2: '#d6ffe9', bottom: 'mundu', skin: '#c68a5a', hair: '#0e0e0e', bike: '#047857', helmet: null, band: '#ffffff', stick: null, cop: false, brake: false },
  { shirt: '#e5383b', shirt2: '#ffe3e3', bottom: 'jeans', skin: '#b5763f', hair: '#0b0b0b', bike: '#9d0208', helmet: '#e5383b', band: null, stick: null, cop: false, brake: false },
  { shirt: '#222831', shirt2: '#00adb5', bottom: 'jeans', skin: '#a9703f', hair: '#0c0c0c', bike: '#393e46', helmet: '#222831', band: null, stick: null, cop: false, brake: false },
  { shirt: '#ff5d8f', shirt2: '#ffffff', bottom: 'mundu', skin: '#c68642', hair: '#161616', bike: '#c9184a', helmet: null, band: '#ffffff', stick: null, cop: false, brake: false },
  { shirt: '#f1faee', shirt2: '#457b9d', bottom: 'jeans', skin: '#c28a55', hair: '#1a120c', bike: '#2d6a4f', helmet: null, band: '#457b9d', stick: null, cop: false, brake: false },
];

export function drawRider(g: G, o: RiderOpts, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // ground shadow (not rotated)
  shadow(g, 0, -2, 30, 6, 0.32);
  g.rotate(o.lean * 0.24);

  const line = (x1: number, y1: number, x2: number, y2: number, wd: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };

  // exhaust pipes
  for (const sx of [-1, 1]) {
    g.fillStyle = '#b9bec7';
    rr(g, sx * 20 - 4, -32, 8, 28, 3);
    fillStroke(g, '#b9bec7', 1.5);
    g.fillStyle = '#2a2a2e';
    ell(g, sx * 20, -4, 4, 2.5);
    g.fill();
  }
  // rear tyre
  rr(g, -8, -46, 16, 46, 6);
  fillStroke(g, '#17171b', 1.6);
  g.strokeStyle = '#34343c';
  g.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(-7, -5 - i * 7.5);
    g.lineTo(7, -2.5 - i * 7.5);
    g.stroke();
  }
  // rear fender / body
  rr(g, -15, -64, 30, 26, 9);
  fillStroke(g, o.bike, 1.8);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  rr(g, -11, -61, 8, 14, 4);
  g.fill();
  // tail light
  g.fillStyle = o.brake ? '#ff5a4d' : '#b71c1c';
  rr(g, -8, -56, 16, 6, 2);
  g.fill();
  // seat
  rr(g, -17, -88, 34, 28, 11);
  fillStroke(g, '#25232a', 1.8);

  // legs
  const legCol = o.bottom === 'mundu' ? '#fff8e8' : o.bottom === 'khaki' ? '#b5a360' : '#2c4a86';
  for (const sx of [-1, 1]) {
    line(sx * 10, -84, sx * 27, -64, 16.5, OUT);
    line(sx * 27, -64, sx * 22, -35, 13.5, OUT);
    line(sx * 10, -84, sx * 27, -64, 13.5, legCol);
    line(sx * 27, -64, sx * 22, -35, 10.5, legCol);
    g.fillStyle = '#2b2b2f';
    ell(g, sx * 22, -31, 7.5, 4.2);
    fillStroke(g, '#2b2b2f', 1.2);
  }
  if (o.bottom === 'mundu') {
    ell(g, 0, -80, 25, 13);
    fillStroke(g, '#fff8e8', 1.8);
    // kasavu gold border
    g.strokeStyle = '#f0b429';
    g.lineWidth = 3.2;
    g.beginPath();
    g.ellipse(0, -77, 23, 10.5, 0, 0.12 * PI, 0.88 * PI);
    g.stroke();
    g.lineWidth = 1.2;
    g.strokeStyle = '#b8791a';
    g.beginPath();
    g.ellipse(0, -75, 22, 9, 0, 0.14 * PI, 0.86 * PI);
    g.stroke();
  }

  // torso
  poly(g, [-16, -82, 16, -82, 24, -123, -24, -123]);
  fillStroke(g, o.shirt, 1.9);
  // shirt bands
  g.fillStyle = o.shirt2;
  g.fillRect(-18, -101, 36, 5);
  g.fillRect(-20, -111, 40, 3);
  if (o.cop) {
    g.fillStyle = '#d9d9e0';
    g.fillRect(-23, -122, 9, 4);
    g.fillRect(14, -122, 9, 4);
  }

  // arms
  const arm = (side: -1 | 1, e: number) => {
    const shx = side * 21;
    const shy = -117;
    const gx = side * 35;
    const gy = -88;
    const ex0 = side * 40;
    const ey0 = -103;
    const hx = lerp(gx, side * 68, e);
    const hy = lerp(gy, -113, e);
    const ex = lerp(ex0, side * 48, e);
    const ey = lerp(ey0, -117, e);
    line(shx, shy, ex, ey, 12.5, OUT);
    line(ex, ey, hx, hy, 10, OUT);
    line(shx, shy, ex, ey, 9.5, o.shirt);
    line(ex, ey, hx, hy, 7, o.skin);
    g.fillStyle = o.skin;
    circ(g, hx, hy, 5 + e * 3.2);
    fillStroke(g, o.skin, 1.6);
    if (o.stick && e > 0.1) {
      line(hx, hy, hx + side * 20, hy - 30, 7, OUT);
      line(hx, hy, hx + side * 20, hy - 30, 4.5, o.stick);
      line(hx + side * 8, hy - 12, hx + side * 11, hy - 17, 5, '#e0a82e');
    }
  };
  // handlebar
  line(-38, -88, 38, -88, 5, OUT);
  line(-38, -88, 38, -88, 2.8, '#7c7f88');
  for (const sx of [-1, 1]) {
    g.fillStyle = '#9aa0ac';
    ell(g, sx * 43, -98, 5, 7);
    fillStroke(g, '#9aa0ac', 1.4);
  }
  arm(-1, o.armL);
  arm(1, o.armR);

  // head
  line(0, -121, 0, -129, 9, o.skin);
  circ(g, 0, -137, 10.5);
  fillStroke(g, o.hair, 1.8);
  g.fillStyle = o.skin;
  circ(g, -10.5, -135, 2.8);
  g.fill();
  circ(g, 10.5, -135, 2.8);
  g.fill();
  if (o.helmet) {
    g.beginPath();
    g.arc(0, -137, 12.5, PI * 0.92, PI * 2.08);
    g.lineTo(11.5, -131);
    g.lineTo(-11.5, -131);
    g.closePath();
    fillStroke(g, o.helmet, 1.8);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.arc(0, -138, 9, PI * 1.1, PI * 1.55);
    g.lineTo(0, -140);
    g.fill();
    if (o.cop) {
      g.fillStyle = '#2749b8';
      g.fillRect(-12, -141, 24, 4);
    }
  } else if (o.band) {
    g.strokeStyle = o.band;
    g.lineWidth = 3.2;
    g.beginPath();
    g.arc(0, -137, 10.5, PI * 1.02, PI * 1.98);
    g.stroke();
  }
  g.restore();
}

function riderSprite(id: string, base: Omit<RiderOpts, 'lean' | 'armL' | 'armR'>, pose: 0 | 1 | 2) {
  mk(id, RIDER_W, RIDER_H, RIDER_WW, (g) => {
    drawRider(g, { ...base, lean: 0, armL: pose === 1 ? 0.8 : 0, armR: pose === 2 ? 0.8 : 0 }, RIDER_W / 2, RIDER_H - 4, 1);
  });
}

/* ------------------------------------------------------------------ */
/* SCENERY                                                             */
/* ------------------------------------------------------------------ */

function quad(t: number, a: number, b: number, c: number) {
  const m = 1 - t;
  return m * m * a + 2 * m * t * b + t * t * c;
}

function drawPalm(g: G, w: number, h: number, variant: number) {
  shadow(g, w * 0.45, h - 8, 50, 9, 0.28);
  const bx = w * 0.45;
  const by = h - 12;
  const lean = variant ? -34 : 30;
  const tx = bx + lean * 1.1;
  const ty = 158;
  const cx = bx + lean * 1.6;
  const cy = h * 0.58;
  // trunk
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const x = quad(t, bx, cx, tx);
    const y = quad(t, by, cy, ty);
    const dx = 2 * (1 - t) * (cx - bx) + 2 * t * (tx - cx);
    const dy = 2 * (1 - t) * (cy - by) + 2 * t * (ty - cy);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const hw = 11 - 5 * t;
    L.push(x + nx * hw, y + ny * hw);
    R.push(x - nx * hw, y - ny * hw);
  }
  g.beginPath();
  g.moveTo(L[0], L[1]);
  for (let i = 2; i < L.length; i += 2) g.lineTo(L[i], L[i + 1]);
  for (let i = R.length - 2; i >= 0; i -= 2) g.lineTo(R[i], R[i + 1]);
  g.closePath();
  const tg = g.createLinearGradient(bx - 14, 0, bx + 14, 0);
  tg.addColorStop(0, '#a0703d');
  tg.addColorStop(1, '#6e4724');
  fillStroke(g, tg, 2);
  g.strokeStyle = 'rgba(40,22,8,0.55)';
  g.lineWidth = 1.6;
  for (let i = 2; i < 22; i += 1) {
    g.beginPath();
    g.moveTo(L[i * 2], L[i * 2 + 1]);
    g.lineTo(R[i * 2], R[i * 2 + 1] + 2);
    g.stroke();
  }
  // fronds
  const angles = [165, 192, 218, 242, 266, 290, 314, 338, 6, 28];
  const greens = ['#2f8a3a', '#3fae4b', '#2a7a34', '#4cbd54'];
  for (let k = 0; k < angles.length; k++) {
    const a = (angles[k] * PI) / 180;
    const Ln = 92 + (k % 3) * 12;
    const ex = tx + Math.cos(a) * Ln;
    const ey = ty + Math.sin(a) * Ln + 32;
    const mx = tx + Math.cos(a) * Ln * 0.5;
    const my = ty + Math.sin(a) * Ln * 0.5 - 30;
    for (let t = 0.06; t <= 1; t += 0.045) {
      const px = quad(t, tx, mx, ex);
      const py = quad(t, ty, my, ey);
      const dx = 2 * (1 - t) * (mx - tx) + 2 * t * (ex - mx);
      const dy = 2 * (1 - t) * (my - ty) + 2 * t * (ey - my);
      const len = Math.hypot(dx, dy) || 1;
      const Tx = dx / len;
      const Ty = dy / len;
      const Nx = -Ty;
      const Ny = Tx;
      const l = 30 * Math.sin(PI * Math.pow(t, 0.8)) + 6;
      for (const sd of [-1, 1]) {
        g.strokeStyle = greens[(k + (sd > 0 ? 1 : 0) + Math.floor(t * 9)) % 4];
        g.lineWidth = 3.4;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Nx * sd * l * 0.85 + Tx * l * 0.55, py + Ny * sd * l * 0.85 + Ty * l * 0.55 + l * 0.5);
        g.stroke();
      }
    }
    g.strokeStyle = '#276b2c';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(mx, my, ex, ey);
    g.stroke();
  }
  // coconuts
  for (const [ox, oy] of [[-7, 9], [6, 11], [0, 17], [-13, 17]]) {
    circ(g, tx + ox, ty + oy, 7.5);
    fillStroke(g, '#7a8a2c', 1.6);
  }
}

function drawBanana(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 7, 34, 6, 0.28);
  g.fillStyle = '#9fc06f';
  rr(g, w / 2 - 6, h - 64, 12, 56, 4);
  fillStroke(g, '#9fc06f', 1.8);
  const angs = [-78, -52, -26, 0, 26, 52, 78];
  for (let i = 0; i < angs.length; i++) {
    g.save();
    g.translate(w / 2, h - 58);
    g.rotate((angs[i] * PI) / 180);
    ell(g, 0, -46, 15, 54);
    fillStroke(g, i % 2 ? '#4fb243' : '#62c254', 1.8);
    g.strokeStyle = '#2f7d2f';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(0, -4);
    g.lineTo(0, -98);
    g.stroke();
    g.restore();
  }
  // flower & bananas
  ell(g, w / 2 + 12, h - 40, 7, 11);
  fillStroke(g, '#7b1f5a', 1.4);
  g.strokeStyle = '#f2d23a';
  g.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(w / 2 + 2 + i * 4, h - 36, 9, 0.2 * PI, 0.9 * PI);
    g.stroke();
  }
}

function drawHouse(g: G, w: number, h: number, wall: string, roof: string, trim: string, gable: boolean) {
  shadow(g, w / 2, h - 8, w * 0.46, 9, 0.28);
  const gy = h - 12;
  // walls
  g.beginPath();
  g.rect(40, gy - 100, w - 80, 100);
  fillStroke(g, wall, 2.4);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.fillRect(w - 110, gy - 100, 70, 100);
  // base
  g.fillStyle = shade(wall, -0.25);
  g.fillRect(38, gy - 12, w - 76, 12);
  // roof
  if (gable) {
    poly(g, [18, gy - 96, w - 18, gy - 96, w / 2 + 40, gy - 182, w / 2 - 40, gy - 182]);
  } else {
    poly(g, [14, gy - 94, w - 14, gy - 94, w - 52, gy - 168, 52, gy - 168]);
  }
  fillStroke(g, roof, 2.6);
  g.strokeStyle = shade(roof, -0.3);
  g.lineWidth = 1.6;
  const top = gable ? gy - 182 : gy - 168;
  for (let y = top + 8; y < gy - 96; y += 9) {
    g.beginPath();
    g.moveTo(w * 0.1 + (y - top) * 0.2, y);
    g.lineTo(w * 0.9 - (y - top) * 0.2, y);
    g.stroke();
  }
  g.fillStyle = shade(roof, -0.35);
  g.fillRect(gable ? w / 2 - 42 : 50, top - 3, gable ? 84 : w - 100, 6);
  // eave shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(40, gy - 100, w - 80, 8);
  // door
  rr(g, w / 2 - 20, gy - 66, 40, 66, 4);
  fillStroke(g, '#6a3b1c', 2);
  g.strokeStyle = '#3d2210';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(w / 2, gy - 66);
  g.lineTo(w / 2, gy);
  g.stroke();
  // windows
  for (const wx of [62, w - 98]) {
    g.fillStyle = trim;
    g.fillRect(wx - 3, gy - 78, 42, 42);
    g.fillStyle = '#31475a';
    g.fillRect(wx, gy - 75, 36, 36);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(wx + 3, gy - 72, 12, 30);
    g.strokeStyle = trim;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(wx + 18, gy - 75);
    g.lineTo(wx + 18, gy - 39);
    g.stroke();
  }
  // veranda pillars
  g.fillStyle = trim;
  g.fillRect(w / 2 - 44, gy - 98, 6, 98);
  g.fillRect(w / 2 + 38, gy - 98, 6, 98);
}

function drawNet(g: G, w: number, h: number) {
  shadow(g, w * 0.45, h - 8, 120, 10, 0.28);
  // platform
  g.fillStyle = '#5b3b21';
  g.fillRect(50, h - 50, 150, 34);
  g.strokeStyle = OUT;
  g.lineWidth = 2;
  g.strokeRect(50, h - 50, 150, 34);
  g.strokeStyle = '#3a2412';
  for (let x = 62; x < 200; x += 16) {
    g.beginPath();
    g.moveTo(x, h - 50);
    g.lineTo(x, h - 16);
    g.stroke();
  }
  // main booms
  const brace = (x1: number, y1: number, x2: number, y2: number, wd: number) => {
    g.strokeStyle = OUT;
    g.lineWidth = wd + 3;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.strokeStyle = '#8a5a30';
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  brace(90, h - 50, 330, 60, 9);
  brace(150, h - 50, 345, 78, 9);
  brace(210, h - 48, 250, 140, 6);
  brace(70, h - 48, 160, 150, 6);
  // ropes + net
  const tipx = 338;
  const tipy = 70;
  g.strokeStyle = '#3a2f26';
  g.lineWidth = 2;
  const nx1 = 250, nx2 = 400, ny1 = 190, ny2 = 280;
  g.beginPath();
  g.moveTo(tipx, tipy);
  g.lineTo(nx1, ny1);
  g.moveTo(tipx, tipy);
  g.lineTo(nx2, ny1 + 10);
  g.moveTo(tipx, tipy);
  g.lineTo(nx1 + 12, ny2);
  g.moveTo(tipx, tipy);
  g.lineTo(nx2, ny2 - 10);
  g.stroke();
  // mesh
  g.fillStyle = 'rgba(30,30,30,0.18)';
  poly(g, [nx1, ny1, nx2, ny1 + 10, nx2, ny2 - 10, nx1 + 12, ny2]);
  g.fill();
  g.strokeStyle = 'rgba(25,25,25,0.85)';
  g.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.beginPath();
    g.moveTo(lerp(nx1, nx2, t), lerp(ny1, ny1 + 10, t));
    g.lineTo(lerp(nx1 + 12, nx2, t), lerp(ny2, ny2 - 10, t));
    g.moveTo(lerp(nx1, nx1 + 12, t), lerp(ny1, ny2, t));
    g.lineTo(lerp(nx2, nx2, t), lerp(ny1 + 10, ny2 - 10, t));
    g.stroke();
  }
  // counterweights
  for (const [x, y] of [[80, 190], [96, 206], [64, 208]]) {
    ell(g, x, y, 11, 9);
    fillStroke(g, '#6f6f78', 1.6);
  }
  g.strokeStyle = '#3a2f26';
  g.beginPath();
  g.moveTo(90, h - 50);
  g.lineTo(80, 190);
  g.stroke();
}

function drawHouseboat(g: G, w: number, h: number) {
  // canal water
  const wg = g.createLinearGradient(0, h - 50, 0, h);
  wg.addColorStop(0, '#2aa6b8');
  wg.addColorStop(1, '#1b7d9a');
  g.fillStyle = wg;
  ell(g, w / 2, h - 22, w * 0.5, 22);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(40 + i * 70, h - 14 + (i % 2) * 4);
    g.lineTo(70 + i * 70, h - 14 + (i % 2) * 4);
    g.stroke();
  }
  // hull
  g.beginPath();
  g.moveTo(26, h - 70);
  g.lineTo(w - 26, h - 70);
  g.quadraticCurveTo(w - 4, h - 66, w - 14, h - 100);
  g.lineTo(w - 36, h - 36);
  g.lineTo(46, h - 36);
  g.lineTo(18, h - 96);
  g.quadraticCurveTo(10, h - 66, 26, h - 70);
  g.closePath();
  fillStroke(g, '#2a1a12', 2.5);
  g.fillStyle = '#e8b44a';
  g.fillRect(40, h - 62, w - 80, 4);
  // cabin walls
  g.fillStyle = '#d9b774';
  g.fillRect(52, h - 112, w - 104, 44);
  g.strokeStyle = OUT;
  g.lineWidth = 2;
  g.strokeRect(52, h - 112, w - 104, 44);
  g.fillStyle = '#35566a';
  for (let i = 0; i < 5; i++) g.fillRect(64 + i * 60, h - 104, 36, 22);
  // thatch roof (arched)
  g.beginPath();
  g.moveTo(34, h - 108);
  g.quadraticCurveTo(w / 2, h - 214, w - 34, h - 108);
  g.closePath();
  fillStroke(g, '#c99a46', 2.6);
  g.strokeStyle = 'rgba(90,55,12,0.55)';
  g.lineWidth = 1.6;
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const x = lerp(34, w - 34, t);
    g.beginPath();
    g.moveTo(x, h - 108);
    g.quadraticCurveTo(lerp(x, w / 2, 0.15), h - 150 - 40 * Math.sin(t * PI), lerp(x, w / 2, 0.5), h - 108 - 85 * Math.sin(t * PI));
    g.stroke();
  }
  // flag
  g.strokeStyle = OUT;
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(w / 2, h - 160);
  g.lineTo(w / 2, h - 192);
  g.stroke();
  poly(g, [w / 2, h - 192, w / 2 + 26, h - 184, w / 2, h - 176]);
  fillStroke(g, '#e63946', 1.6);
}

function drawTea(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 6, w * 0.45, 7, 0.25);
  const mound = (cx: number, r: number, base: string) => {
    g.beginPath();
    g.ellipse(cx, h - 14, r, r * 0.62, 0, PI, PI * 2);
    g.lineTo(cx + r, h - 12);
    g.lineTo(cx - r, h - 12);
    g.closePath();
    fillStroke(g, base, 2);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * PI + PI;
      const rr2 = Math.random() * r * 0.9;
      g.fillStyle = Math.random() < 0.5 ? '#74d283' : '#2f8f45';
      circ(g, cx + Math.cos(a) * rr2, h - 14 + Math.sin(a) * rr2 * 0.55, 3 + Math.random() * 3);
      g.fill();
    }
  };
  mound(52, 48, '#3aa356');
  mound(120, 56, '#47b362');
  mound(180, 40, '#3aa356');
}

function drawEuca(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 7, 30, 6, 0.28);
  g.strokeStyle = OUT;
  g.lineWidth = 11;
  g.beginPath();
  g.moveTo(w / 2, h - 8);
  g.quadraticCurveTo(w / 2 - 8, h * 0.55, w / 2 + 4, 150);
  g.stroke();
  g.strokeStyle = '#d8d2c0';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(w / 2, h - 8);
  g.quadraticCurveTo(w / 2 - 8, h * 0.55, w / 2 + 4, 150);
  g.stroke();
  const blobs: [number, number, number][] = [
    [w / 2 - 24, 160, 26], [w / 2 + 28, 150, 28], [w / 2, 110, 34], [w / 2 - 28, 92, 26],
    [w / 2 + 26, 78, 28], [w / 2, 54, 30], [w / 2 - 10, 28, 22], [w / 2 + 14, 30, 20],
  ];
  for (let i = 0; i < blobs.length; i++) {
    const [x, y, r] = blobs[i];
    ell(g, x, y, r, r * 0.8);
    fillStroke(g, i % 2 ? '#3d7a5c' : '#4b8f6c', 1.8);
  }
}

function drawElephant(g: G, w: number, h: number) {
  shadow(g, w * 0.5, h - 8, 120, 10, 0.3);
  const gy = h - 14;
  const skin = '#6c6f78';
  // back legs / front legs
  for (const lx of [88, 130, 222, 262]) {
    rr(g, lx - 15, gy - 78, 32, 78, 10);
    fillStroke(g, skin, 2.2);
    g.fillStyle = '#d7cfc0';
    g.fillRect(lx - 12, gy - 6, 26, 6);
  }
  // body
  ell(g, 180, gy - 112, 112, 72);
  fillStroke(g, skin, 2.6);
  // caparison (nettipattom cloth)
  g.beginPath();
  g.moveTo(96, gy - 150);
  g.quadraticCurveTo(180, gy - 218, 272, gy - 150);
  g.lineTo(262, gy - 62);
  g.lineTo(106, gy - 62);
  g.closePath();
  fillStroke(g, '#b01a2b', 2.4);
  g.strokeStyle = '#f4c542';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(106, gy - 64);
  g.lineTo(262, gy - 64);
  g.stroke();
  for (let x = 110; x < 262; x += 12) {
    g.fillStyle = '#f4c542';
    circ(g, x, gy - 58, 4);
    g.fill();
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = '#f4c542';
    circ(g, 130 + i * 24, gy - 118 + (i % 2) * 14, 7);
    g.fill();
    g.fillStyle = '#d62839';
    circ(g, 130 + i * 24, gy - 118 + (i % 2) * 14, 3.5);
    g.fill();
  }
  // head
  g.beginPath();
  ell(g, 62, gy - 128, 44, 48);
  fillStroke(g, skin, 2.6);
  // ear
  g.beginPath();
  g.moveTo(88, gy - 168);
  g.quadraticCurveTo(128, gy - 160, 118, gy - 100);
  g.quadraticCurveTo(92, gy - 112, 84, gy - 140);
  g.closePath();
  fillStroke(g, '#7b7e87', 2.2);
  // trunk
  g.strokeStyle = OUT;
  g.lineWidth = 26;
  g.beginPath();
  g.moveTo(40, gy - 112);
  g.quadraticCurveTo(14, gy - 60, 28, gy - 14);
  g.stroke();
  g.strokeStyle = skin;
  g.lineWidth = 21;
  g.beginPath();
  g.moveTo(40, gy - 112);
  g.quadraticCurveTo(14, gy - 60, 28, gy - 14);
  g.stroke();
  // tusk
  g.strokeStyle = OUT;
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(60, gy - 96);
  g.quadraticCurveTo(70, gy - 60, 48, gy - 48);
  g.stroke();
  g.strokeStyle = '#f7f1df';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(60, gy - 96);
  g.quadraticCurveTo(70, gy - 60, 48, gy - 48);
  g.stroke();
  // golden forehead cap
  g.beginPath();
  g.moveTo(46, gy - 158);
  g.quadraticCurveTo(66, gy - 176, 86, gy - 156);
  g.quadraticCurveTo(66, gy - 112, 46, gy - 158);
  g.closePath();
  fillStroke(g, '#f2b636', 2);
  circ(g, 66, gy - 148, 5);
  fillStroke(g, '#d62839', 1.2);
  // eye
  circ(g, 58, gy - 128, 3);
  g.fillStyle = '#111';
  g.fill();
  // mahout with parasol
  g.fillStyle = '#fff8e8';
  rr(g, 170, gy - 214, 36, 40, 10);
  fillStroke(g, '#fff8e8', 2);
  circ(g, 188, gy - 226, 10);
  fillStroke(g, '#b87333', 2);
  g.strokeStyle = '#d9b44a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(188, gy - 214);
  g.lineTo(188, gy - 262);
  g.stroke();
  g.beginPath();
  g.arc(188, gy - 262, 40, PI, PI * 2);
  g.closePath();
  fillStroke(g, '#e63946', 2.2);
  g.fillStyle = '#ffd166';
  for (let i = -3; i <= 3; i++) {
    circ(g, 188 + i * 12, gy - 262, 4.2);
    g.fill();
  }
}

function drawUmbrella(g: G, w: number, h: number, c1: string, c2: string) {
  shadow(g, w / 2, h - 7, 26, 6, 0.28);
  g.fillStyle = '#d9b44a';
  g.fillRect(w / 2 - 3, 118, 6, h - 124);
  g.strokeStyle = OUT;
  g.lineWidth = 1.6;
  g.strokeRect(w / 2 - 3, 118, 6, h - 124);
  const cx = w / 2;
  const cy = 122;
  const R = 82;
  const n = 8;
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, PI + (i * PI) / n, PI + ((i + 1) * PI) / n);
    g.closePath();
    fillStroke(g, i % 2 ? c2 : c1, 1.8);
  }
  // squash bottom edge with gold fringe
  g.fillStyle = '#f4c542';
  for (let i = 0; i <= 10; i++) {
    const x = cx - R + (i * 2 * R) / 10;
    circ(g, x, cy + 3, 4.8);
    g.fill();
    g.strokeStyle = '#f4c542';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, cy + 3);
    g.lineTo(x, cy + 13);
    g.stroke();
  }
  circ(g, cx, cy - R - 4, 6);
  fillStroke(g, '#f4c542', 1.8);
}

function drawLamp(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 6, 30, 6, 0.28);
  const cx = w / 2;
  const grad = g.createLinearGradient(cx - 20, 0, cx + 20, 0);
  grad.addColorStop(0, '#9a6a12');
  grad.addColorStop(0.5, '#f7d26a');
  grad.addColorStop(1, '#9a6a12');
  poly(g, [cx - 28, h - 10, cx + 28, h - 10, cx + 14, h - 58, cx - 14, h - 58]);
  fillStroke(g, grad, 2);
  g.fillStyle = grad;
  g.fillRect(cx - 5, 70, 10, h - 126);
  // tiers
  for (let i = 0; i < 5; i++) {
    const y = 84 + i * 26;
    const wd = 22 + (4 - i) * 5;
    ell(g, cx, y, wd, 7);
    fillStroke(g, grad, 1.8);
    // flames
    for (const sx of [-1, 1]) {
      const fx = cx + sx * (wd - 6);
      g.fillStyle = '#ff9f1c';
      ell(g, fx, y - 14, 3.6, 7);
      g.fill();
      g.fillStyle = '#fff3b0';
      ell(g, fx, y - 12, 1.6, 3.6);
      g.fill();
    }
  }
  g.fillStyle = '#ff9f1c';
  ell(g, cx, 54, 5, 11);
  g.fill();
  g.fillStyle = '#fff3b0';
  ell(g, cx, 57, 2.2, 5.5);
  g.fill();
}

function drawLighthouse(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 7, 50, 8, 0.28);
  const cx = w / 2;
  const base = h - 14;
  const top = 120;
  poly(g, [cx - 42, base, cx + 42, base, cx + 24, top, cx - 24, top]);
  fillStroke(g, '#f4f1ea', 2.6);
  const bands = 4;
  for (let i = 0; i < bands; i += 2) {
    const y1 = lerp(base, top, i / bands);
    const y2 = lerp(base, top, (i + 1) / bands);
    const x1 = lerp(42, 24, i / bands);
    const x2 = lerp(42, 24, (i + 1) / bands);
    poly(g, [cx - x1, y1, cx + x1, y1, cx + x2, y2, cx - x2, y2]);
    g.fillStyle = '#d62839';
    g.fill();
  }
  poly(g, [cx - 42, base, cx + 42, base, cx + 24, top, cx - 24, top]);
  g.strokeStyle = OUT;
  g.lineWidth = 2.6;
  g.stroke();
  // gallery
  g.fillStyle = '#2b2f3a';
  g.fillRect(cx - 36, top - 8, 72, 10);
  // lantern
  g.fillStyle = '#ffe9a0';
  g.fillRect(cx - 18, top - 46, 36, 38);
  g.strokeStyle = OUT;
  g.lineWidth = 2;
  g.strokeRect(cx - 18, top - 46, 36, 38);
  g.beginPath();
  g.moveTo(cx - 24, top - 46);
  g.lineTo(cx + 24, top - 46);
  g.lineTo(cx, top - 82);
  g.closePath();
  fillStroke(g, '#d62839', 2.2);
  g.strokeStyle = '#8a6a12';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx, top - 46);
  g.lineTo(cx, top - 8);
  g.stroke();
}

function drawBeachUmb(g: G, w: number, h: number, c1: string, c2: string) {
  shadow(g, w / 2, h - 8, 54, 8, 0.25);
  g.strokeStyle = OUT;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(w / 2, h - 10);
  g.lineTo(w / 2 + 6, 56);
  g.stroke();
  g.strokeStyle = '#e8e0cc';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(w / 2, h - 10);
  g.lineTo(w / 2 + 6, 56);
  g.stroke();
  const cx = w / 2 + 6;
  const cy = 62;
  const R = 82;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(cx, cy - 22);
    g.ellipse(cx, cy, R, 38, 0, PI + (i * PI) / 6, PI + ((i + 1) * PI) / 6);
    g.closePath();
    fillStroke(g, i % 2 ? c2 : c1, 1.8);
  }
  // lounge chair
  g.fillStyle = '#f7f1df';
  rr(g, w / 2 - 58, h - 44, 46, 14, 4);
  fillStroke(g, '#f7f1df', 1.8);
}

function drawBoat(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 8, 140, 9, 0.28);
  g.beginPath();
  g.moveTo(14, h - 70);
  g.quadraticCurveTo(w / 2, h - 18, w - 8, h - 82);
  g.lineTo(w - 36, h - 32);
  g.quadraticCurveTo(w / 2, h - 6, 40, h - 30);
  g.closePath();
  fillStroke(g, '#2f6fb2', 2.6);
  g.beginPath();
  g.moveTo(24, h - 62);
  g.quadraticCurveTo(w / 2, h - 12, w - 14, h - 72);
  g.lineTo(w - 18, h - 62);
  g.quadraticCurveTo(w / 2, h - 2, 30, h - 54);
  g.closePath();
  g.fillStyle = '#f2f2ee';
  g.fill();
  g.strokeStyle = '#e63946';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(40, h - 48);
  g.quadraticCurveTo(w / 2, h - 2, w - 40, h - 52);
  g.stroke();
  // mast + sail
  g.strokeStyle = OUT;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(w * 0.45, h - 56);
  g.lineTo(w * 0.45, 18);
  g.stroke();
  g.strokeStyle = '#8a5a30';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(w * 0.45, h - 56);
  g.lineTo(w * 0.45, 18);
  g.stroke();
  poly(g, [w * 0.45 + 3, 26, w * 0.45 + 70, h - 66, w * 0.45 + 3, h - 66]);
  fillStroke(g, '#fff0cf', 2);
}

function drawSign(g: G, w: number, h: number, kind: number) {
  shadow(g, w / 2, h - 6, 22, 5, 0.28);
  g.fillStyle = '#80848c';
  g.fillRect(w / 2 - 3, 56, 6, h - 62);
  g.strokeStyle = OUT;
  g.lineWidth = 1.6;
  g.strokeRect(w / 2 - 3, 56, 6, h - 62);
  if (kind === 0) {
    poly(g, [w / 2, 6, w / 2 + 40, 70, w / 2 - 40, 70]);
    fillStroke(g, '#f7f7f2', 3.5, '#d62839');
    g.strokeStyle = '#111';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w / 2 - 12, 62);
    g.bezierCurveTo(w / 2 + 14, 52, w / 2 - 14, 36, w / 2 + 4, 24);
    g.stroke();
  } else {
    circ(g, w / 2, 40, 34);
    fillStroke(g, '#1f6fd1', 3, '#ffffff');
    g.fillStyle = '#fff';
    fitText(g, '60', w / 2, 41, 40, 26);
  }
}

function drawBillboard(g: G, w: number, h: number, bg: string, fg: string, l1: string, l2: string) {
  shadow(g, w / 2, h - 6, w * 0.4, 6, 0.25);
  g.fillStyle = '#4b4b52';
  g.fillRect(50, 100, 10, h - 104);
  g.fillRect(w - 60, 100, 10, h - 104);
  rr(g, 12, 14, w - 24, 112, 8);
  fillStroke(g, bg, 4, '#2b2b30');
  g.strokeStyle = fg;
  g.lineWidth = 2.5;
  rr(g, 20, 22, w - 40, 96, 5);
  g.stroke();
  g.fillStyle = fg;
  fitText(g, l1, w / 2, 56, w - 64, 30);
  g.fillStyle = '#ffffff';
  fitText(g, l2, w / 2, 92, w - 64, 20);
}

function drawChaya(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 7, w * 0.42, 7, 0.28);
  g.fillStyle = '#7a4a28';
  g.fillRect(30, 80, 8, h - 90);
  g.fillRect(w - 38, 80, 8, h - 90);
  // counter
  rr(g, 38, h - 62, w - 76, 50, 4);
  fillStroke(g, '#9b6437', 2.2);
  g.fillStyle = '#d9d2c0';
  g.fillRect(50, h - 76, w - 100, 14);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = 'rgba(255,255,255,0.7)';
    rr(g, 58 + i * 28, h - 92, 9, 14, 2);
    g.fill();
  }
  // banana bunches hanging
  g.strokeStyle = '#f2d23a';
  g.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(70 + i * 56, 100, 12, 0.1 * PI, 0.9 * PI);
    g.stroke();
  }
  // tin roof
  poly(g, [10, 84, w - 10, 84, w - 36, 28, 36, 28]);
  fillStroke(g, '#4f8fb3', 2.6);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1.6;
  for (let x = 30; x < w - 20; x += 14) {
    g.beginPath();
    g.moveTo(x, 84);
    g.lineTo(x + (w / 2 - x) * 0.18, 30);
    g.stroke();
  }
  rr(g, w / 2 - 44, 38, 88, 24, 4);
  fillStroke(g, '#fff6d6', 2);
  g.fillStyle = '#b3261e';
  fitText(g, 'CHAYA', w / 2, 51, 76, 18);
}

function drawFlags(g: G, w: number, h: number) {
  shadow(g, w / 2, h - 6, 16, 4, 0.25);
  g.strokeStyle = OUT;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(w / 2, h - 8);
  g.lineTo(w / 2, 14);
  g.stroke();
  g.strokeStyle = '#d9d9de';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(w / 2, h - 8);
  g.lineTo(w / 2, 14);
  g.stroke();
  const cols = ['#e63946', '#ffd23f', '#06a77d', '#3a86ff', '#ff8a00', '#ff5d8f'];
  for (let i = 0; i < 6; i++) {
    const y = 24 + i * 24;
    poly(g, [w / 2 + 2, y, w - 6, y + 10, w / 2 + 2, y + 22]);
    fillStroke(g, cols[i], 1.6);
  }
}

/* ------------------------------------------------------------------ */
/* VEHICLES                                                            */
/* ------------------------------------------------------------------ */

function drawBus(g: G, front: boolean, body: string, stripe: string) {
  const w = 200;
  shadow(g, 100, 194, 94, 8, 0.38);
  g.fillStyle = '#141416';
  rr(g, 16, 174, 30, 24, 5);
  g.fill();
  rr(g, 154, 174, 30, 24, 5);
  g.fill();
  const grad = g.createLinearGradient(0, 20, 0, 184);
  grad.addColorStop(0, shade(body, 0.18));
  grad.addColorStop(1, shade(body, -0.22));
  rr(g, 12, 22, 176, 158, 12);
  fillStroke(g, grad, 2.8);
  g.fillStyle = '#f1f1ee';
  rr(g, 12, 22, 176, 15, 9);
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = stripe;
  g.fillRect(14, 126, 172, 12);
  g.fillStyle = shade(stripe, 0.4);
  g.fillRect(14, 141, 172, 3);
  if (!front) {
    rr(g, 28, 44, 144, 56, 8);
    fillStroke(g, '#233038', 2.2);
    g.fillStyle = '#101b22';
    for (let i = 0; i < 6; i++) {
      circ(g, 46 + i * 21, 92, 8);
      g.fill();
      rr(g, 38 + i * 21, 96, 16, 6, 3);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.14)';
    poly(g, [36, 46, 70, 46, 48, 98, 34, 98]);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `22px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('KSRTC', w / 2, 118);
    g.fillStyle = '#ff2d2d';
    rr(g, 20, 148, 24, 16, 4);
    fillStroke(g, '#ff2d2d', 1.6);
    rr(g, 156, 148, 24, 16, 4);
    fillStroke(g, '#ff2d2d', 1.6);
    g.fillStyle = '#ffb300';
    circ(g, 52, 156, 4);
    g.fill();
    circ(g, 148, 156, 4);
    g.fill();
    rr(g, 80, 150, 40, 16, 3);
    fillStroke(g, '#f5f5ee', 1.6);
    g.fillStyle = '#111';
    g.font = `10px ${FONT}`;
    g.fillText('KL 15', w / 2, 158);
  } else {
    // destination board
    rr(g, 56, 38, 88, 16, 3);
    fillStroke(g, '#111', 1.6);
    g.fillStyle = '#ffb300';
    g.font = `11px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ERNAKULAM', w / 2, 46.5);
    rr(g, 26, 58, 148, 64, 8);
    fillStroke(g, '#2b3d46', 2.2);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    poly(g, [34, 60, 76, 60, 50, 120, 32, 120]);
    g.fill();
    g.fillStyle = '#fff6c2';
    circ(g, 38, 154, 10);
    fillStroke(g, '#fff6c2', 2);
    circ(g, 162, 154, 10);
    fillStroke(g, '#fff6c2', 2);
    rr(g, 62, 146, 76, 22, 4);
    fillStroke(g, '#222', 1.8);
    g.strokeStyle = '#777';
    g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(68, 151 + i * 4.5);
      g.lineTo(132, 151 + i * 4.5);
      g.stroke();
    }
    g.fillStyle = '#d7d7d7';
    rr(g, 12, 170, 176, 10, 3);
    g.fill();
  }
}

function drawCar(g: G, front: boolean, body: string, cab: string) {
  const w = 160;
  shadow(g, 80, 123, 76, 6, 0.38);
  g.fillStyle = '#141416';
  rr(g, 12, 104, 26, 20, 5);
  g.fill();
  rr(g, 122, 104, 26, 20, 5);
  g.fill();
  rr(g, 8, 52, 144, 62, 14);
  fillStroke(g, body, 2.6);
  rr(g, 26, 14, 108, 52, 18);
  fillStroke(g, cab, 2.6);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  rr(g, 30, 17, 100, 8, 4);
  g.fill();
  if (!front) {
    rr(g, 36, 22, 88, 32, 9);
    fillStroke(g, '#25343f', 2);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    poly(g, [42, 24, 66, 24, 52, 52, 40, 52]);
    g.fill();
    g.fillStyle = '#ff2d2d';
    rr(g, 12, 66, 26, 14, 4);
    fillStroke(g, '#ff2d2d', 1.6);
    rr(g, 122, 66, 26, 14, 4);
    fillStroke(g, '#ff2d2d', 1.6);
    rr(g, 58, 84, 44, 16, 3);
    fillStroke(g, '#f5f5ee', 1.6);
    g.fillStyle = '#111';
    g.font = `10px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('KL 07', w / 2, 92.5);
  } else {
    rr(g, 34, 20, 92, 36, 9);
    fillStroke(g, '#2b3d4a', 2);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    poly(g, [40, 22, 70, 22, 54, 54, 38, 54]);
    g.fill();
    g.fillStyle = '#fff6c2';
    circ(g, 28, 72, 9);
    fillStroke(g, '#fff6c2', 2);
    circ(g, 132, 72, 9);
    fillStroke(g, '#fff6c2', 2);
    rr(g, 50, 66, 60, 20, 4);
    fillStroke(g, '#bfc4cc', 1.8);
    g.strokeStyle = '#555';
    g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(54 + i * 11, 68);
      g.lineTo(54 + i * 11, 84);
      g.stroke();
    }
  }
  g.fillStyle = '#c9ced6';
  rr(g, 6, 104, 148, 8, 3);
  g.fill();
}

function drawAuto(g: G, front: boolean, canopy: string) {
  const w = 120;
  shadow(g, 60, 135, 52, 6, 0.38);
  // wheel(s)
  g.fillStyle = '#141416';
  if (!front) {
    rr(g, 42, 104, 36, 34, 7);
    g.fill();
  } else {
    rr(g, 48, 108, 24, 30, 6);
    g.fill();
  }
  // body
  rr(g, 18, 56, 84, 58, 10);
  fillStroke(g, '#1d1d22', 2.4);
  // canopy
  g.beginPath();
  g.moveTo(14, 62);
  g.quadraticCurveTo(14, 8, 60, 8);
  g.quadraticCurveTo(106, 8, 106, 62);
  g.closePath();
  fillStroke(g, canopy, 2.6);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  rr(g, 28, 14, 40, 6, 3);
  g.fill();
  if (!front) {
    rr(g, 30, 24, 60, 28, 8);
    fillStroke(g, '#25343f', 2);
    g.fillStyle = '#ff2d2d';
    rr(g, 22, 72, 14, 10, 3);
    fillStroke(g, '#ff2d2d', 1.5);
    rr(g, 84, 72, 14, 10, 3);
    fillStroke(g, '#ff2d2d', 1.5);
    rr(g, 46, 90, 28, 12, 3);
    fillStroke(g, '#f5f5ee', 1.5);
    g.fillStyle = '#111';
    g.font = `8px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('KL 01', w / 2, 96.5);
  } else {
    rr(g, 28, 22, 64, 34, 8);
    fillStroke(g, '#2b3d4a', 2);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    poly(g, [32, 24, 52, 24, 40, 54, 30, 54]);
    g.fill();
    g.fillStyle = '#fff6c2';
    circ(g, 60, 78, 8);
    fillStroke(g, '#fff6c2', 2);
    g.fillStyle = '#c9ced6';
    rr(g, 34, 100, 52, 6, 3);
    g.fill();
  }
}

function drawLorry(g: G, front: boolean, box: string, accent: string) {
  const w = 200;
  shadow(g, 100, 202, 96, 8, 0.4);
  g.fillStyle = '#141416';
  rr(g, 14, 176, 36, 32, 6);
  g.fill();
  rr(g, 150, 176, 36, 32, 6);
  g.fill();
  if (!front) {
    rr(g, 10, 8, 180, 160, 8);
    fillStroke(g, box, 2.8);
    // painted decoration
    g.strokeStyle = accent;
    g.lineWidth = 5;
    rr(g, 20, 18, 160, 112, 6);
    g.stroke();
    g.fillStyle = accent;
    for (let i = 0; i < 8; i++) {
      circ(g, 34 + i * 19, 74, 6);
      g.fill();
    }
    g.fillStyle = shade(box, 0.4);
    g.beginPath();
    g.moveTo(100, 30);
    g.lineTo(122, 66);
    g.lineTo(100, 100);
    g.lineTo(78, 66);
    g.closePath();
    g.fill();
    g.fillStyle = accent;
    g.fillRect(14, 132, 172, 8);
    rr(g, 20, 142, 160, 24, 3);
    fillStroke(g, '#1f1f24', 1.8);
    g.fillStyle = '#ffd23f';
    fitText(g, 'HORN OK PLEASE', w / 2, 154, 148, 14);
    g.fillStyle = '#18181c';
    rr(g, 6, 166, 188, 12, 3);
    g.fill();
    g.fillStyle = '#ff2d2d';
    rr(g, 14, 168, 22, 9, 3);
    g.fill();
    rr(g, 164, 168, 22, 9, 3);
    g.fill();
    rr(g, 82, 168, 36, 9, 2);
    g.fillStyle = '#f5f5ee';
    g.fill();
  } else {
    // cargo box peeking above the cab
    rr(g, 16, 2, 168, 44, 6);
    fillStroke(g, box, 2.6);
    rr(g, 22, 40, 156, 130, 12);
    fillStroke(g, accent, 2.8);
    rr(g, 34, 52, 132, 56, 8);
    fillStroke(g, '#2b3d46', 2.2);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    poly(g, [40, 54, 84, 54, 56, 106, 38, 106]);
    g.fill();
    g.fillStyle = '#ffd23f';
    rr(g, 62, 36, 76, 12, 3);
    g.fill();
    g.fillStyle = '#111';
    fitText(g, 'NATIONAL PERMIT', w / 2, 42.5, 70, 8);
    g.fillStyle = '#fff6c2';
    circ(g, 40, 140, 11);
    fillStroke(g, '#fff6c2', 2);
    circ(g, 160, 140, 11);
    fillStroke(g, '#fff6c2', 2);
    rr(g, 62, 122, 76, 34, 5);
    fillStroke(g, '#2a2a30', 2);
    g.strokeStyle = '#8b8f98';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(68, 128 + i * 6);
      g.lineTo(132, 128 + i * 6);
      g.stroke();
    }
    g.fillStyle = '#18181c';
    rr(g, 8, 166, 184, 14, 3);
    g.fill();
  }
}

function drawMotoFront(g: G, o: Omit<RiderOpts, 'lean' | 'armL' | 'armR'>) {
  const cx = RIDER_W / 2;
  const gy = RIDER_H - 4;
  shadow(g, cx, gy - 2, 30, 6, 0.32);
  // front tyre
  rr(g, cx - 7, gy - 50, 14, 50, 6);
  fillStroke(g, '#17171b', 1.6);
  // fork + fender
  rr(g, cx - 12, gy - 70, 24, 22, 8);
  fillStroke(g, o.bike, 1.8);
  g.strokeStyle = '#9aa0ac';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(cx - 8, gy - 68);
  g.lineTo(cx - 8, gy - 92);
  g.moveTo(cx + 8, gy - 68);
  g.lineTo(cx + 8, gy - 92);
  g.stroke();
  // legs
  const legCol = o.bottom === 'mundu' ? '#fff8e8' : '#2c4a86';
  for (const sx of [-1, 1]) {
    g.strokeStyle = OUT;
    g.lineWidth = 15;
    g.beginPath();
    g.moveTo(cx + sx * 12, gy - 82);
    g.lineTo(cx + sx * 20, gy - 50);
    g.stroke();
    g.strokeStyle = legCol;
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(cx + sx * 12, gy - 82);
    g.lineTo(cx + sx * 20, gy - 50);
    g.stroke();
  }
  // headlight fairing
  g.beginPath();
  g.ellipse(cx, gy - 100, 17, 16, 0, 0, PI * 2);
  fillStroke(g, o.bike, 2);
  circ(g, cx, gy - 100, 9);
  fillStroke(g, '#fff6c2', 1.8);
  // torso (front)
  poly(g, [cx - 16, gy - 114, cx + 16, gy - 114, cx + 23, gy - 140, cx - 23, gy - 140]);
  fillStroke(g, o.shirt, 1.9);
  // handlebar
  g.strokeStyle = OUT;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(cx - 40, gy - 116);
  g.lineTo(cx + 40, gy - 116);
  g.stroke();
  // arms
  for (const sx of [-1, 1]) {
    g.strokeStyle = OUT;
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(cx + sx * 21, gy - 136);
    g.lineTo(cx + sx * 38, gy - 116);
    g.stroke();
    g.strokeStyle = o.shirt;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(cx + sx * 21, gy - 136);
    g.lineTo(cx + sx * 38, gy - 116);
    g.stroke();
  }
  // head
  circ(g, cx, gy - 152, 11);
  fillStroke(g, o.skin, 1.8);
  g.beginPath();
  g.arc(cx, gy - 154, 12.5, PI * 0.95, PI * 2.05);
  g.closePath();
  fillStroke(g, o.helmet || '#33353d', 1.8);
  g.fillStyle = '#111';
  g.fillRect(cx - 6, gy - 152, 3, 3);
  g.fillRect(cx + 3, gy - 152, 3, 3);
}

/* ------------------------------------------------------------------ */
/* PICKUPS                                                             */
/* ------------------------------------------------------------------ */

function drawPickups() {
  mk('pk_rupee', 130, 130, 340, (g) => {
    shadow(g, 65, 116, 38, 7, 0.3);
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translate(65, 82 - i * 12);
      g.rotate(-0.08 + i * 0.07);
      rr(g, -42, -22, 84, 44, 6);
      fillStroke(g, i === 2 ? '#7bd88f' : '#4caf6a', 2.2);
      g.restore();
    }
    g.fillStyle = '#ffe08a';
    circ(g, 65, 58, 15);
    fillStroke(g, '#ffe08a', 2, '#9a6a12');
    g.fillStyle = '#7a4a00';
    g.font = `bold 20px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('₹', 65, 59);
  });
  mk('pk_coconut', 130, 130, 300, (g) => {
    shadow(g, 65, 118, 34, 7, 0.3);
    g.beginPath();
    g.ellipse(65, 74, 38, 42, 0, 0, PI * 2);
    const gr = g.createRadialGradient(52, 56, 6, 65, 74, 46);
    gr.addColorStop(0, '#c9ee79');
    gr.addColorStop(1, '#5d9a2a');
    fillStroke(g, gr, 2.4);
    g.fillStyle = '#f3f0d8';
    ell(g, 65, 36, 16, 9);
    fillStroke(g, '#f3f0d8', 2);
    // straw
    g.strokeStyle = OUT;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(68, 36);
    g.lineTo(88, 6);
    g.stroke();
    g.strokeStyle = '#ff4d6d';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(68, 36);
    g.lineTo(88, 6);
    g.stroke();
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.setLineDash([5, 6]);
    g.beginPath();
    g.moveTo(68, 36);
    g.lineTo(88, 6);
    g.stroke();
    g.setLineDash([]);
  });
  mk('pk_banana', 130, 130, 320, (g) => {
    shadow(g, 65, 118, 38, 7, 0.3);
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = OUT;
      g.lineWidth = 17;
      g.beginPath();
      g.arc(36 + i * 14, 52, 46, 0.12 * PI, 0.82 * PI);
      g.stroke();
      g.strokeStyle = i % 2 ? '#f7d23a' : '#ffe35a';
      g.lineWidth = 13;
      g.beginPath();
      g.arc(36 + i * 14, 52, 46, 0.12 * PI, 0.82 * PI);
      g.stroke();
    }
    g.fillStyle = '#6b4a1b';
    circ(g, 50, 100, 5);
    g.fill();
  });
  mk('pk_stick', 130, 130, 320, (g) => {
    shadow(g, 65, 118, 38, 7, 0.3);
    for (const a of [-0.6, 0.6]) {
      g.save();
      g.translate(65, 112);
      g.rotate(a);
      g.strokeStyle = OUT;
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -96);
      g.stroke();
      g.strokeStyle = '#a8662a';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -96);
      g.stroke();
      g.strokeStyle = '#f4c542';
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(0, -40);
      g.lineTo(0, -48);
      g.stroke();
      circ(g, 0, -96, 7);
      fillStroke(g, '#c47a35', 2);
      g.restore();
    }
  });
}

/* ------------------------------------------------------------------ */

let built = false;
export function buildSprites() {
  if (built) return;
  built = true;

  // scenery
  mk('palm', 256, 560, 900, (g, w, h) => drawPalm(g, w, h, 0));
  mk('palm2', 256, 560, 900, (g, w, h) => drawPalm(g, w, h, 1));
  mk('banana', 170, 210, 520, drawBanana);
  mk('house', 320, 230, 1500, (g, w, h) => drawHouse(g, w, h, '#f3e0b0', '#bb4a22', '#fff8e8', false));
  mk('house2', 320, 240, 1450, (g, w, h) => drawHouse(g, w, h, '#7ec8bd', '#a63d1c', '#fff8e8', true));
  mk('net', 440, 360, 2200, drawNet);
  mk('houseboat', 420, 230, 1800, drawHouseboat);
  mk('tea', 230, 110, 600, drawTea);
  mk('euca', 150, 440, 640, drawEuca);
  mk('elephant', 330, 300, 1300, drawElephant);
  mk('umbrella', 180, 290, 540, (g, w, h) => drawUmbrella(g, w, h, '#d62839', '#ffd166'));
  mk('umbrella2', 180, 290, 540, (g, w, h) => drawUmbrella(g, w, h, '#118ab2', '#ffd166'));
  mk('umbrella3', 180, 290, 540, (g, w, h) => drawUmbrella(g, w, h, '#06a77d', '#f4a261'));
  mk('lamp', 130, 300, 360, drawLamp);
  mk('lighthouse', 150, 560, 620, drawLighthouse);
  mk('beachumb', 200, 200, 560, (g, w, h) => drawBeachUmb(g, w, h, '#e63946', '#ffffff'));
  mk('boat', 340, 140, 1100, drawBoat);
  mk('sign', 120, 190, 330, (g, w, h) => drawSign(g, w, h, Math.random() < 0.5 ? 0 : 1));
  mk('bill1', 300, 230, 1100, (g, w, h) => drawBillboard(g, w, h, '#0f6b3f', '#ffd23f', "GOD'S OWN", 'COUNTRY'));
  mk('bill2', 300, 230, 1100, (g, w, h) => drawBillboard(g, w, h, '#118a8a', '#fff1a8', 'HOUSEBOAT', 'CRUISE • BOOK NOW'));
  mk('bill3', 300, 230, 1100, (g, w, h) => drawBillboard(g, w, h, '#b3261e', '#ffe08a', 'MALABAR HOTEL', 'MEALS READY'));
  mk('chaya', 260, 190, 900, drawChaya);
  mk('flags', 120, 260, 380, drawFlags);

  // vehicles
  mk('bus_r', 200, 200, 360, (g) => drawBus(g, false, '#c62828', '#ffb300'));
  mk('bus_f', 200, 200, 360, (g) => drawBus(g, true, '#c62828', '#ffb300'));
  mk('bus2_r', 200, 200, 360, (g) => drawBus(g, false, '#1565c0', '#ffffff'));
  mk('bus2_f', 200, 200, 360, (g) => drawBus(g, true, '#1565c0', '#ffffff'));
  const cars: [string, string][] = [
    ['#1b1b1f', '#f7c600'],
    ['#f1f1ee', '#e4e4e0'],
    ['#8e1b2c', '#8e1b2c'],
    ['#2b5fa8', '#2b5fa8'],
  ];
  cars.forEach(([b, c], i) => {
    mk(`car_r${i}`, 160, 128, 320, (g) => drawCar(g, false, b, c));
    mk(`car_f${i}`, 160, 128, 320, (g) => drawCar(g, true, b, c));
  });
  mk('auto_r', 120, 140, 230, (g) => drawAuto(g, false, '#ffd400'));
  mk('auto_f', 120, 140, 230, (g) => drawAuto(g, true, '#ffd400'));
  mk('auto2_r', 120, 140, 230, (g) => drawAuto(g, false, '#2e9e5b'));
  mk('auto2_f', 120, 140, 230, (g) => drawAuto(g, true, '#2e9e5b'));
  const lorries: [string, string][] = [
    ['#2f7fd1', '#ffcf33'],
    ['#ef7d1a', '#2a9d8f'],
    ['#3c9d4a', '#e63946'],
  ];
  lorries.forEach(([b, a], i) => {
    mk(`lorry_r${i}`, 200, 210, 360, (g) => drawLorry(g, false, b, a));
    mk(`lorry_f${i}`, 200, 210, 360, (g) => drawLorry(g, true, b, a));
  });

  // riders
  const motoStyles = [
    { ...RIVAL_STYLES[1], shirt: '#8d99ae', shirt2: '#edf2f4', helmet: '#e63946', bike: '#3a3f4c' },
    { ...RIVAL_STYLES[3], shirt: '#fcbf49', shirt2: '#3d405b', helmet: '#222', bike: '#6c757d' },
    { ...RIVAL_STYLES[2], shirt: '#f1faee', shirt2: '#457b9d', bottom: 'mundu' as const, helmet: null, bike: '#2d6a4f' },
  ];
  motoStyles.forEach((m, i) => {
    riderSprite(`moto_r${i}`, m, 0);
    mk(`moto_f${i}`, RIDER_W, RIDER_H, RIDER_WW, (g) => drawMotoFront(g, m));
  });
  RIVAL_STYLES.forEach((st, i) => {
    riderSprite(`rival${i}_0`, st, 0);
    riderSprite(`rival${i}_1`, st, 1);
    riderSprite(`rival${i}_2`, st, 2);
  });
  riderSprite('cop_0', COP_STYLE, 0);
  riderSprite('cop_1', COP_STYLE, 1);
  riderSprite('cop_2', COP_STYLE, 2);

  // multiplayer riders (one look per bike colour)
  MP_STYLES.forEach((st, i) => {
    riderSprite(`mp_${i}_0`, st, 0);
    riderSprite(`mp_${i}_1`, st, 1);
    riderSprite(`mp_${i}_2`, st, 2);
  });

  drawPickups();
}
