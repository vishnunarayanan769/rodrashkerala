import type { Pt, Segment, SceneSprite } from './types';
import { easeIn, easeInOut, mixHex } from './util';

/* Deterministic RNG so a multiplayer room can share one identical road. */
let R: () => number = Math.random;
export function setTrackSeed(seed: number) {
  let s = seed >>> 0;
  R = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clearTrackSeed() {
  R = Math.random;
}
const rand = (a: number, b: number) => a + R() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
function wpick<T extends { w: number }>(arr: readonly T[]): T {
  let total = 0;
  for (const a of arr) total += a.w;
  let r = R() * total;
  for (const a of arr) {
    r -= a.w;
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
}

export const SEG_LEN = 200;
export const ROAD_W = 750; // half road width in world units
export const RUMBLE_LEN = 3;
export const LANES = 4;
export const FOG_LEVELS = 16;

export interface SceneDef {
  id: string;
  w: number;
  min: number;
  max: number;
  solid?: boolean;
  hit?: number;
  s?: [number, number];
}

export type BgKind = 'harbor' | 'water' | 'tea' | 'town' | 'beach';

export interface Zone {
  id: string;
  name: string;
  tagline: string;
  len: number;
  skyTop: string;
  skyMid: string;
  skyBot: string;
  fog: string;
  sun: string;
  accent: string;
  road: [string, string];
  grass: [string, string];
  rumble: [string, string];
  lane: string;
  scenery: SceneDef[];
  curve: number;
  hill: number;
  gap: number;
  oncoming: number;
  rain: boolean;
  bg: BgKind;
}

export const ZONES: Zone[] = [
  {
    id: 'kochi',
    name: 'FORT KOCHI',
    tagline: 'Chinese nets & sea breeze',
    len: 640,
    skyTop: '#4d6fae',
    skyMid: '#f0a066',
    skyBot: '#fbdcae',
    fog: '#f9d9aa',
    sun: '#fff1c4',
    accent: '#d1491f',
    road: ['#6d6d75', '#66666e'],
    grass: ['#7fbd5a', '#72ae50'],
    rumble: ['#efe8d6', '#c93c2d'],
    lane: '#f6f2e4',
    scenery: [
      { id: 'palm', w: 6, min: 1.5, max: 2.0, solid: true, hit: 0.06 },
      { id: 'palm2', w: 4, min: 1.5, max: 2.1, solid: true, hit: 0.06 },
      { id: 'palm', w: 3, min: 2.6, max: 4.5, s: [1, 1.3] },
      { id: 'banana', w: 2, min: 1.6, max: 2.4 },
      { id: 'house', w: 2, min: 3.2, max: 5.2 },
      { id: 'house2', w: 1.5, min: 3.2, max: 5.2 },
      { id: 'net', w: 1, min: 2.6, max: 3.4 },
      { id: 'chaya', w: 0.8, min: 2.2, max: 3.0 },
      { id: 'bill1', w: 0.6, min: 3.2, max: 4.5 },
      { id: 'sign', w: 0.7, min: 1.13, max: 1.3, solid: true, hit: 0.07 },
    ],
    curve: 1.2,
    hill: 12,
    gap: 4700,
    oncoming: 0.3,
    rain: false,
    bg: 'harbor',
  },
  {
    id: 'alleppey',
    name: 'ALAPPUZHA',
    tagline: 'Venice of the East',
    len: 640,
    skyTop: '#2f95d3',
    skyMid: '#86cdee',
    skyBot: '#dff5f0',
    fog: '#d6f1ec',
    sun: '#ffffff',
    accent: '#16897b',
    road: ['#6b6e74', '#64676d'],
    grass: ['#6fcb4b', '#62bd40'],
    rumble: ['#ffffff', '#1f9a8a'],
    lane: '#ffffff',
    scenery: [
      { id: 'palm', w: 8, min: 1.5, max: 2.1, solid: true, hit: 0.06 },
      { id: 'palm2', w: 5, min: 1.5, max: 2.1, solid: true, hit: 0.06 },
      { id: 'palm', w: 4, min: 2.6, max: 4.8, s: [1, 1.3] },
      { id: 'houseboat', w: 2.2, min: 3.4, max: 5.6 },
      { id: 'banana', w: 2, min: 1.6, max: 2.5 },
      { id: 'house', w: 1.4, min: 3.2, max: 5 },
      { id: 'house2', w: 1.2, min: 3.2, max: 5 },
      { id: 'bill2', w: 0.5, min: 3.2, max: 4.5 },
      { id: 'sign', w: 0.6, min: 1.13, max: 1.3, solid: true, hit: 0.07 },
    ],
    curve: 1.0,
    hill: 7,
    gap: 5200,
    oncoming: 0.32,
    rain: false,
    bg: 'water',
  },
  {
    id: 'munnar',
    name: 'MUNNAR',
    tagline: 'Tea gardens in the mist',
    len: 640,
    skyTop: '#5f7f88',
    skyMid: '#9db8ba',
    skyBot: '#d3e3dd',
    fog: '#c8dcd4',
    sun: '#f4f8ee',
    accent: '#2f8f4e',
    road: ['#5b5e62', '#55585c'],
    grass: ['#33a05a', '#299049'],
    rumble: ['#e9e9e1', '#7b8d58'],
    lane: '#eeece0',
    scenery: [
      { id: 'tea', w: 8, min: 1.35, max: 2.2 },
      { id: 'tea', w: 5, min: 2.6, max: 5.5, s: [1.2, 1.8] },
      { id: 'euca', w: 4, min: 1.5, max: 2.4, solid: true, hit: 0.05 },
      { id: 'euca', w: 3, min: 3, max: 6, s: [1, 1.4] },
      { id: 'house2', w: 1, min: 3.5, max: 5.5 },
      { id: 'chaya', w: 0.8, min: 2.2, max: 3.2 },
      { id: 'sign', w: 0.8, min: 1.13, max: 1.3, solid: true, hit: 0.07 },
      { id: 'bill3', w: 0.4, min: 3.4, max: 4.5 },
    ],
    curve: 2.2,
    hill: 30,
    gap: 6000,
    oncoming: 0.28,
    rain: true,
    bg: 'tea',
  },
  {
    id: 'thrissur',
    name: 'THRISSUR',
    tagline: 'Pooram fever',
    len: 640,
    skyTop: '#5b2a86',
    skyMid: '#df5679',
    skyBot: '#ffb872',
    fog: '#f6a974',
    sun: '#ffe3a0',
    accent: '#c1272d',
    road: ['#55525c', '#4e4b56'],
    grass: ['#c2663b', '#b45c34'],
    rumble: ['#ffd24a', '#7a1d2b'],
    lane: '#ffe9a8',
    scenery: [
      { id: 'umbrella', w: 4, min: 1.4, max: 2.4 },
      { id: 'umbrella2', w: 4, min: 1.4, max: 2.4 },
      { id: 'umbrella3', w: 4, min: 1.4, max: 2.4 },
      { id: 'elephant', w: 2.2, min: 2.4, max: 3.6 },
      { id: 'lamp', w: 2, min: 1.35, max: 1.7, solid: true, hit: 0.05 },
      { id: 'palm', w: 4, min: 1.5, max: 2.1, solid: true, hit: 0.06 },
      { id: 'house', w: 2, min: 3.2, max: 5.2 },
      { id: 'house2', w: 1.5, min: 3.2, max: 5.2 },
      { id: 'bill1', w: 0.8, min: 3.2, max: 4.5 },
      { id: 'sign', w: 0.7, min: 1.13, max: 1.3, solid: true, hit: 0.07 },
    ],
    curve: 1.6,
    hill: 12,
    gap: 3800,
    oncoming: 0.36,
    rain: false,
    bg: 'town',
  },
  {
    id: 'kovalam',
    name: 'KOVALAM',
    tagline: 'Sunset, sand & lighthouse',
    len: 640,
    skyTop: '#33589a',
    skyMid: '#f08a5d',
    skyBot: '#ffd9a6',
    fog: '#f7d0a0',
    sun: '#fff0c0',
    accent: '#e4572e',
    road: ['#6c6c72', '#64646a'],
    grass: ['#efd69c', '#e6ca8b'],
    rumble: ['#ffffff', '#e4572e'],
    lane: '#ffffff',
    scenery: [
      { id: 'palm', w: 7, min: 1.5, max: 2.1, solid: true, hit: 0.06 },
      { id: 'palm2', w: 5, min: 1.5, max: 2.1, solid: true, hit: 0.06 },
      { id: 'beachumb', w: 3, min: 1.6, max: 2.8 },
      { id: 'boat', w: 2, min: 2.6, max: 4 },
      { id: 'lighthouse', w: 0.7, min: 3, max: 4.6 },
      { id: 'house', w: 1, min: 3.4, max: 5.4 },
      { id: 'banana', w: 1, min: 1.7, max: 2.4 },
      { id: 'sign', w: 0.6, min: 1.13, max: 1.3, solid: true, hit: 0.07 },
    ],
    curve: 1.8,
    hill: 15,
    gap: 4600,
    oncoming: 0.3,
    rain: false,
    bg: 'beach',
  },
];

export interface ZoneColors {
  road: [string, string];
  grass: [string, string];
  rumble: [string, string];
  lane: string;
  yellow: string;
}

function buildLut(z: Zone): ZoneColors[] {
  const out: ZoneColors[] = [];
  for (let i = 0; i < FOG_LEVELS; i++) {
    const f = i / (FOG_LEVELS - 1);
    out.push({
      road: [mixHex(z.road[0], z.fog, f), mixHex(z.road[1], z.fog, f)],
      grass: [mixHex(z.grass[0], z.fog, f), mixHex(z.grass[1], z.fog, f)],
      rumble: [mixHex(z.rumble[0], z.fog, f), mixHex(z.rumble[1], z.fog, f)],
      lane: mixHex(z.lane, z.fog, f),
      yellow: mixHex('#f7c514', z.fog, f),
    });
  }
  return out;
}

export const ZONE_LUT: ZoneColors[][] = ZONES.map(buildLut);

export interface Track {
  segments: Segment[];
  length: number; // number of segments
  finishIdx: number;
  finishZ: number;
  order: number[];
  zoneStart: number[]; // segment index at which each stage (in order) begins
}

const mkPt = (wy: number, wz: number): Pt => ({ wy, wz, cx: 0, cy: 0, cz: 0, sx: 0, sy: 0, sw: 0, sc: 0 });

export function buildTrack(level: number, seed?: number): Track {
  if (seed !== undefined) setTrackSeed(seed);
  else clearTrackSeed();
  const segs: Segment[] = [];
  const base = [0, 1, 2, 3, 4];
  const rot = (level - 1) % 5;
  const order = base.slice(rot).concat(base.slice(0, rot));
  let curZone = order[0];

  const lastY = () => (segs.length === 0 ? 0 : segs[segs.length - 1].p2.wy);

  const addSegment = (curve: number, y: number) => {
    const n = segs.length;
    segs.push({
      index: n,
      p1: mkPt(lastY(), n * SEG_LEN),
      p2: mkPt(y, (n + 1) * SEG_LEN),
      curve,
      zone: curZone,
      stripe: Math.floor(n / RUMBLE_LEN) % 2,
      sprites: [],
      ents: [],
      clip: 0,
      fog: 0,
      looped: false,
      mark: 0,
      gateName: '',
    });
  };

  const addRoad = (enter: number, hold: number, leave: number, curve: number, y: number) => {
    const startY = lastY();
    const endY = startY + y * SEG_LEN;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++)
      addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  };

  const dyChoice = (z: Zone) => {
    const yNow = lastY() / SEG_LEN;
    let d = rand(-1, 1) * z.hill;
    if (yNow + d > z.hill * 1.4) d = -Math.abs(d);
    if (yNow + d < -z.hill * 0.4) d = Math.abs(d);
    return d;
  };

  // starting grid
  addRoad(10, 50, 10, 0, 0);

  const zoneStart: number[] = [];
  for (let zi = 0; zi < order.length; zi++) {
    curZone = order[zi];
    const z = ZONES[curZone];
    zoneStart.push(segs.length);
    const end = segs.length + z.len;
    while (segs.length < end) {
      const rem = end - segs.length;
      if (rem < 80) {
        addRoad(Math.floor(rem / 3), Math.floor(rem / 3), rem - 2 * Math.floor(rem / 3), 0, 0);
        break;
      }
      const r = Math.random();
      const dir = Math.random() < 0.5 ? -1 : 1;
      const cur = rand(0.5, 1) * z.curve * dir;
      const dy = dyChoice(z);
      if (r < 0.2) addRoad(randInt(15, 30), randInt(25, 70), randInt(15, 30), 0, dy * 0.6);
      else if (r < 0.55) addRoad(randInt(25, 40), randInt(30, 70), randInt(25, 40), cur, Math.random() < 0.5 ? dy * 0.6 : 0);
      else if (r < 0.75) {
        addRoad(randInt(20, 30), randInt(25, 45), randInt(20, 30), cur, 0);
        addRoad(randInt(20, 30), randInt(25, 45), randInt(20, 30), -cur * 0.9, dy * 0.5);
      } else if (r < 0.9) addRoad(randInt(25, 40), randInt(30, 50), randInt(25, 40), 0, dy);
      else {
        addRoad(15, 15, 15, cur * 1.1, 0);
        addRoad(15, 15, 15, -cur * 1.1, dy * 0.3);
      }
    }
  }

  // finish approach + plaza
  curZone = order[order.length - 1];
  addRoad(30, 40, 30, 0, -lastY() / SEG_LEN);
  const finishIdx = segs.length + 10;
  addRoad(10, 220, 10, 0, 0);

  // marks
  segs[3].mark = 2;
  segs[finishIdx].mark = 3;
  for (let i = 1; i < zoneStart.length; i++) {
    const s = segs[zoneStart[i]];
    s.mark = 1;
    s.gateName = ZONES[s.zone].name;
  }

  // scenery
  for (const sg of segs) {
    if (sg.index < 6) continue;
    const z = ZONES[sg.zone];
    for (const side of [-1, 1]) {
      if (Math.random() < 0.36) {
        const def = wpick(z.scenery);
        const sp: SceneSprite = {
          id: def.id,
          x: side * rand(def.min, def.max),
          flip: R() < 0.5,
          solid: !!def.solid,
          hit: def.hit ?? 0,
          s: def.s ? rand(def.s[0], def.s[1]) : rand(0.92, 1.1),
        };
        sg.sprites.push(sp);
      }
    }
  }
  // finish plaza flags
  for (let i = finishIdx - 24; i < finishIdx + 60; i += 4) {
    if (i < 0 || i >= segs.length) continue;
    for (const side of [-1, 1]) {
      segs[i].sprites.push({ id: 'flags', x: side * 1.28, flip: side < 0, solid: false, hit: 0, s: 1 });
    }
  }
  // clear cluttered scenery right around the gantries so banners read clearly
  for (const sg of segs) {
    if (sg.mark === 1 || sg.mark === 3 || sg.mark === 2) {
      const lo = Math.max(0, sg.index - 2);
      const hi = Math.min(segs.length - 1, sg.index + 2);
      for (let k = lo; k <= hi; k++) segs[k].sprites = segs[k].sprites.filter((s) => s.id === 'flags');
    }
  }

  return { segments: segs, length: segs.length, finishIdx, finishZ: finishIdx * SEG_LEN, order, zoneStart };
}
