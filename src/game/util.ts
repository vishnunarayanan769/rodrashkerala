export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const sign = (v: number) => (v < 0 ? -1 : 1);

export const easeIn = (a: number, b: number, p: number) => a + (b - a) * Math.pow(p, 2);
export const easeOut = (a: number, b: number, p: number) => a + (b - a) * (1 - Math.pow(1 - p, 2));
export const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

export const percentRemaining = (n: number, total: number) => (n % total) / total;
export const interpolate = (a: number, b: number, p: number) => a + (b - a) * p;

export function weightedPick<T extends { w: number }>(arr: readonly T[]): T {
  let total = 0;
  for (const a of arr) total += a.w;
  let r = Math.random() * total;
  for (const a of arr) {
    r -= a.w;
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function shade(hex: string, amt: number): string {
  // amt -1..1 : darken / lighten
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(clamp(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt), 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
