export interface Pt {
  wy: number;
  wz: number;
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sw: number;
  sc: number;
}

export interface SceneSprite {
  id: string;
  x: number; // normalised road offset (1 = road edge)
  flip: boolean;
  solid: boolean;
  hit: number; // collision half-width (normalised)
  s: number; // scale multiplier
}

export type EntKind = 'traffic' | 'rival' | 'cop' | 'pickup' | 'remote';
export type PickupKind = 'rupee' | 'coconut' | 'banana' | 'stick' | '';

export interface Ent {
  id: number;
  kind: EntKind;
  spr: string;
  z: number;
  zPrev: number;
  x: number;
  speed: number;
  w: number;
  len: number;
  dir: 1 | -1;
  seg: Segment | null;
  alive: boolean;
  // fighters
  hp: number;
  maxHp: number;
  ci: number;
  name: string;
  state: 'ride' | 'windup' | 'swing' | 'down';
  t: number;
  cd: number;
  side: -1 | 1;
  pose: 0 | 1 | 2;
  targetX: number;
  laneCd: number;
  engage: boolean;
  engageT: number;
  aggr: number;
  vmax: number;
  rot: number;
  spin: number;
  hop: number;
  hopV: number;
  invuln: number;
  flash: number;
  finished: boolean;
  // misc
  pk: PickupKind;
  passed: boolean;
  ph: number;
  // multiplayer
  nid: number; // network id (host-authoritative entities)
  pid: string; // owning player id for remote humans
  netZ: number; // last received position (dead reckoning)
  netX: number;
  netSpeed: number;
  fin: boolean; // has crossed the finish line
  finTime: number;
}

export interface Segment {
  index: number;
  p1: Pt;
  p2: Pt;
  curve: number;
  zone: number;
  stripe: number;
  sprites: SceneSprite[];
  ents: Ent[];
  clip: number;
  fog: number;
  looped: boolean;
  mark: 0 | 1 | 2 | 3; // 0 none, 1 gate, 2 start line, 3 finish line
  gateName: string;
}

export interface RaceResult {
  level: number;
  position: number;
  qualified: boolean;
  total: number;
  timeSec: number;
  takedowns: number;
  positionBonus: number;
  healthBonus: number;
  cashBonus: number;
  raceScore: number;
  score: number;
}

export interface RunResult {
  score: number;
  level: number;
  takedowns: number;
  reason: 'wasted' | 'disqualified';
  position: number;
  distanceKm: number;
}

export type Mode = 'menu' | 'playing' | 'paused' | 'result' | 'over';
