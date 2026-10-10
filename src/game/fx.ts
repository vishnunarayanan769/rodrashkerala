export type PShape = 'circle' | 'square' | 'line' | 'star' | 'petal' | 'flame';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  shape: PShape;
  rot: number;
  vr: number;
  drag: number;
}

export interface Floater {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  pop: number;
}

const MAX_P = 420;
const MAX_F = 14;

export class Fx {
  parts: Particle[] = [];
  floaters: Floater[] = [];
  private cursor = 0;
  private fcursor = 0;

  constructor() {
    for (let i = 0; i < MAX_P; i++) {
      this.parts.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 1, grow: 0, color: '#fff', shape: 'circle', rot: 0, vr: 0, drag: 0 });
    }
    for (let i = 0; i < MAX_F; i++) {
      this.floaters.push({ active: false, text: '', x: 0, y: 0, vy: 0, life: 0, max: 1, size: 20, color: '#fff', pop: 0 });
    }
  }

  clear() {
    for (const p of this.parts) p.active = false;
    for (const f of this.floaters) f.active = false;
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    shape: PShape = 'circle',
    g = 0,
    grow = 0,
    drag = 0,
  ) {
    const p = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_P;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
    p.shape = shape;
    p.g = g;
    p.grow = grow;
    p.drag = drag;
    p.rot = Math.random() * 6.28;
    p.vr = (Math.random() - 0.5) * 12;
  }

  float(text: string, x: number, y: number, color: string, size = 22) {
    const f = this.floaters[this.fcursor];
    this.fcursor = (this.fcursor + 1) % MAX_F;
    f.active = true;
    f.text = text;
    f.x = x;
    f.y = y;
    f.vy = -46;
    f.life = 1.15;
    f.max = 1.15;
    f.size = size;
    f.color = color;
    f.pop = 1;
  }

  update(dt: number) {
    for (const p of this.parts) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.drag > 0) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
    }
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= 1 - 1.5 * dt;
      f.pop = Math.max(0, f.pop - dt * 5);
    }
  }

  draw(g: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      if (!p.active) continue;
      const t = p.life / p.max;
      const sz = Math.max(0.2, p.size);
      g.globalAlpha = t > 0.5 ? 1 : t * 2;
      g.fillStyle = p.color;
      switch (p.shape) {
        case 'circle':
        case 'flame':
          g.beginPath();
          g.arc(p.x, p.y, sz, 0, 6.283);
          g.fill();
          break;
        case 'square':
          g.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
          break;
        case 'line':
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(1, sz * 0.35);
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
          g.stroke();
          break;
        case 'star': {
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.beginPath();
          for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? sz : sz * 0.42;
            const a = (i / 8) * 6.283;
            g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g.closePath();
          g.fill();
          g.restore();
          break;
        }
        case 'petal':
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.scale(1, Math.abs(Math.sin(p.rot * 0.7)) * 0.8 + 0.25);
          g.beginPath();
          g.ellipse(0, 0, sz, sz * 0.55, 0, 0, 6.283);
          g.fill();
          g.restore();
          break;
      }
    }
    g.globalAlpha = 1;
  }
}
