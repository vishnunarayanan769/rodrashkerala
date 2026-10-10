import { ZONES } from './track';
import type { Zone } from './track';
import { mixHex, rand } from './util';

export interface BgSet {
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  near: HTMLCanvasElement;
}

export const SKY_H = 256;
export const FAR_H = 170;
export const NEAR_H = 120;
const TEX_W = 1024;
const PI = Math.PI;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

// seamless ridge using integer frequencies
function ridge(g: CanvasRenderingContext2D, h: number, baseY: number, amp: number, k1: number, color: string, seed: number) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= TEX_W; x += 8) {
    const t = (x / TEX_W) * PI * 2;
    const y =
      baseY -
      amp * (0.55 * Math.sin(t * k1 + seed) + 0.3 * Math.sin(t * (k1 * 2 + 1) + seed * 2.1) + 0.15 * Math.sin(t * (k1 * 4 + 3) + seed * 3.7));
    g.lineTo(x, y);
  }
  g.lineTo(TEX_W, h);
  g.closePath();
  g.fill();
}

function silPalm(g: CanvasRenderingContext2D, x: number, baseY: number, h: number, color: string, lean: number) {
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = Math.max(2, h * 0.07);
  const tx = x + lean;
  const ty = baseY - h;
  g.beginPath();
  g.moveTo(x, baseY);
  g.quadraticCurveTo(x + lean * 0.1, baseY - h * 0.6, tx, ty);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = -PI + (i / 7) * PI;
    const ex = tx + Math.cos(a) * h * 0.46;
    const ey = ty + Math.sin(a) * h * 0.22 + h * 0.2;
    g.lineWidth = Math.max(1.6, h * 0.05);
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a) * h * 0.26, ty + Math.sin(a) * h * 0.36 - h * 0.04, ex, ey);
    g.stroke();
  }
}

function treeLine(g: CanvasRenderingContext2D, h: number, color: string, density: number, minH: number, maxH: number) {
  g.fillStyle = color;
  // low canopy
  for (let x = -20; x < TEX_W + 20; x += 14) {
    const r = rand(10, 22);
    g.beginPath();
    g.ellipse(x, h - r * 0.45, r * 1.3, r, 0, 0, PI * 2);
    g.fill();
  }
  for (let x = 6; x < TEX_W; x += density) {
    silPalm(g, x + rand(-6, 6), h - 2, rand(minH, maxH), color, rand(-14, 14));
  }
}

function gopuram(g: CanvasRenderingContext2D, cx: number, baseY: number, s: number, color: string) {
  g.fillStyle = color;
  let w = 70 * s;
  let y = baseY;
  for (let i = 0; i < 6; i++) {
    const hh = 12 * s;
    g.fillRect(cx - w / 2, y - hh, w, hh);
    y -= hh;
    w *= 0.82;
  }
  g.beginPath();
  g.moveTo(cx - w / 2, y);
  g.lineTo(cx, y - 16 * s);
  g.lineTo(cx + w / 2, y);
  g.fill();
  g.fillRect(cx - 1, y - 28 * s, 2, 12 * s);
}

function ship(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, boxes: string[]) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - 14 * s);
  g.lineTo(x + 150 * s, y - 14 * s);
  g.lineTo(x + 136 * s, y);
  g.lineTo(x + 14 * s, y);
  g.closePath();
  g.fill();
  for (let i = 0; i < 6; i++) {
    g.fillStyle = boxes[i % boxes.length];
    g.fillRect(x + (12 + i * 20) * s, y - 28 * s, 18 * s, 14 * s);
    g.fillRect(x + (12 + i * 20) * s, y - 42 * s, 18 * s, i % 2 ? 14 * s : 0);
  }
  g.fillStyle = color;
  g.fillRect(x + 130 * s, y - 44 * s, 14 * s, 30 * s);
}

function lighthouse(g: CanvasRenderingContext2D, cx: number, baseY: number, s: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx - 9 * s, baseY);
  g.lineTo(cx + 9 * s, baseY);
  g.lineTo(cx + 5 * s, baseY - 62 * s);
  g.lineTo(cx - 5 * s, baseY - 62 * s);
  g.closePath();
  g.fill();
  g.fillRect(cx - 8 * s, baseY - 68 * s, 16 * s, 6 * s);
  g.beginPath();
  g.moveTo(cx - 6 * s, baseY - 68 * s);
  g.lineTo(cx, baseY - 82 * s);
  g.lineTo(cx + 6 * s, baseY - 68 * s);
  g.fill();
}

function makeSet(z: Zone): BgSet {
  const fog = z.fog;
  // ---------- SKY ----------
  const sky = canvas(TEX_W, SKY_H);
  {
    const g = sky.g;
    const grad = g.createLinearGradient(0, 0, 0, SKY_H);
    grad.addColorStop(0, z.skyTop);
    grad.addColorStop(0.62, z.skyMid);
    grad.addColorStop(1, z.skyBot);
    g.fillStyle = grad;
    g.fillRect(0, 0, TEX_W, SKY_H);
    // sun glow
    const sx = z.bg === 'tea' ? 300 : 700;
    const sy = z.bg === 'town' || z.bg === 'beach' || z.bg === 'harbor' ? SKY_H - 82 : SKY_H - 130;
    const glow = g.createRadialGradient(sx, sy, 6, sx, sy, 150);
    glow.addColorStop(0, z.bg === 'tea' ? 'rgba(255,255,255,0.55)' : 'rgba(255,240,200,0.9)');
    glow.addColorStop(0.25, 'rgba(255,230,170,0.35)');
    glow.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, TEX_W, SKY_H);
    g.fillStyle = z.sun;
    g.globalAlpha = z.bg === 'tea' ? 0.7 : 1;
    g.beginPath();
    g.arc(sx, sy, z.bg === 'tea' ? 22 : 30, 0, PI * 2);
    g.fill();
    g.globalAlpha = 1;
    // clouds
    const nClouds = z.bg === 'tea' ? 11 : 7;
    for (let i = 0; i < nClouds; i++) {
      const cx = rand(0, TEX_W);
      const cy = rand(24, SKY_H - 95);
      const sc = rand(0.8, 1.6);
      const col = z.bg === 'tea' ? 'rgba(235,240,238,0.65)' : z.bg === 'town' ? 'rgba(255,200,190,0.55)' : 'rgba(255,255,255,0.7)';
      g.fillStyle = col;
      for (const off of [-TEX_W, 0, TEX_W]) {
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.ellipse(cx + off + (k - 2.5) * 26 * sc, cy + Math.sin(k * 1.7) * 6 * sc, 30 * sc, (14 + (k % 3) * 4) * sc, 0, 0, PI * 2);
          g.fill();
        }
      }
    }
  }

  // ---------- FAR ----------
  const far = canvas(TEX_W, FAR_H);
  {
    const g = far.g;
    const tint = (c: string, f: number) => mixHex(c, fog, f);
    if (z.bg === 'tea') {
      ridge(g, FAR_H, FAR_H - 70, 62, 2, tint('#6f938f', 0.45), 1.1);
      ridge(g, FAR_H, FAR_H - 50, 54, 3, tint('#5e8a80', 0.35), 2.3);
      ridge(g, FAR_H, FAR_H - 30, 40, 4, tint('#4f7d6d', 0.25), 4.1);
    } else if (z.bg === 'beach') {
      // sea band
      const sg = g.createLinearGradient(0, FAR_H - 62, 0, FAR_H - 20);
      sg.addColorStop(0, '#f6c28e');
      sg.addColorStop(0.35, '#4f9ac9');
      sg.addColorStop(1, '#2f6fa5');
      g.fillStyle = sg;
      g.fillRect(0, FAR_H - 62, TEX_W, 44);
      g.fillStyle = 'rgba(255,240,200,0.55)';
      for (let i = 0; i < 40; i++) g.fillRect(rand(0, TEX_W), FAR_H - 60 + rand(0, 36), rand(6, 24), 1.6);
      ridge(g, FAR_H, FAR_H - 24, 10, 3, tint('#7a9a8a', 0.3), 0.4);
    } else if (z.bg === 'town') {
      ridge(g, FAR_H, FAR_H - 40, 28, 2, tint('#8a4f8f', 0.35), 1.7);
      for (const x of [140, 560, 830]) gopuram(g, x, FAR_H - 36, 1.1, tint('#4a2350', 0.25));
      ridge(g, FAR_H, FAR_H - 22, 18, 4, tint('#5b3a63', 0.3), 3.2);
    } else if (z.bg === 'harbor') {
      ridge(g, FAR_H, FAR_H - 38, 26, 2, tint('#8fa9c9', 0.4), 0.8);
      ship(g, 120, FAR_H - 36, 0.9, tint('#46556b', 0.3), ['#c0504d', '#4f81bd', '#e6b34a']);
      ship(g, 640, FAR_H - 34, 1.1, tint('#3d4b60', 0.3), ['#2a9d8f', '#e07a5f', '#f2cc8f']);
      ridge(g, FAR_H, FAR_H - 18, 12, 5, tint('#6e8aa8', 0.35), 2.0);
    } else {
      ridge(g, FAR_H, FAR_H - 44, 34, 2, tint('#9cc9d8', 0.45), 2.2);
      ridge(g, FAR_H, FAR_H - 24, 18, 4, tint('#7fb6c0', 0.4), 0.9);
    }
  }

  // ---------- NEAR ----------
  const near = canvas(TEX_W, NEAR_H);
  {
    const g = near.g;
    const dark = mixHex(z.bg === 'tea' ? '#1e6b3c' : z.bg === 'beach' ? '#2d6a35' : '#1f5a2e', fog, 0.28);
    if (z.bg === 'tea') {
      ridge(g, NEAR_H, NEAR_H - 28, 30, 3, mixHex('#2f8f4e', fog, 0.2), 0.6);
      // terrace stripes
      g.strokeStyle = 'rgba(160,230,140,0.35)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        for (let x = 0; x <= TEX_W; x += 16) {
          const t = (x / TEX_W) * PI * 2;
          const y = NEAR_H - 18 + i * 3 - 30 * (0.55 * Math.sin(t * 3 + 0.6) + 0.3 * Math.sin(t * 7 + 1.26) + 0.15 * Math.sin(t * 15 + 2.2)) * 0.9 + i * 2;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      treeLine(g, NEAR_H, dark, 70, 34, 54);
    } else if (z.bg === 'beach') {
      lighthouse(g, 300, NEAR_H - 6, 0.9, mixHex('#e8e0d0', fog, 0.25));
      treeLine(g, NEAR_H, dark, 46, 46, 78);
    } else if (z.bg === 'town') {
      treeLine(g, NEAR_H, mixHex('#3a2a3a', fog, 0.25), 52, 40, 70);
      for (let i = 0; i < 38; i++) {
        g.fillStyle = ['#ffd23f', '#ff8a3d', '#ff5d8f', '#fff1a8'][i % 4];
        g.beginPath();
        g.arc(rand(0, TEX_W), NEAR_H - rand(8, 36), 2.1, 0, PI * 2);
        g.fill();
      }
    } else {
      treeLine(g, NEAR_H, dark, z.bg === 'water' ? 34 : 42, 44, 82);
    }
  }

  return { sky: sky.c, far: far.c, near: near.c };
}

export function buildBackgrounds(): BgSet[] {
  return ZONES.map((z) => makeSet(z));
}
