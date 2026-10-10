import { clamp, interpolate, lerp, percentRemaining, pick, rand, randInt } from './util';
import { AudioEngine } from './audio';
import { Input } from './input';
import { Fx } from './fx';
import type { PShape } from './fx';
import { S, buildSprites, drawRider, PLAYER_STYLE, RIDER_W, RIDER_WW, RIVAL_STYLES } from './sprites';
import type { RiderOpts, Spr } from './sprites';
import { buildBackgrounds } from './background';
import type { BgSet } from './background';
import { FOG_LEVELS, ROAD_W, SEG_LEN, ZONES, ZONE_LUT, buildTrack } from './track';
import type { Track } from './track';
import type { Ent, EntKind, Mode, PickupKind, Pt, RaceResult, RunResult, Segment } from './types';
import { drawHud, setTagFont } from './hud';
import { hasSeenHints, markSeenHints } from './scores';
import { DEFAULT_SETTINGS, DIFFICULTY, ENGINE_PROFILES, BIKE_COLORS } from './settings';
import type { DiffPreset, Settings } from './settings';
import { Room, MAX_RIDERS } from './net';
import type { MpPlayer, MpResult, NetRival, NetTraffic, RiderState, RoomHooks, StartCfg } from './net';


export const MAX_SPEED = 12000;
const ACCEL = MAX_SPEED / 3.0;
const BRAKE = MAX_SPEED * 0.95;
const DECEL = MAX_SPEED / 5;
const OFFROAD_DECEL = MAX_SPEED / 2.2;
const OFFROAD_LIMIT = MAX_SPEED * 0.36;
const CENTRIF = 0.4;
const CAM_H = 1000;
const CAM_D = 0.84;
const PLAYER_Z = CAM_H * CAM_D;
const START_Z = 1000;
const P_W = 0.2;
const P_LEN = 150;
const XMIN = -0.92;
const XMAX = -0.14;
const PUNCH_DUR = 0.3;
const FOG_DENSITY = 3.6;
const NITRO_DRAIN = 34;
export const QUALIFY = 5;
export const TOTAL_RACERS = 8;
const NAMES = ['KUTTAN', 'APPU', 'SHAJI', 'BIJU', 'MANI', 'RAJAN', 'SUDHI', 'UNNI', 'JOSE', 'BABU', 'GOPI', 'HARI'];
const POS_BONUS = [5000, 3000, 2000, 1200, 700, 300, 150, 50, 25, 10];

export type Phase = 'countdown' | 'race' | 'finish' | 'dead';

export interface GameHooks {
  onMode: (m: Mode) => void;
  onResult: (r: RaceResult) => void;
  onOver: (r: RunResult) => void;
  onMpResults?: (rows: MpResult[]) => void;
}

export interface MpRider {
  pid: string;
  name: string;
  color: number;
  ent: Ent | null;
  lastSeen: number;
  hp: number;
  down: boolean;
  fin: boolean;
}

export interface MpFinisher {
  pid: string;
  name: string;
  color: number;
  timeSec: number;
  score: number;
  takedowns: number;
  isAi: boolean;
}

export interface MpRace {
  code: string;
  isHost: boolean;
  localPid: string;
  total: number;
  aiCount: number;
  seed: number;
  sendT: number;
  worldT: number;
  finished: boolean;
  resultsT: number;
  finishOrder: MpFinisher[];
  results: MpResult[];
  riders: MpRider[];
  netTraffic: Map<number, Ent>;
  netRivals: Map<number, Ent>;
}

interface Player {
  pos: number;
  x: number;
  speed: number;
  steerV: number;
  lean: number;
  hp: number;
  nitro: number;
  nitroOn: boolean;
  wipe: number;
  wipeSpin: number;
  wipeRot: number;
  wipeVx: number;
  hop: number;
  hopV: number;
  invuln: number;
  punchT: number;
  punchSide: -1 | 1;
  punchHit: boolean;
  punchCd: number;
  weapon: number;
}

export interface Banner {
  name: string;
  tag: string;
  t: number;
}
export interface Msg {
  text: string;
  sub: string;
  color: string;
  t: number;
  dur: number;
}

function newPlayer(): Player {
  return {
    pos: START_Z - PLAYER_Z,
    x: -0.27,
    speed: 0,
    steerV: 0,
    lean: 0,
    hp: 100,
    nitro: 50,
    nitroOn: false,
    wipe: 0,
    wipeSpin: 0,
    wipeRot: 0,
    wipeVx: 0,
    hop: 0,
    hopV: 0,
    invuln: 0,
    punchT: 0,
    punchSide: -1,
    punchHit: false,
    punchCd: 0,
    weapon: 0,
  };
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  hooks: GameHooks;
  input = new Input();
  audio = new AudioEngine();
  fx = new Fx();

  W = 640;
  H = 360;
  u = 1;
  hy = 144;
  cssW = 640;
  cssH = 360;
  quality = 1;
  drawDist = 120;
  rightPad = 84;
  isTouch = false;
  ready = false;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private avgDt = 1 / 60;
  private qFrames = 0;
  private qLast = 0;
  frameDt = 1 / 60;

  bgs: BgSet[] = [];
  private bgCur = 0;
  private bgPrev = 0;
  private bgFade = 1;
  private bgOff = [0, 0, 0];

  mode: Mode = 'menu';
  phase: Phase = 'race';
  demo = true;
  settings: Settings = { ...DEFAULT_SETTINGS };
  diff: DiffPreset = DIFFICULTY.normal;
  speedMul = 1;
  net: Room | null = null;
  mp: MpRace | null = null;
  showFps = false;
  track!: Track;
  segs: Segment[] = [];
  ents: Ent[] = [];
  rivals: Ent[] = [];
  cop: Ent | null = null;
  private toRemove: Ent[] = [];
  private nextId = 1;
  P: Player = newPlayer();
  fovK = 1;

  // run state
  level = 1;
  score = 0;
  dispScore = 0;
  scorePop = 0;
  takedownsRun = 0;
  takedownsRace = 0;
  raceTime = 0;
  distance = 0;
  best = 0;
  rank = TOTAL_RACERS;
  rankFlash = 0;
  finishPos = 0;
  finT = 0;
  deadT = 0;
  deadReason: 'wasted' | 'disqualified' = 'wasted';
  comboCount = 0;
  comboT = 0;
  mult = 1;
  time = 0;
  cd = 0;
  private cdNum = 4;
  private cdPressed = -1;
  banner: Banner | null = null;
  msg: Msg | null = null;
  private lastZone = -1;
  hintT = 0;
  promptSide: -1 | 0 | 1 = 0;
  promptT = 0;
  private seenHints = false;
  private nextSpawn = 0;
  private copCd = 24;
  private nameBag: string[] = [];
  private demoLane = -0.25;
  private demoT = 0;

  // fx state
  shake = 0;
  hurtA = 0;
  flashA = 0;
  private tsT = 0;
  private tsV = 1;
  private rainA = 0;
  private drops: { x: number; y: number; v: number }[] = [];
  private gradVig: CanvasGradient | null = null;
  private pY = 0;
  private pS = 1;
  private pOpts: RiderOpts = { ...PLAYER_STYLE };
  private pSegCurve = 0;
  private blink = 0;

  constructor(canvas: HTMLCanvasElement, hooks: GameHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.hooks = hooks;
    this.isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    this.input.autoThrottle = false;
    this.seenHints = hasSeenHints();
    for (let i = 0; i < 70; i++) this.drops.push({ x: Math.random(), y: Math.random(), v: 0.8 + Math.random() * 0.6 });
    this.input.attach();
    document.addEventListener('visibilitychange', this.onVis);
    this.resize(this.cssW, this.cssH);
    this.setupRace(1, true);
    void this.init();
  }

  private async init() {
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.race([
          Promise.all([document.fonts.load('20px Bungee'), document.fonts.load('700 20px Rajdhani')]),
          new Promise((r) => setTimeout(r, 900)),
        ]);
      }
    } catch {
      /* ignore */
    }
    if (this.disposed) return;
    try {
      buildSprites();
    } catch (err) {
      console.warn('sprite build failed', err);
    }
    try {
      this.bgs = buildBackgrounds();
    } catch (err) {
      console.warn('background build failed', err);
    }
    this.ready = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private onVis = () => {
    if (document.hidden) {
      if (this.mode === 'playing') this.pause();
      void this.audio.ctx?.suspend();
    } else {
      void this.audio.ctx?.resume();
      this.last = performance.now();
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.net?.leave();
    this.net = null;
    this.mp = null;
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVis);
    this.audio.stopMusic();
    this.audio.setEngine(0, 0, false, false);
    this.audio.setSiren(0);
  }

  /* ------------------------------------------------------------ */
  /* sizing                                                        */
  /* ------------------------------------------------------------ */
  resize(cssW: number, cssH: number) {
    this.cssW = Math.max(120, cssW);
    this.cssH = Math.max(120, cssH);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxPx = this.isTouch ? 330000 : 620000;
    let f = Math.min(dpr, this.isTouch ? 1.3 : 1.6) * this.quality;
    f = Math.min(f, Math.sqrt((maxPx * this.quality) / (this.cssW * this.cssH)));
    f = Math.max(f, 0.3);
    this.W = Math.round(this.cssW * f);
    this.H = Math.round(this.cssH * f);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.u = Math.min(this.W / 640, this.H / 360);
    this.hy = Math.round(this.H * 0.4);
    this.drawDist = Math.round((this.isTouch ? 95 : 130) * (0.65 + 0.35 * this.quality));
    this.rightPad = 84 * (this.W / this.cssW);
    this.ctx.imageSmoothingEnabled = true;
    const g = this.ctx;
    const vg = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.28, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.72);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(255,255,255,1)');
    this.gradVig = vg;
  }

  /* ------------------------------------------------------------ */
  /* public controls                                               */
  /* ------------------------------------------------------------ */
  private setMode(m: Mode) {
    this.mode = m;
    if (m !== 'playing') {
      this.audio.setEngine(0, 0, false, false);
      this.audio.setSiren(0);
    }
    this.hooks.onMode(m);
  }

  unlockAudio() {
    this.audio.unlock();
    this.audio.startMusic();
    this.audio.setMusicLevel(0.2);
  }

  start() {
    this.unlockAudio();
    this.mp = null;
    this.newRun();
    this.setMode('playing');
  }

  /** Host restarts a multiplayer race; peers wait for the "again" message. */
  makeMpCfg(): StartCfg {
    const room = this.net;
    const players = room
      ? room.playerList().map((p: MpPlayer) => ({ pid: p.pid, name: p.name, color: p.color }))
      : [{ pid: 'me', name: this.settings.name, color: this.settings.bikeColor }];
    return {
      seed: (Math.random() * 0xffffffff) >>> 0,
      level: Math.min(9, this.level + 1),
      total: Math.max(players.length, Math.min(MAX_RIDERS, this.settings.maxRiders)),
      difficulty: this.settings.difficulty,
      players,
    };
  }

  nextRace() {
    this.unlockAudio();
    if (this.mp) {
      const room = this.net;
      if (room && room.isHost) {
        const cfg = this.makeMpCfg();
        if (room.raceAgain(cfg)) {
          this.startMultiplayer(cfg);
          return;
        }
      }
      return; // peers restart when the host says so
    }
    this.level++;
    this.P.hp = Math.min(100, this.P.hp + 30);
    this.P.nitro = Math.min(100, this.P.nitro + 30);
    this.setupRace(this.level, false);
    this.setMode('playing');
  }

  restart() {
    if (this.mp) {
      const room = this.net;
      if (room && room.isHost) {
        const cfg = { ...this.makeMpCfg(), level: this.level };
        if (room.raceAgain(cfg)) {
          this.startMultiplayer(cfg);
          return;
        }
      }
      return;
    }
    this.start();
  }

  goMenu() {
    this.audio.setEngine(0, 0, false, false);
    this.audio.setSiren(0);
    this.audio.setMusicLevel(0.2);
    this.mp = null;
    this.input.reset();
    this.setupRace(1, true);
    this.setMode('menu');
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.input.reset();
    this.audio.setEngine(0, 0, false, false);
    this.audio.setSiren(0);
    this.audio.setMusicLevel(0.08);
    this.setMode('paused');
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.audio.setMusicLevel(0.2);
    this.last = performance.now();
    this.setMode('playing');
  }

  togglePause() {
    if (this.mode === 'playing') this.pause();
    else if (this.mode === 'paused') this.resume();
  }

  /* ------------------------------------------------------------ */
  /* settings                                                      */
  /* ------------------------------------------------------------ */
  applySettings(s: Settings) {
    this.settings = s;
    this.diff = DIFFICULTY[s.difficulty] || DIFFICULTY.normal;
    this.speedMul = s.gameSpeed;
    this.showFps = s.showFps;
    this.audio.setMasterVol(s.masterVol);
    this.audio.setMusicVol(s.musicVol);
    this.audio.setSfxVol(s.sfxVol);
    this.audio.setMuted(s.muted);
    this.audio.setEngineProfile(s.engineSound);
    const c = BIKE_COLORS[s.bikeColor] || BIKE_COLORS[0];
    this.pOpts.shirt = c.shirt;
    this.pOpts.shirt2 = c.shirt2;
    this.pOpts.bike = c.bike;
    this.pOpts.band = c.band;
    this.pOpts.helmet = null;
    if (Math.abs(this.quality - s.quality) > 0.01) {
      this.quality = s.quality;
      this.resize(this.cssW, this.cssH);
    }
  }

  get engineName(): string {
    return ENGINE_PROFILES[this.settings.engineSound]?.label || 'THUNDER';
  }

  /* ------------------------------------------------------------ */
  /* multiplayer                                                   */
  /* ------------------------------------------------------------ */
  attachRoom(room: Room) {
    this.detachRoom();
    this.net = room;
    const hooks: RoomHooks = {
      onState: (pid, st) => this.mpApplyState(pid, st),
      onWorld: (tr, rv) => this.mpApplyWorld(tr, rv),
      onPunch: (from, name, target, side) => this.mpOnPunch(from, name, target, side),
      onFinish: (pid, name, timeSec, score, takedowns) => this.mpOnFinish(pid, name, timeSec, score, takedowns),
      onResults: (rows) => this.mpOnResults(rows),
      onAgain: (cfg) => this.startMultiplayer(cfg),
      onStart: (cfg) => this.startMultiplayer(cfg),
    };
    room.hooks = { ...room.hooks, ...hooks };
  }

  detachRoom() {
    if (this.net) this.net.hooks = {};
    this.net = null;
    this.mp = null;
  }

  startMultiplayer(cfg: StartCfg) {
    this.unlockAudio();
    const room = this.net;
    const players = (cfg.players || []).slice();
    const myPid = room ? room.me.pid : 'me';
    const humans = Math.max(1, players.length || 1);
    const total = Math.max(humans, Math.min(MAX_RIDERS, cfg.total || MAX_RIDERS));
    const aiCount = Math.max(0, total - humans);
    const mp: MpRace = {
      code: room ? room.code : 'LOCAL',
      isHost: room ? room.isHost : true,
      localPid: myPid,
      total,
      aiCount,
      seed: cfg.seed,
      sendT: 0,
      worldT: 0,
      finished: false,
      resultsT: 0,
      finishOrder: [],
      results: [],
      riders: players.map((p) => ({ pid: p.pid, name: p.name, color: p.color, ent: null, lastSeen: 0, hp: 100, down: false, fin: false })),
      netTraffic: new Map(),
      netRivals: new Map(),
    };
    this.mp = mp;
    this.setMode('playing');
    this.setupRace(cfg.level, false, { seed: cfg.seed, mp });
  }

  /** Grid slots shared by every client so the pack lines up identically. */
  private mpSlots(n: number) {
    const out: { dz: number; x: number }[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 2);
      out.push({ dz: 70 + row * 460, x: i % 2 === 0 ? -0.76 : -0.26 });
    }
    return out;
  }

  private mpTick(dt: number) {
    const mp = this.mp;
    const room = this.net;
    if (!mp || !room) return;
    const P = this.P;

    // broadcast my own rider at ~15 Hz
    mp.sendT -= dt;
    if (mp.sendT <= 0) {
      mp.sendT = 1 / 15;
      room.send({
        t: 'state',
        from: mp.localPid,
        st: {
          z: Math.round(P.pos + PLAYER_Z),
          x: Math.round(P.x * 1000) / 1000,
          sp: Math.round(P.speed),
          hp: Math.round(P.hp),
          pose: P.punchT > 0 ? (P.punchSide < 0 ? 1 : 2) : 0,
          down: P.wipe > 0,
          fin: mp.finished,
        },
      });
    }

    // host publishes traffic + AI rivals at ~10 Hz
    if (mp.isHost) {
      mp.worldT -= dt;
      if (mp.worldT <= 0) {
        mp.worldT = 1 / 10;
        // cover every rider, not just the host, or guests race an empty road
        const zs = [P.pos + PLAYER_Z];
        for (const r of mp.riders) if (r.ent && r.ent.alive) zs.push(r.ent.z);
        const loZ = Math.min(...zs) - 12000;
        const hiZ = Math.max(...zs) + 46000;
        const tr: NetTraffic[] = [];
        const rv: NetRival[] = [];
        for (const e of this.ents) {
          if (!e.alive) continue;
          if (e.z < loZ || e.z > hiZ) continue;
          if (e.kind === 'traffic') {
            if (!e.nid) e.nid = e.id;
            tr.push({ n: e.nid, s: e.spr, z: Math.round(e.z), x: Math.round(e.x * 1000) / 1000, d: e.dir, v: Math.round(e.speed) });
          } else if (e.kind === 'rival') {
            if (!e.nid) e.nid = e.id + 100000;
            rv.push({
              n: e.nid,
              c: e.ci,
              nm: e.name,
              z: Math.round(e.z),
              x: Math.round(e.x * 1000) / 1000,
              v: Math.round(e.speed),
              st: e.state === 'ride' ? 0 : e.state === 'windup' ? 1 : e.state === 'swing' ? 2 : 3,
              hp: e.hp,
              p: e.pose,
              r: Math.round(e.rot * 100) / 100,
              h: Math.round(e.hop),
            });
          }
        }
        room.send({ t: 'world', from: mp.localPid, tr, rv });
      }
    }

    // dead reckoning for riders we have not heard from this frame
    for (const r of mp.riders) {
      if (r.pid === mp.localPid) continue;
      const e = r.ent;
      if (!e || !e.alive) continue;
      e.zPrev = e.z;
      e.z += e.speed * dt;
      e.x += clamp(e.netX - e.x, -0.6 * dt, 0.6 * dt);
      if (e.state === 'down') {
        e.rot += e.spin * dt;
        e.hop += e.hopV * dt;
        e.hopV -= 5200 * dt;
        if (e.hop < 0) {
          e.hop = 0;
          e.hopV = 0;
        }
      }
      this.moveEnt(e, e.z);
    }
  }

  private mpApplyState(pid: string, st: RiderState) {
    const mp = this.mp;
    if (!mp) return;
    const r = mp.riders.find((q) => q.pid === pid);
    if (!r) return;
    r.lastSeen = this.time;
    r.hp = st.hp;
    r.down = st.down;
    r.fin = st.fin;
    const e = r.ent;
    if (!e) return;
    e.zPrev = e.z;
    e.netZ = st.z;
    e.netX = st.x;
    e.speed = st.sp;
    // snap when far away, ease in when close (hides network jitter)
    const dz = st.z - e.z;
    e.z += Math.abs(dz) > 2400 ? dz : dz * 0.35;
    e.x += (st.x - e.x) * 0.4;
    e.pose = st.pose as 0 | 1 | 2;
    if (st.down && e.state !== 'down') {
      e.state = 'down';
      e.t = 3;
      e.rot = 0;
      e.hop = 0;
      e.hopV = 900;
      e.spin = (Math.random() < 0.5 ? -1 : 1) * 7;
    } else if (!st.down && e.state === 'down') {
      e.state = 'ride';
      e.rot = 0;
      e.hop = 0;
      e.pose = 0;
    }
    this.moveEnt(e, e.z);
  }

  private mpApplyWorld(tr: NetTraffic[], rv: NetRival[]) {
    const mp = this.mp;
    if (!mp || mp.isHost) return;
    const seenT = new Set<number>();
    for (const t of tr) {
      seenT.add(t.n);
      let e = mp.netTraffic.get(t.n);
      if (!e || !e.alive) {
        e = this.newEnt('traffic', t.z, t.x);
        e.nid = t.n;
        e.spr = t.s;
        e.dir = t.d < 0 ? -1 : 1;
        e.w = t.s.startsWith('bus') || t.s.startsWith('lorry') ? 0.48 : t.s.startsWith('auto') ? 0.31 : t.s.startsWith('moto') ? 0.2 : 0.42;
        e.len = t.s.startsWith('bus') ? 430 : t.s.startsWith('lorry') ? 470 : t.s.startsWith('auto') ? 220 : t.s.startsWith('moto') ? 170 : 300;
        this.addEnt(e);
        mp.netTraffic.set(t.n, e);
      }
      e.zPrev = e.z;
      e.spr = t.s;
      e.x = t.x;
      e.speed = t.v;
      e.z += (t.z - e.z) * 0.5;
      this.moveEnt(e, e.z);
    }
    for (const [n, e] of mp.netTraffic) {
      if (!seenT.has(n)) {
        this.kill(e);
        mp.netTraffic.delete(n);
      }
    }
    const seenR = new Set<number>();
    for (const r of rv) {
      seenR.add(r.n);
      let e = mp.netRivals.get(r.n);
      if (!e || !e.alive) {
        e = this.newEnt('rival', r.z, r.x);
        e.nid = r.n;
        e.ci = r.c % RIVAL_STYLES.length;
        e.name = r.nm;
        e.w = 0.2;
        e.len = 150;
        e.maxHp = 3;
        this.addEnt(e);
        mp.netRivals.set(r.n, e);
        // guests must see these in the standings / position counter too
        if (!this.rivals.includes(e)) this.rivals.push(e);
      }
      e.zPrev = e.z;
      e.ci = r.c % RIVAL_STYLES.length;
      e.name = r.nm;
      e.x = r.x;
      e.speed = r.v;
      e.hp = r.hp;
      e.pose = r.p as 0 | 1 | 2;
      e.rot = r.r;
      e.hop = r.h;
      const st = r.st;
      e.state = st === 1 ? 'windup' : st === 2 ? 'swing' : st === 3 ? 'down' : 'ride';
      e.z += (r.z - e.z) * 0.5;
      this.moveEnt(e, e.z);
    }
    for (const [n, e] of mp.netRivals) {
      if (!seenR.has(n)) {
        this.kill(e);
        mp.netRivals.delete(n);
        const i = this.rivals.indexOf(e);
        if (i >= 0) this.rivals.splice(i, 1);
      }
    }
  }

  private mpOnPunch(from: string, name: string, target: string, side: number) {
    const mp = this.mp;
    if (!mp) return;
    if (target === mp.localPid) {
      // I am the victim: confirm the range before taking the hit
      const r = mp.riders.find((q) => q.pid === from);
      const ez = r?.ent ? r.ent.z : 0;
      const dz = ez - (this.P.pos + PLAYER_Z);
      const dx = (r?.ent ? r.ent.x : 0) - this.P.x;
      if (Math.abs(dz) < 500 && Math.abs(dx) < 0.9) {
        const dmg = Math.round(9 * this.diff.dmgIn);
        if (this.hurtPlayer(dmg)) {
          this.P.x += side * 0.18;
          this.P.steerV += side * 1.4;
          this.fx.float(name + ' HIT YOU!', this.W / 2 - side * 60 * this.u, this.H * 0.5, '#ff6b5c', 20 * this.u);
        }
      }
      this.net?.send({ t: 'hit', from: mp.localPid, hp: Math.round(this.P.hp) });
      return;
    }
    // someone else got hit — splash some sparks on them if visible
    const victim = mp.riders.find((q) => q.pid === target);
    if (victim?.ent) {
      const sp = this.screenOf(victim.ent);
      if (sp) {
        this.burst(sp.x, sp.y - 60 * this.u, 8, ['#ffffff', '#ffd23f', '#ff8a00'], 300 * this.u, 0.35, 4 * this.u, 'star', 200 * this.u);
        this.audio.punch();
      }
    }
  }

  private mpOnFinish(pid: string, name: string, timeSec: number, score: number, takedowns: number) {
    const mp = this.mp;
    if (!mp) return;
    const r = mp.riders.find((q) => q.pid === pid);
    if (r) r.fin = true;
    if (mp.finishOrder.some((f) => f.pid === pid)) return;
    mp.finishOrder.push({ pid, name, color: r?.color ?? 0, timeSec, score, takedowns, isAi: false });
    if (mp.isHost) this.mpBroadcastResults();
  }

  private mpOnResults(rows: MpResult[]) {
    const mp = this.mp;
    if (!mp) return;
    mp.results = rows;
    if (rows.length && this.phase === 'finish') {
      const mine = rows.find((r) => r.pid === mp.localPid);
      if (mine) {
        this.finishPos = mine.pos;
        this.rank = mine.pos;
      }
    }
  }

  private mpBroadcastResults() {
    const mp = this.mp;
    if (!mp || !mp.isHost) return;
    const rows = this.mpBuildResults();
    this.net?.send({ t: 'results', from: mp.localPid, rows });
    mp.results = rows;
  }

  private mpBuildResults(): MpResult[] {
    const mp = this.mp;
    if (!mp) return [];
    const pz = this.P.pos + PLAYER_Z;
    type Row = MpResult & { z: number };
    const rows: Row[] = [];
    for (const f of mp.finishOrder) {
      rows.push({ pid: f.pid, name: f.name, color: f.color, pos: 0, score: f.score, takedowns: f.takedowns, timeSec: f.timeSec, isAi: f.isAi, dnf: false, z: 1e12 - f.timeSec });
    }
    const done = new Set(rows.map((r) => r.pid));
    for (const r of mp.riders) {
      if (done.has(r.pid)) continue;
      const e = r.ent;
      rows.push({ pid: r.pid, name: r.name, color: r.color, pos: 0, score: 0, takedowns: 0, timeSec: 0, isAi: false, dnf: true, z: e ? e.z : 0 });
    }
    for (const e of this.rivals) {
      if (done.has('ai' + e.id)) continue;
      rows.push({ pid: 'ai' + e.id, name: e.name || 'RIDER', color: e.ci, pos: 0, score: 0, takedowns: 0, timeSec: 0, isAi: true, dnf: true, z: e.z });
    }
    rows.sort((a, b) => b.z - a.z);
    rows.forEach((r, i) => (r.pos = i + 1));
    void pz;
    return rows.map(({ z, ...rest }) => {
      void z;
      return rest;
    });
  }

  /** Live standings for the HUD. */
  mpBoard(): { name: string; me: boolean; z: number; color: string; down: boolean; ai: boolean }[] {
    const mp = this.mp;
    if (!mp) return [];
    const pz = this.P.pos + PLAYER_Z;
    const out: { name: string; me: boolean; z: number; color: string; down: boolean; ai: boolean }[] = [
      { name: this.settings.name, me: true, z: pz, color: BIKE_COLORS[this.settings.bikeColor]?.shirt || '#fff', down: this.P.wipe > 0, ai: false },
    ];
    for (const r of mp.riders) {
      if (r.pid === mp.localPid) continue;
      out.push({
        name: r.name,
        me: false,
        z: r.ent ? r.ent.z : 0,
        color: BIKE_COLORS[r.color]?.shirt || '#fff',
        down: r.down,
        ai: false,
      });
    }
    for (const e of this.rivals) {
      out.push({ name: e.name || 'RIDER', me: false, z: e.z, color: RIVAL_STYLES[e.ci % RIVAL_STYLES.length].shirt, down: e.state === 'down', ai: true });
    }
    out.sort((a, b) => b.z - a.z);
    return out;
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m);
  }

  private newRun() {
    this.level = 1;
    this.score = 0;
    this.dispScore = 0;
    this.takedownsRun = 0;
    this.distance = 0;
    this.P = newPlayer();
    this.setupRace(1, false);
  }

  /* ------------------------------------------------------------ */
  /* race setup                                                    */
  /* ------------------------------------------------------------ */
  private setupRace(level: number, demo: boolean, mpCfg?: { seed: number; mp: MpRace }) {
    this.level = level;
    this.demo = demo;
    const mp = mpCfg?.mp ?? null;
    this.mp = mp;
    this.track = buildTrack(level, mpCfg?.seed);
    this.segs = this.track.segments;
    this.ents = [];
    this.rivals = [];
    this.cop = null;
    this.toRemove = [];
    this.fx.clear();
    const keepHp = demo ? 100 : this.P.hp;
    const keepNitro = demo ? 50 : this.P.nitro;
    const keepWeapon = demo ? 0 : this.P.weapon;
    this.P = newPlayer();
    this.P.hp = keepHp;
    this.P.nitro = keepNitro;
    this.P.weapon = keepWeapon;
    this.raceTime = 0;
    this.takedownsRace = 0;
    this.comboCount = 0;
    this.comboT = 0;
    this.mult = 1;
    this.banner = null;
    this.msg = null;
    this.lastZone = -1;
    this.copCd = Math.max(10, (26 - level * 2) / (this.demo ? 1 : this.diff.cop));
    this.nameBag = [...NAMES].sort(() => Math.random() - 0.5);
    this.shake = 0;
    this.hurtA = 0;
    this.flashA = 0;
    this.tsT = 0;
    this.finT = 0;
    this.deadT = 0;
    this.promptT = 0;
    this.hintT = this.seenHints || demo ? 0 : 11;
    this.bgCur = this.segAt(START_Z).zone;
    this.bgPrev = this.bgCur;
    this.bgFade = 1;
    this.demoLane = -0.25;
    this.pOpts = { ...PLAYER_STYLE };
    // keep the rider's chosen bike colour (setupRace resets the style object)
    const myCol = BIKE_COLORS[this.settings.bikeColor];
    if (myCol) {
      this.pOpts.shirt = myCol.shirt;
      this.pOpts.shirt2 = myCol.shirt2;
      this.pOpts.bike = myCol.bike;
      this.pOpts.band = myCol.band;
    }

    const d = this.diff;
    if (mp) {
      // ---- multiplayer grid: every human + AI fill, up to MAX_RIDERS ----
      const slots = this.mpSlots(mp.total);
      const humans = mp.riders;
      const myIdx = Math.max(0, humans.findIndex((h) => h.pid === mp.localPid));
      humans.forEach((h, i) => {
        const slot = slots[i % slots.length];
        if (h.pid === mp.localPid) {
          this.P.pos = START_Z + slot.dz - PLAYER_Z;
          this.P.x = slot.x;
          return;
        }
        const e = this.newEnt('remote', START_Z + slot.dz, slot.x);
        e.pid = h.pid;
        e.name = h.name;
        e.ci = h.color % 10;
        e.w = 0.2;
        e.len = 150;
        e.netX = slot.x;
        e.netZ = START_Z + slot.dz;
        e.speed = 0;
        this.addEnt(e);
        h.ent = e;
      });
      // Only the host simulates the computer riders; guests receive them over
      // the wire (otherwise every guest would see a second, frozen AI pack).
      const aiCount = mp.isHost ? mp.aiCount : 0;
      for (let i = 0; i < aiCount; i++) {
        const slot = slots[(humans.length + i) % slots.length];
        const e = this.newEnt('rival', START_Z + slot.dz + 120, slot.x + rand(-0.03, 0.03));
        e.ci = (humans.length + i) % RIVAL_STYLES.length;
        e.name = this.nameBag[(humans.length + i) % this.nameBag.length];
        e.w = 0.2;
        e.len = 150;
        e.maxHp = d.aiHp;
        e.hp = e.maxHp;
        e.vmax = MAX_SPEED * clamp((0.8 + Math.min(level - 1, 6) * 0.025) * d.rival + rand(0, 0.08), 0.7, 1.05);
        e.aggr = clamp(0.35 + rand(0, 0.4) + level * 0.04, 0.3, 0.95) * d.aggr;
        e.engage = i === 0 && myIdx === 0;
        e.engageT = i === 0 ? 5 : rand(1, 3);
        e.targetX = slot.x;
        e.cd = 2.45 + rand(0.9, 1.7) + i * 0.2;
        this.addEnt(e);
        this.rivals.push(e);
      }
      this.rank = mp.total;
    } else {
      // ---- single player grid (unchanged) ----
      const slots = [
        { dz: 70, x: -0.78 },
        { dz: 520, x: -0.27 },
        { dz: 900, x: -0.76 },
        { dz: 1320, x: -0.3 },
        { dz: 1760, x: -0.78 },
        { dz: 2200, x: -0.26 },
        { dz: 2650, x: -0.74 },
      ];
      slots.forEach((s, i) => {
        const e = this.newEnt('rival', START_Z + s.dz, s.x);
        e.ci = i % RIVAL_STYLES.length;
        e.name = this.nameBag[i % this.nameBag.length];
        e.w = 0.2;
        e.len = 150;
        e.maxHp = d.aiHp;
        e.hp = e.maxHp;
        const lvl = Math.min(level - 1, 6);
        e.vmax = MAX_SPEED * clamp(0.8 + lvl * 0.025 + rand(0, 0.1) - i * 0.004, 0.78, 1.0) * d.rival;
        e.aggr = i === 0 ? 1 : clamp(0.35 + rand(0, 0.4) + level * 0.04, 0.3, 0.95) * d.aggr;
        e.engage = i === 0;
        e.engageT = i === 0 ? 5 : rand(1, 3);
        e.targetX = s.x;
        e.cd = 2.45 + rand(0.9, 1.7) + i * 0.2;
        this.addEnt(e);
        this.rivals.push(e);
      });
    }

    this.nextSpawn = START_Z + 6500;
    this.phase = demo ? 'race' : 'countdown';
    this.cd = demo ? 0 : 2.45;
    this.cdNum = 4;
    this.cdPressed = -1;
    this.rank = TOTAL_RACERS;
    this.rankFlash = 0;
  }

  private newEnt(kind: EntKind, z: number, x: number): Ent {
    return {
      id: this.nextId++,
      kind,
      spr: '',
      z,
      zPrev: z,
      x,
      speed: 0,
      w: 0.3,
      len: 200,
      dir: 1,
      seg: null,
      alive: true,
      hp: 1,
      maxHp: 1,
      ci: 0,
      name: '',
      state: 'ride',
      t: 0,
      cd: rand(0.6, 1.6),
      side: -1,
      pose: 0,
      targetX: x,
      laneCd: 0,
      engage: false,
      engageT: rand(0.5, 2),
      aggr: 0.5,
      vmax: 0,
      rot: 0,
      spin: 0,
      hop: 0,
      hopV: 0,
      invuln: 0,
      flash: 0,
      finished: false,
      pk: '',
      passed: false,
      ph: Math.random() * 6.28,
      nid: 0,
      pid: '',
      netZ: z,
      netX: x,
      netSpeed: 0,
      fin: false,
      finTime: 0,
    };
  }

  segAt(z: number): Segment {
    const n = this.segs.length;
    let i = Math.floor(z / SEG_LEN);
    i = ((i % n) + n) % n;
    return this.segs[i];
  }

  private addEnt(e: Ent) {
    this.ents.push(e);
    this.moveEnt(e, e.z);
  }

  private moveEnt(e: Ent, z: number) {
    const n = this.segs.length;
    const idx = clamp(Math.floor(z / SEG_LEN), 0, n - 1);
    const seg = this.segs[idx];
    if (seg !== e.seg) {
      if (e.seg) {
        const arr = e.seg.ents;
        const i = arr.indexOf(e);
        if (i >= 0) arr.splice(i, 1);
      }
      seg.ents.push(e);
      e.seg = seg;
    }
    e.z = z;
  }

  private kill(e: Ent) {
    if (!e.alive) return;
    e.alive = false;
    this.toRemove.push(e);
  }

  private flush() {
    if (!this.toRemove.length) return;
    for (const e of this.toRemove) {
      if (e.seg) {
        const i = e.seg.ents.indexOf(e);
        if (i >= 0) e.seg.ents.splice(i, 1);
        e.seg = null;
      }
      const j = this.ents.indexOf(e);
      if (j >= 0) {
        this.ents[j] = this.ents[this.ents.length - 1];
        this.ents.pop();
      }
    }
    this.toRemove.length = 0;
  }

  /* ------------------------------------------------------------ */
  /* main loop                                                     */
  /* ------------------------------------------------------------ */
  private loop = (ts: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (dt <= 0) return;
    if (dt > 0.25) dt = 1 / 60;
    // adaptive quality
    if (dt < 0.1 && this.mode !== 'paused') {
      this.avgDt = lerp(this.avgDt, dt, 0.04);
      this.qFrames++;
      if (this.qFrames > 150 && this.avgDt > 0.0215 && this.quality > 0.56 && ts - this.qLast > 2500) {
        this.quality = Math.max(0.55, this.quality - 0.15);
        this.qLast = ts;
        this.qFrames = 60;
        this.resize(this.cssW, this.cssH);
      }
    }
    dt = Math.min(dt, 1 / 30);
    this.step(dt);
    this.render();
  };

  private step(rawDt: number) {
    this.frameDt = rawDt;
    if (this.mode === 'paused') return;
    let dt = rawDt;
    if (this.tsT > 0) {
      this.tsT -= rawDt;
      dt = rawDt * this.tsV;
    }
    this.shake = Math.max(0, this.shake - rawDt * 2.2);
    this.hurtA = Math.max(0, this.hurtA - rawDt * 1.6);
    this.flashA = Math.max(0, this.flashA - rawDt * 2.5);
    this.scorePop = Math.max(0, this.scorePop - rawDt * 4);
    this.rankFlash *= Math.max(0, 1 - rawDt * 2);
    this.dispScore += (this.score - this.dispScore) * Math.min(1, rawDt * 9);
    if (Math.abs(this.score - this.dispScore) < 1) this.dispScore = this.score;
    this.blink += rawDt;
    if (this.banner) {
      this.banner.t += rawDt;
      if (this.banner.t > 3.2) this.banner = null;
    }
    if (this.msg) {
      this.msg.t += rawDt;
      if (this.msg.t > this.msg.dur) this.msg = null;
    }
    if (this.mode === 'menu' || this.mode === 'playing') {
      // everyone in a room must run the same clock, or riders drift apart
      this.updateWorld(dt * (this.mp ? 1 : this.speedMul));
    } else {
      this.fx.update(dt);
    }
  }

  /* ------------------------------------------------------------ */
  /* world update                                                  */
  /* ------------------------------------------------------------ */
  private updateWorld(dt: number) {
    const P = this.P;
    this.time += dt;
    const pzPrev = P.pos + PLAYER_Z;
    if (this.phase === 'countdown') this.updateCountdown(dt);
    this.updatePlayer(dt);
    const pz = P.pos + PLAYER_Z;
    this.updateEnts(dt);
    if (!this.demo) {
      this.collide(pzPrev, pz);
      this.updatePunch(dt);
      this.updateCop(dt);
      this.updateRank();
      this.updateCombo(dt);
      if (this.phase === 'race') {
        this.raceTime += dt;
        this.score += (P.speed * dt) / 340;
        this.distance += (P.speed * dt) / 20000; // rough km
      }
      if (this.hintT > 0 && this.phase === 'race') this.hintT -= dt;
      if (this.promptT > 0) this.promptT -= dt;
    }
    if (this.mp) {
      this.spawnTraffic(!this.mp.isHost);
      this.mpTick(dt);
    } else {
      this.spawnTraffic();
    }
    this.updateZone();
    this.updateAmbient(dt);
    this.fx.update(dt);

    // phase transitions
    if (!this.demo) {
      if (this.phase === 'race' && pz >= this.track.finishZ) this.startFinish();
      if (this.phase === 'finish') {
        this.finT += dt;
        if (this.finT > 3.4) this.endRace();
      }
      if (this.phase === 'dead') {
        this.deadT -= dt;
        if (this.deadT <= 0) this.gameOver(this.deadReason);
      }
    }
    this.updateAudio();
  }

  private updateCountdown(dt: number) {
    const P = this.P;
    this.cd -= dt;
    if (this.input.throttle && this.cdPressed < 0) this.cdPressed = Math.max(0, this.cd);
    if (!this.input.throttle) this.cdPressed = -1;
    const n = this.cd > 1.6 ? 3 : this.cd > 0.8 ? 2 : this.cd > 0 ? 1 : 0;
    if (n !== this.cdNum) {
      this.cdNum = n;
      this.audio.beep(n);
    }
    if (this.cd <= 0) {
      this.phase = 'race';
      this.msg = { text: 'GO!', sub: '', color: '#7dff9b', t: 0, dur: 1.0 };
      this.flashA = 0.25;
      if (this.input.autoThrottle) {
        P.speed = MAX_SPEED * 0.16;
      } else if (this.cdPressed >= 0 && this.cdPressed <= 0.65) {
        P.speed = MAX_SPEED * 0.3;
        P.nitro = Math.min(100, P.nitro + 20);
        this.msg = { text: 'PERFECT LAUNCH!', sub: 'nitro +20', color: '#ffd23f', t: 0, dur: 1.4 };
        this.fx.float('+NITRO', this.W / 2, this.H * 0.62, '#4fd8ff', 22 * this.u);
        this.shake = Math.max(this.shake, 0.35);
      }
    }
  }

  private updatePlayer(dt: number) {
    const P = this.P;
    const inp = this.input;
    const seg = this.segAt(P.pos + PLAYER_Z);
    this.pSegCurve = seg.curve;
    const maxZ = this.segs.length * SEG_LEN - 700;

    if (this.demo) {
      this.demoT -= dt;
      if (this.demoT <= 0) {
        this.demoT = 0.35;
        const pz = P.pos + PLAYER_Z;
        let blocked = false;
        for (const o of this.ents) {
          if (o.kind === 'traffic' && o.dir > 0 && o.z > pz - 200 && o.z - pz < 3200 && Math.abs(o.x - this.demoLane) < 0.3) blocked = true;
        }
        if (blocked) this.demoLane = this.demoLane < -0.5 ? -0.25 : -0.75;
      }
      P.speed = lerp(P.speed, MAX_SPEED * 0.7, Math.min(1, dt * 1.2));
      const prevX = P.x;
      P.x += clamp(this.demoLane - P.x, -0.9 * dt, 0.9 * dt);
      P.steerV = (P.x - prevX) / Math.max(dt, 0.0001);
      P.lean = lerp(P.lean, clamp(P.steerV / 1.2 + seg.curve * 0.1, -1, 1), Math.min(1, dt * 8));
      P.pos += P.speed * dt;
      this.advanceBg(dt);
      if (P.pos + PLAYER_Z > this.track.finishZ - 3000) this.setupRace(1, true);
      return;
    }

    P.invuln = Math.max(0, P.invuln - dt);
    const sp = P.speed / MAX_SPEED;

    if (P.wipe > 0) {
      P.wipe -= dt;
      P.speed = Math.max(0, P.speed - MAX_SPEED * 1.3 * dt);
      P.x += P.wipeVx * dt;
      P.wipeVx *= Math.max(0, 1 - 1.4 * dt);
      P.wipeRot += P.wipeSpin * dt;
      P.hop += P.hopV * dt;
      P.hopV -= 5200 * dt;
      if (P.hop < 0) {
        P.hop = 0;
        P.hopV = Math.abs(P.hopV) > 700 ? Math.abs(P.hopV) * 0.35 : 0;
      }
      if (this.phase !== 'dead' && P.wipe <= 0) {
        // recover
        P.wipeRot = 0;
        P.hop = 0;
        P.hopV = 0;
        P.speed = MAX_SPEED * 0.2;
        P.x = clamp(P.x, -0.9, -0.1);
        P.invuln = 2.2;
        P.steerV = 0;
      }
      if (this.phase === 'dead') P.wipe = Math.max(P.wipe, 0.01);
    } else {
      const racing = this.phase === 'race';
      const finishing = this.phase === 'finish';
      let throttle = racing && inp.throttle;
      const brake = (racing && inp.brake) || finishing;
      if (this.phase === 'countdown') throttle = false;

      // nitro
      const want = racing && inp.nitro && P.nitro > 0 && P.speed > MAX_SPEED * 0.1;
      if (want && !P.nitroOn && P.nitro >= 6) {
        P.nitroOn = true;
        this.audio.nitro();
        this.shake = Math.max(this.shake, 0.3);
        this.flashA = Math.max(this.flashA, 0.15);
      }
      if (!want) P.nitroOn = false;
      if (P.nitroOn) {
        P.nitro -= NITRO_DRAIN * dt;
        if (P.nitro <= 0) {
          P.nitro = 0;
          P.nitroOn = false;
        }
      } else {
        P.nitro = Math.min(100, P.nitro + 1.2 * dt);
      }

      const cap = MAX_SPEED * (P.nitroOn ? 1.4 : 1);
      if (P.nitroOn) P.speed += ACCEL * 2.2 * dt;
      else if (throttle && !brake) P.speed += ACCEL * (1.05 - 0.6 * sp * sp) * dt;
      else if (brake) P.speed -= BRAKE * dt;
      else P.speed -= DECEL * dt;
      if (P.speed > cap) P.speed = Math.max(cap, P.speed - MAX_SPEED * 1.1 * dt);
      const off = Math.abs(P.x) > 1.05;
      if (off && P.speed > OFFROAD_LIMIT) P.speed = Math.max(OFFROAD_LIMIT, P.speed - OFFROAD_DECEL * dt);
      P.speed = clamp(P.speed, 0, MAX_SPEED * 1.45);

      // steering
      let steerIn = racing || this.phase === 'countdown' ? inp.steer : clamp(-P.x * 1.6, -1, 1);
      if (this.phase === 'countdown') steerIn = 0;
      const rate = 0.85 + 1.55 * clamp(sp, 0, 1.2);
      P.steerV += (steerIn * rate - P.steerV) * Math.min(1, dt * 13);
      P.x += P.steerV * dt;
      P.x -= dt * 2 * sp * sp * seg.curve * CENTRIF;
      P.lean = lerp(P.lean, clamp(P.steerV / 2.2 + seg.curve * 0.1 * sp, -1, 1), Math.min(1, dt * 10));

      if (off && sp > 0.15) {
        this.shake = Math.max(this.shake, 0.12 + sp * 0.12);
        if (Math.random() < 0.8) this.dust();
      }
    }
    P.x = clamp(P.x, -2.15, 2.15);
    P.pos = Math.min(P.pos + P.speed * dt, maxZ - PLAYER_Z);
    this.advanceBg(dt);
    const tgt = P.nitroOn ? 0.9 : 1;
    this.fovK = lerp(this.fovK, tgt, Math.min(1, dt * 6));
  }

  private advanceBg(dt: number) {
    const dPos = this.P.speed * dt;
    const c = this.pSegCurve;
    const k = (dPos / SEG_LEN) * c;
    this.bgOff[0] += 0.0012 * k;
    this.bgOff[1] += 0.0026 * k;
    this.bgOff[2] += 0.005 * k;
    if (this.bgFade < 1) this.bgFade = Math.min(1, this.bgFade + dt * 0.7);
  }

  private updateZone() {
    const seg = this.segAt(this.P.pos + PLAYER_Z);
    if (seg.zone !== this.lastZone) {
      this.lastZone = seg.zone;
      const z = ZONES[seg.zone];
      this.banner = { name: z.name, tag: z.tagline, t: 0 };
    }
  }

  private updateAmbient(dt: number) {
    const seg = this.segAt(this.P.pos + PLAYER_Z + 3000);
    const rain = ZONES[seg.zone].rain ? 1 : 0;
    this.rainA = lerp(this.rainA, rain, Math.min(1, dt * 0.8));
    // exhaust flames
    const P = this.P;
    if (!this.demo && P.nitroOn && P.wipe <= 0 && this.mode === 'playing') {
      const s = this.pS;
      for (let i = 0; i < 3; i++) {
        const side = i % 2 ? 1 : -1;
        this.fx.spawn(
          this.W / 2 + side * 20 * s * (0.9 + Math.random() * 0.2) + P.lean * 6 * s,
          this.pY - 6 * s,
          side * rand(10, 50) * this.u,
          rand(60, 190) * this.u,
          rand(0.18, 0.34),
          rand(2.5, 5) * s,
          Math.random() < 0.5 ? '#ffb02e' : Math.random() < 0.5 ? '#ff6a1f' : '#6fd3ff',
          'flame',
          0,
          9 * this.u,
          0,
        );
      }
    }
  }

  private dust() {
    const P = this.P;
    const z = ZONES[this.segAt(P.pos + PLAYER_Z).zone];
    const s = this.pS;
    const col = z.grass[0];
    for (let i = 0; i < 2; i++) {
      this.fx.spawn(
        this.W / 2 + rand(-18, 18) * s,
        this.pY - rand(0, 6) * s,
        rand(-70, 70) * this.u,
        rand(-120, -30) * this.u,
        rand(0.3, 0.6),
        rand(3, 7) * s,
        col,
        'circle',
        160 * this.u,
        10 * this.u,
        1.5,
      );
    }
  }

  private updateAudio() {
    const P = this.P;
    const playing = this.mode === 'playing' && !this.demo && this.phase !== 'dead';
    const sp = P.speed / MAX_SPEED;
    this.audio.setEngine(sp, this.input.throttle ? 1 : 0, P.nitroOn, playing || this.phase === 'dead' ? true : false);
    if (this.cop && this.cop.state !== 'down' && this.mode === 'playing') {
      const gap = Math.abs(P.pos + PLAYER_Z - this.cop.z);
      this.audio.setSiren(clamp(1 - gap / 10000, 0.1, 1));
    } else this.audio.setSiren(0);
  }

  /* ------------------------------------------------------------ */
  /* entities                                                      */
  /* ------------------------------------------------------------ */
  private updateEnts(dt: number) {
    const pz = this.P.pos + PLAYER_Z;
    const maxZ = this.segs.length * SEG_LEN - 400;
    const peerWorld = !!this.mp && !this.mp.isHost;
    for (const e of this.ents) {
      if (!e.alive) continue;
      if (e.kind === 'remote') {
        // position comes from the network; nothing to simulate locally
        if (e.z < pz - 4200) this.kill(e);
        continue;
      }
      if (peerWorld && (e.kind === 'traffic' || e.kind === 'rival')) {
        // host-authoritative entities: extrapolate between snapshots
        e.zPrev = e.z;
        e.z += e.speed * (e.kind === 'traffic' ? e.dir : 1) * dt;
        if (e.state === 'down') {
          e.rot += e.spin * dt;
          e.hop += e.hopV * dt;
          e.hopV -= 5200 * dt;
          if (e.hop < 0) {
            e.hop = 0;
            e.hopV = 0;
          }
        }
        this.moveEnt(e, e.z);
        continue;
      }
      if (e.kind === 'traffic') {
        e.zPrev = e.z;
        let v = e.vmax;
        if (e.dir > 0) {
          for (const o of this.ents) {
            if (o === e || !o.alive || o.dir < 0 || o.kind === 'pickup') continue;
            if (o.kind !== 'traffic' && o.state === 'down') continue;
            const dz = o.z - e.z;
            if (dz > 0 && dz < 900 && Math.abs(o.x - e.x) < (o.w + e.w) / 2 + 0.04) v = Math.min(v, o.speed * 0.98);
          }
        }
        e.speed += clamp(v - e.speed, -3000 * dt, 1500 * dt);
        const nz = e.z + e.speed * e.dir * dt;
        if (nz < pz - 3400 || nz > maxZ) {
          this.kill(e);
          continue;
        }
        this.moveEnt(e, nz);
      } else if (e.kind === 'pickup') {
        e.zPrev = e.z;
        if (e.z < pz - 3000) this.kill(e);
      } else {
        this.updateFighter(e, dt, pz, maxZ);
      }
    }
    this.flush();
  }

  private laneFree(x: number, z: number, self: Ent): boolean {
    for (const o of this.ents) {
      if (o === self || !o.alive || o.kind === 'pickup' || o.dir < 0) continue;
      if (o.kind !== 'traffic' && o.state === 'down') continue;
      const dz = o.z - z;
      if (dz > -650 && dz < 1900 && Math.abs(o.x - x) < (o.w + self.w) / 2 + 0.09) return false;
    }
    return true;
  }

  private updateFighter(e: Ent, dt: number, pz: number, maxZ: number) {
    const P = this.P;
    const isCop = e.kind === 'cop';
    e.zPrev = e.z;
    e.invuln = Math.max(0, e.invuln - dt);
    e.flash = Math.max(0, e.flash - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.laneCd = Math.max(0, e.laneCd - dt);

    if (e.state === 'down') {
      e.t -= dt;
      e.speed = Math.max(0, e.speed - MAX_SPEED * 1.1 * dt);
      e.rot += e.spin * dt;
      e.hop += e.hopV * dt;
      e.hopV -= 5200 * dt;
      if (e.hop < 0) {
        e.hop = 0;
        e.hopV = Math.abs(e.hopV) > 700 ? Math.abs(e.hopV) * 0.35 : 0;
      }
      e.x = clamp(e.x + e.targetX * dt, -1.6, 1.6);
      e.targetX *= Math.max(0, 1 - 1.2 * dt);
      this.moveEnt(e, Math.min(e.z + e.speed * dt, maxZ));
      if (e.t <= 0) {
        if (isCop) {
          this.kill(e);
          this.cop = null;
          this.copCd = 28;
        } else {
          e.state = 'ride';
          e.hp = e.maxHp;
          e.invuln = 1.4;
          e.rot = 0;
          e.hop = 0;
          e.speed = MAX_SPEED * 0.25;
          e.engage = false;
          e.x = clamp(e.x, XMIN, XMAX);
          e.targetX = e.x;
          e.cd = 1.5;
        }
      }
      return;
    }

    const dz = e.z - pz; // + => ahead of player
    const dxp = P.x - e.x;
    const lo = isCop ? -0.96 : XMIN;
    let vT = e.vmax;
    if (!isCop) vT *= 1 + clamp(-dz / 30000, -0.07, 0.16);
    if (this.phase === 'countdown') vT = 0;
    if (e.finished || e.z >= this.track.finishZ) {
      e.finished = true;
      vT = 0;
    }

    // decide whether to engage
    e.engageT -= dt;
    if (e.engageT <= 0) {
      e.engageT = rand(2.2, 4.2);
      e.engage = Math.abs(dz) < 1700 && Math.abs(dxp) < 1.1 && Math.random() < e.aggr;
    }
    if (isCop) e.engage = Math.abs(dz) < 3000;
    const canFight = !this.demo && P.wipe <= 0 && this.phase === 'race' && !e.finished;

    if (e.engage && canFight) {
      const side = e.x <= P.x ? -1 : 1;
      e.targetX = clamp(P.x + side * 0.36, lo, XMAX);
      const want = P.speed + clamp(-dz * 1.6, -2200, 2200);
      vT = clamp(want, 0, e.vmax * (isCop ? 1.02 : 1.12));
    }

    // traffic avoidance
    let blk: Ent | null = null;
    let bd = 1e9;
    for (const o of this.ents) {
      if (o === e || !o.alive || o.kind === 'pickup' || o.dir < 0) continue;
      if (o.kind !== 'traffic' && o.state === 'down') continue;
      const d = o.z - e.z;
      if (d > 0 && d < 1500 && Math.abs(o.x - e.x) < (o.w + e.w) / 2 + 0.1 && d < bd) {
        bd = d;
        blk = o;
      }
    }
    if (blk) {
      const gap = bd - (blk.len + e.len) / 2;
      if (e.laneCd <= 0) {
        e.laneCd = 0.7;
        const cands = [-0.8, -0.52, -0.25];
        let bestX = e.targetX;
        let bestD = 9;
        for (const cx of cands) {
          if (Math.abs(cx - e.x) < 0.12) continue;
          if (this.laneFree(cx, e.z, e) && Math.abs(cx - e.x) < bestD) {
            bestD = Math.abs(cx - e.x);
            bestX = cx;
          }
        }
        if (bestX !== e.targetX) e.targetX = bestX;
      }
      if (gap < 1000) vT = Math.min(vT, blk.speed * 0.99 + Math.max(0, gap - 260) * 2);
      if (gap < 260) vT = Math.min(vT, blk.speed * 0.9);
    } else if (!e.engage && e.laneCd <= 0 && Math.random() < 0.25 * dt) {
      e.laneCd = 1.5;
      const cx = pick([-0.78, -0.5, -0.26]);
      if (this.laneFree(cx, e.z, e)) e.targetX = cx;
    }

    const acc = vT > e.speed ? ACCEL * 0.85 : BRAKE * 0.8;
    e.speed += clamp(vT - e.speed, -acc * dt, acc * dt);
    e.x += clamp(e.targetX - e.x, -0.85 * dt, 0.85 * dt);
    e.x = clamp(e.x, isCop ? -0.98 : XMIN - 0.05, XMAX + 0.05);

    // melee
    if (e.state === 'ride') {
      if (canFight && e.engage && e.cd <= 0 && dz > -260 && dz < 340 && P.invuln <= 0.2) {
        const adx = Math.abs(dxp);
        if (adx < 0.7 && adx > 0.06) {
          e.state = 'windup';
          e.t = isCop ? 0.5 : Math.max(0.32, 0.55 - this.level * 0.025);
          e.side = dxp < 0 ? -1 : 1;
          e.pose = e.side < 0 ? 1 : 2;
        }
      }
    } else if (e.state === 'windup') {
      e.t -= dt;
      if (!canFight) {
        e.state = 'ride';
        e.pose = 0;
      } else if (e.t <= 0) {
        e.state = 'swing';
        e.t = 0.16;
        const hitDx = (P.x - e.x) * e.side;
        if (dz > -300 && dz < 380 && hitDx > 0.02 && hitDx < 0.85) {
          const dmg = isCop ? 13 : Math.min(14, 6 + this.level * 0.8);
          if (this.hurtPlayer(Math.round(dmg))) {
            P.x += e.side * 0.2;
            P.steerV += e.side * 1.6;
            P.speed *= 0.95;
            this.msg = null;
            this.fx.float(isCop ? 'BATON!' : e.name + '!', this.W / 2 + e.side * 70 * this.u, this.H * 0.56, '#ff6b5c', 20 * this.u);
          }
        }
      }
    } else if (e.state === 'swing') {
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 'ride';
        e.pose = 0;
        e.cd = rand(1.3, 2.8) * (isCop ? 0.8 : 1);
      }
    }

    this.moveEnt(e, Math.min(e.z + e.speed * dt, maxZ));
  }

  /* ------------------------------------------------------------ */
  /* spawning                                                      */
  /* ------------------------------------------------------------ */
  /**
   * pickupsOnly: guests take traffic from the host, but pickups are purely
   * local (they only affect the collector), so they are spawned client-side.
   */
  private spawnTraffic(pickupsOnly = false) {
    const pz = this.P.pos + PLAYER_Z;
    const ahead = this.drawDist * SEG_LEN + 3500;
    const stop = this.track.finishZ - 3500;
    let guard = 0;
    while (this.nextSpawn < pz + ahead && this.nextSpawn < stop && guard++ < 60) {
      const z = this.nextSpawn;
      const zone = ZONES[this.segAt(z).zone];
      this.nextSpawn += zone.gap * rand(0.6, 1.4) * (this.demo ? 1.4 : 1) / (this.demo ? 1 : this.diff.traffic);
      if (pickupsOnly) {
        if (Math.random() < 0.45) this.spawnPickups(z);
      } else if (Math.random() < 0.2) this.spawnPickups(z);
      else this.spawnVehicle(z, zone.oncoming);
    }
  }

  private laneClear(x: number, z: number): boolean {
    let occupied = 0;
    for (const o of this.ents) {
      if (o.kind === 'pickup') continue;
      if (Math.abs(o.z - z) < 2200) {
        if (Math.abs(o.x - x) < 0.3 && Math.abs(o.z - z) < 1800) return false;
        occupied++;
      }
    }
    return occupied < 3;
  }

  private spawnVehicle(z: number, oncomingP: number) {
    const oncoming = Math.random() < oncomingP && !this.demo;
    const lane = (oncoming ? pick([0.25, 0.75]) : pick([-0.75, -0.25])) + rand(-0.04, 0.04);
    if (!this.laneClear(lane, z)) return;
    const r = Math.random();
    const e = this.newEnt('traffic', z, lane);
    e.dir = oncoming ? -1 : 1;
    const fr = oncoming ? 'f' : 'r';
    let base = oncoming ? rand(3600, 5600) : lane < -0.5 ? rand(2600, 3800) : rand(3600, 5000);
    if (r < 0.17) {
      e.spr = `${Math.random() < 0.6 ? 'bus' : 'bus2'}_${fr}`;
      e.w = 0.48;
      e.len = 430;
      base *= 0.92;
    } else if (r < 0.5) {
      e.spr = `car_${fr}${randInt(0, 3)}`;
      e.w = 0.42;
      e.len = 300;
    } else if (r < 0.7) {
      e.spr = `${Math.random() < 0.6 ? 'auto' : 'auto2'}_${fr}`;
      e.w = 0.31;
      e.len = 220;
      base *= 0.85;
    } else if (r < 0.85) {
      e.spr = `lorry_${fr}${randInt(0, 2)}`;
      e.w = 0.48;
      e.len = 470;
      base *= 0.8;
    } else {
      e.spr = `moto_${fr}${randInt(0, 2)}`;
      e.w = 0.2;
      e.len = 170;
      base *= 1.12;
    }
    e.vmax = base;
    e.speed = base;
    this.addEnt(e);
  }

  private spawnPickups(z: number) {
    const r = Math.random();
    const hpLow = this.P.hp < 80;
    let kind: PickupKind = 'rupee';
    if (r < 0.1) kind = 'coconut';
    else if (r < (hpLow ? 0.3 : 0.15)) kind = 'banana';
    else if (r < (hpLow ? 0.34 : 0.19)) kind = 'stick';
    const lane = pick([-0.75, -0.25, -0.75, -0.25, 0.25, 0.75]);
    const count = kind === 'rupee' ? 5 : 1;
    for (let i = 0; i < count; i++) {
      const e = this.newEnt('pickup', z + i * 520, lane);
      e.pk = kind;
      e.spr = 'pk_' + kind;
      e.w = 0.3;
      e.len = 220;
      this.addEnt(e);
    }
  }

  private spawnCop() {
    const P = this.P;
    const pz = P.pos + PLAYER_Z;
    const e = this.newEnt('cop', Math.max(400, pz - 6500), -0.5);
    e.name = 'POLICE';
    e.maxHp = Math.min(8, 4 + this.level);
    e.hp = e.maxHp;
    e.w = 0.2;
    e.len = 150;
    e.speed = Math.max(P.speed, MAX_SPEED * 0.6);
    e.vmax = MAX_SPEED * Math.min(1.1, 1.04 + this.level * 0.008);
    e.aggr = 1;
    e.engage = true;
    this.addEnt(e);
    this.cop = e;
    this.msg = { text: 'POLICE CHASE!', sub: 'Knock him off — or outrun him', color: '#59a8ff', t: 0, dur: 2.4 };
    this.flashA = 0.2;
    this.audio.horn();
  }

  private updateCop(dt: number) {
    if (this.phase !== 'race') return;
    const P = this.P;
    const pz = P.pos + PLAYER_Z;
    if (!this.cop) {
      this.copCd -= dt;
      if (this.copCd <= 0 && this.raceTime > 10 && pz < this.track.finishZ - 20000) this.spawnCop();
    } else if (this.cop.state !== 'down' && pz - this.cop.z > 12500) {
      this.award(300, 'COP SHAKEN!');
      this.kill(this.cop);
      this.cop = null;
      this.copCd = 26;
    }
  }

  /* ------------------------------------------------------------ */
  /* collisions & combat                                           */
  /* ------------------------------------------------------------ */
  private collide(pzPrev: number, pz: number) {
    const P = this.P;
    if (this.phase === 'dead') return;
    const canHit = P.invuln <= 0 && P.wipe <= 0 && this.phase === 'race';

    for (const e of this.ents) {
      if (!e.alive) continue;
      if (e.kind === 'rival' || e.kind === 'cop' || e.kind === 'remote') {
        if (e.state === 'down' || P.wipe > 0) continue;
        const h = (e.len + P_LEN) / 2;
        const dz = e.z - pz;
        const dzPrev = e.zPrev - pzPrev;
        if (Math.min(dz, dzPrev) > h || Math.max(dz, dzPrev) < -h) continue;
        const dx = P.x - e.x;
        const reach = (e.w + P_W) / 2;
        if (Math.abs(dx) < reach) {
          const dir = dx < 0 ? -1 : 1;
          const ov = reach - Math.abs(dx);
          P.x += dir * ov * 0.55;
          e.x = clamp(e.x - dir * ov * 0.45, -0.98, XMAX + 0.05);
          if (dzPrev >= h * 0.8 && P.speed > e.speed) {
            P.speed = lerp(P.speed, e.speed, 0.7);
            this.audio.bump();
            this.shake = Math.max(this.shake, 0.25);
            e.flash = 0.1;
          }
        }
        continue;
      }
      const h = (e.len + P_LEN) / 2;
      const dz = e.z - pz;
      const dzPrev = e.zPrev - pzPrev;
      const lo = Math.min(dz, dzPrev);
      const hi = Math.max(dz, dzPrev);
      if (hi < -h || lo > h) {
        if (e.kind === 'traffic' && !e.passed && hi < -h) e.passed = true;
        continue;
      }
      const dx = P.x - e.x;
      const adx = Math.abs(dx);
      const reach = (e.w + (e.kind === 'pickup' ? 0.1 : P_W)) / 2;

      if (e.kind === 'pickup') {
        if (adx < reach + 0.08 && P.wipe <= 0) this.collect(e);
        continue;
      }
      // traffic
      if (adx < reach) {
        if (!canHit) continue;
        const rel = P.speed - e.speed * e.dir;
        const frontal = dzPrev >= h * 0.7 || e.dir < 0;
        if (frontal) {
          if (e.dir < 0 || rel > MAX_SPEED * 0.3) {
            const dmg = Math.round(12 + clamp(rel / MAX_SPEED, 0, 1.4) * 22);
            this.crashPlayer(dmg, e);
            e.speed *= 0.7;
          } else {
            P.speed = Math.min(P.speed, e.speed * 0.95);
            P.pos = Math.min(P.pos, e.z - h - PLAYER_Z - 5);
            this.hurtPlayer(4);
            this.audio.bump();
            this.shake = Math.max(this.shake, 0.4);
            this.sparks(this.W / 2, this.pY - 20 * this.pS, 8);
          }
        } else {
          const dir = dx < 0 ? -1 : 1;
          P.x += dir * (reach - adx + 0.03);
          P.steerV += dir * 1.2;
          P.speed *= 0.985;
          this.audio.bump();
          this.shake = Math.max(this.shake, 0.3);
          this.sparks(this.W / 2 + dir * -14 * this.pS, this.pY - 24 * this.pS, 5);
          if (this.hurtPlayer(2)) this.comboCount = 0;
        }
      } else if (!e.passed && dz <= 0 && P.wipe <= 0 && this.phase === 'race') {
        e.passed = true;
        const gap = adx - reach;
        const rel = P.speed - e.speed * e.dir;
        if (gap < 0.17 && rel > MAX_SPEED * 0.4) {
          this.bumpCombo();
          this.award(e.dir < 0 ? 90 : 50, e.dir < 0 ? 'CLOSE CALL' : 'NEAR MISS');
          P.nitro = Math.min(100, P.nitro + (e.dir < 0 ? 6 : 3));
          this.audio.nearMiss(e.dir < 0);
        }
      }
    }

    // roadside solid scenery
    if (Math.abs(P.x) > 1.0 && canHit) {
      const n = this.segs.length;
      const i0 = Math.floor(pzPrev / SEG_LEN);
      const i1 = Math.floor(pz / SEG_LEN);
      for (let i = i0; i <= i1; i++) {
        const seg = this.segs[((i % n) + n) % n];
        for (const sp of seg.sprites) {
          if (!sp.solid) continue;
          if (Math.abs(P.x - sp.x) < sp.hit + 0.09) {
            sp.solid = false;
            const dmg = Math.round(14 + (P.speed / MAX_SPEED) * 14);
            P.x = sp.x - Math.sign(sp.x) * 0.3;
            this.crashPlayer(dmg, null);
            this.burst(this.W / 2, this.pY - 40 * this.pS, 14, ['#6b8f3a', '#8b5e34', '#cfe8a0'], 260 * this.u, 0.8, 4 * this.u, 'square', 500 * this.u);
            return;
          }
        }
      }
    }
  }

  private collect(e: Ent) {
    const P = this.P;
    const sx = this.W / 2;
    const sy = this.pY - 70 * this.pS;
    switch (e.pk) {
      case 'rupee':
        this.score += 100;
        this.scorePop = 1;
        P.nitro = Math.min(100, P.nitro + 2);
        this.fx.float('+₹100', sx + rand(-40, 40) * this.u, sy, '#8dffb0', 17 * this.u);
        this.burst(sx, sy + 30 * this.u, 6, ['#ffe08a', '#7bd88f', '#ffffff'], 150 * this.u, 0.45, 3 * this.u, 'star', 120 * this.u);
        break;
      case 'coconut':
        P.nitro = Math.min(100, P.nitro + 42);
        this.fx.float('ELANEER! +NITRO', sx, sy, '#7df0ff', 22 * this.u);
        this.burst(sx, sy + 30 * this.u, 14, ['#c9ee79', '#5d9a2a', '#ffffff'], 240 * this.u, 0.7, 4 * this.u, 'circle', 360 * this.u);
        break;
      case 'banana':
        P.hp = Math.min(100, P.hp + 24);
        this.fx.float('PAZHAM! +HP', sx, sy, '#ffe35a', 22 * this.u);
        this.burst(sx, sy + 30 * this.u, 12, ['#ffe35a', '#f7d23a', '#fff6b0'], 220 * this.u, 0.7, 4 * this.u, 'star', 260 * this.u);
        break;
      case 'stick':
        P.weapon = 7;
        this.fx.float('CHENDA KOL! 2x DAMAGE', sx, sy, '#ffcf6b', 22 * this.u);
        this.burst(sx, sy + 30 * this.u, 12, ['#f4c542', '#a8662a', '#ffffff'], 220 * this.u, 0.7, 4 * this.u, 'star', 260 * this.u);
        break;
      default:
        break;
    }
    this.audio.pickup(e.pk);
    this.vib(12);
    this.kill(e);
  }

  private hurtPlayer(amountRaw: number): boolean {
    const P = this.P;
    if (this.demo || P.invuln > 0 || P.wipe > 0 || this.phase === 'dead') return false;
    const amount = Math.max(1, Math.round(amountRaw * (this.demo ? 1 : this.diff.dmgIn)));
    P.hp -= amount;
    this.hurtA = 1;
    this.shake = Math.max(this.shake, 0.55);
    this.comboCount = 0;
    this.comboT = 0;
    this.mult = 1;
    this.audio.hurt();
    this.vib(40);
    this.fx.float('-' + amount, this.W / 2 + rand(-30, 30) * this.u, this.H * 0.5, '#ff5a4d', 24 * this.u);
    this.sparks(this.W / 2, this.pY - 70 * this.pS, 6);
    if (P.hp <= 0) {
      P.hp = 0;
      this.die('wasted');
    }
    return true;
  }

  private crashPlayer(dmg: number, other: Ent | null) {
    const P = this.P;
    if (P.invuln > 0 || P.wipe > 0 || this.phase === 'dead') return;
    P.hp -= dmg;
    this.hurtA = 1;
    this.shake = 1;
    this.flashA = 0.5;
    this.comboCount = 0;
    this.comboT = 0;
    this.mult = 1;
    this.audio.crash();
    this.vib(140);
    this.tsV = 0.25;
    this.tsT = 0.14;
    this.fx.float('-' + dmg, this.W / 2, this.H * 0.5, '#ff5a4d', 28 * this.u);
    this.sparks(this.W / 2, this.pY - 30 * this.pS, 26);
    this.burst(this.W / 2, this.pY - 50 * this.pS, 12, ['#ffb02e', '#ff6a1f', '#fff1a8'], 380 * this.u, 0.6, 4 * this.u, 'star', 500 * this.u);
    if (other) this.msg = { text: other.dir < 0 ? 'HEAD-ON!' : 'WIPEOUT!', sub: '', color: '#ff7a59', t: 0, dur: 1.2 };
    P.wipe = 1.55;
    P.wipeRot = 0;
    P.wipeSpin = (Math.random() < 0.5 ? -1 : 1) * rand(6, 9);
    P.wipeVx = rand(-0.7, 0.7);
    P.hop = 0;
    P.hopV = 1900;
    P.nitroOn = false;
    P.speed *= 0.55;
    if (P.hp <= 0) {
      P.hp = 0;
      this.die('wasted');
    }
  }

  private die(reason: 'wasted' | 'disqualified') {
    const P = this.P;
    this.phase = 'dead';
    this.deadReason = reason;
    this.deadT = 1.9;
    if (P.wipe <= 0) {
      P.wipe = 1.9;
      P.wipeSpin = rand(6, 9);
      P.hopV = 1900;
      P.speed *= 0.6;
    }
    this.msg = { text: 'WASTED', sub: '', color: '#ff4d4d', t: 0, dur: 3 };
    this.audio.wasted();
    this.vib(250);
    this.tsV = 0.35;
    this.tsT = 0.6;
    this.shake = 1;
  }

  private updatePunch(dt: number) {
    const P = this.P;
    P.punchCd = Math.max(0, P.punchCd - dt);
    if (P.punchT > 0) {
      P.punchT -= dt;
      const prog = 1 - P.punchT / PUNCH_DUR;
      if (!P.punchHit && prog >= 0.3) {
        P.punchHit = true;
        this.resolvePunch();
      }
      if (P.punchT <= 0) {
        P.punchT = 0;
        P.punchCd = 0.04;
      }
    }
    if (P.punchT <= 0 && P.punchCd <= 0 && P.wipe <= 0 && this.phase === 'race') {
      const s = this.input.consumePunch();
      if (s !== 0) {
        P.punchSide = s;
        P.punchT = PUNCH_DUR;
        P.punchHit = false;
        this.audio.swing();
        if (!this.seenHints) {
          this.seenHints = true;
          markSeenHints();
          this.hintT = Math.min(this.hintT, 1.5);
        }
      }
    } else if (this.phase !== 'race') {
      this.input.consumePunch();
    }

    // prompt for first-time players
    if (!this.seenHints && this.phase === 'race' && P.wipe <= 0) {
      const pz = P.pos + PLAYER_Z;
      for (const e of this.rivals) {
        if (e.state === 'down') continue;
        const dz = e.z - pz;
        const dx = e.x - P.x;
        if (Math.abs(dz) < 450 && Math.abs(dx) > 0.05 && Math.abs(dx) < 0.7) {
          this.promptSide = dx < 0 ? -1 : 1;
          this.promptT = 0.25;
          break;
        }
      }
    }
  }

  private resolvePunch() {
    const P = this.P;
    const side = P.punchSide;
    const pz = P.pos + PLAYER_Z;
    const reachZ = P.weapon > 0 ? 540 : 430;
    const reachX = P.weapon > 0 ? 0.95 : 0.8;
    let best: Ent | null = null;
    let bestS = 1e9;
    for (const e of this.ents) {
      if (!e.alive || (e.kind !== 'rival' && e.kind !== 'cop' && e.kind !== 'remote') || e.state === 'down') continue;
      const dz = e.z - pz;
      if (dz > reachZ || dz < -reachZ * 0.65) continue;
      const dx = (e.x - P.x) * side;
      if (dx < 0.02 || dx > reachX) continue;
      const sc = Math.abs(dz) + dx * 400;
      if (sc < bestS) {
        bestS = sc;
        best = e;
      }
    }
    if (!best) return;
    if (best.kind === 'remote') this.hitRemote(best, side);
    else this.hitFighter(best, side);
  }

  /** Punching another human rider: effects here, damage decided by the victim. */
  private hitRemote(e: Ent, side: -1 | 1) {
    const P = this.P;
    const mp = this.mp;
    const sp = this.screenOf(e) || { x: this.W / 2 + side * 80 * this.u, y: this.H * 0.6, sc: 1 };
    const cy = sp.y - 60 * this.u;
    this.burst(sp.x, cy, 10, ['#ffffff', '#ffd23f', '#ff8a00'], 330 * this.u, 0.4, 5 * this.u, 'star', 200 * this.u);
    this.fx.float(pick(['POW!', 'WHAM!', 'THWACK!', 'BAM!']), sp.x, cy - 10 * this.u, '#ffd23f', 24 * this.u);
    this.audio.punch();
    this.shake = Math.max(this.shake, 0.3);
    this.tsV = 0.1;
    this.tsT = 0.05;
    this.vib(18);
    this.bumpCombo();
    this.award(60, '');
    P.nitro = Math.min(100, P.nitro + 3);
    e.flash = 0.2;
    if (mp && e.pid) this.net?.send({ t: 'punch', from: mp.localPid, name: this.settings.name, target: e.pid, side });
  }

  private hitFighter(e: Ent, side: -1 | 1) {
    const P = this.P;
    const dmg = P.weapon > 0 ? 2 : 1;
    if (P.weapon > 0) {
      P.weapon--;
      if (P.weapon === 0) this.fx.float('KOL BROKEN', this.W / 2, this.H * 0.5, '#ffcf6b', 18 * this.u);
    }
    e.hp -= dmg;
    e.flash = 0.2;
    e.x = clamp(e.x + side * 0.14, e.kind === 'cop' ? -0.98 : XMIN - 0.05, XMAX + 0.05);
    e.speed *= 0.92;
    if (e.state === 'windup') {
      e.state = 'ride';
      e.pose = 0;
      e.cd = rand(1, 2);
    }
    const sp = this.screenOf(e) || { x: this.W / 2 + side * 80 * this.u, y: this.H * 0.6, sc: 1 };
    const cy = sp.y - 60 * this.u;
    this.burst(sp.x, cy, 10, ['#ffffff', '#ffd23f', '#ff8a00'], 330 * this.u, 0.4, 5 * this.u, 'star', 200 * this.u);
    this.fx.float(pick(['POW!', 'WHAM!', 'THWACK!', 'BAM!']), sp.x, cy - 10 * this.u, '#ffd23f', 24 * this.u);
    this.audio.punch();
    this.shake = Math.max(this.shake, 0.3);
    this.tsV = 0.1;
    this.tsT = 0.05;
    this.vib(18);
    this.bumpCombo();
    this.award(60, '');
    P.nitro = Math.min(100, P.nitro + 3);
    if (e.hp <= 0) this.takedown(e, side);
  }

  private takedown(e: Ent, side: -1 | 1) {
    const isCop = e.kind === 'cop';
    e.state = 'down';
    e.pose = 0;
    e.t = isCop ? 2.2 : 2.5;
    e.spin = side * rand(7, 11);
    e.rot = 0;
    e.hop = 0;
    e.hopV = 2000;
    e.targetX = side * 0.5;
    this.takedownsRace++;
    this.takedownsRun++;
    this.bumpCombo();
    this.award(isCop ? 1500 : 500, isCop ? 'COP DOWN!' : e.name + ' WASTED!');
    this.P.nitro = Math.min(100, this.P.nitro + 15);
    if (!isCop) this.copCd -= 5;
    this.audio.takedown();
    this.tsV = 0.3;
    this.tsT = 0.28;
    this.shake = Math.max(this.shake, 0.7);
    this.flashA = 0.3;
    const sp = this.screenOf(e) || { x: this.W / 2, y: this.H * 0.6, sc: 1 };
    this.burst(sp.x, sp.y - 40 * this.u, 26, ['#ffb02e', '#ff6a1f', '#fff1a8', '#ffffff'], 520 * this.u, 0.8, 5 * this.u, 'line', 420 * this.u);
    this.burst(sp.x, sp.y - 40 * this.u, 12, ['#ffd23f', '#ff4d6d', '#ffffff'], 420 * this.u, 0.9, 6 * this.u, 'star', 300 * this.u);
    this.vib(60);
  }

  private bumpCombo() {
    this.comboCount++;
    this.comboT = 4.4;
    const m = Math.min(8, 1 + Math.floor(this.comboCount / 3));
    if (m > this.mult) {
      this.mult = m;
      this.audio.combo(m);
      this.fx.float('COMBO x' + m + '!', this.W / 2, this.H * 0.34, '#ff9f1c', 26 * this.u);
    }
    this.mult = m;
  }

  private updateCombo(dt: number) {
    if (this.comboCount > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.comboCount = 0;
        this.mult = 1;
      }
    }
  }

  private award(base: number, label: string) {
    const pts = Math.round(base * this.mult);
    this.score += pts;
    this.scorePop = 1;
    if (label) {
      this.fx.float(`${label} +${pts}`, this.W / 2 + rand(-20, 20) * this.u, this.H * 0.42, '#fff3b0', 20 * this.u);
    }
  }

  private updateRank() {
    const pz = this.P.pos + PLAYER_Z;
    let r = 1;
    for (const e of this.rivals) if (e.z > pz) r++;
    if (this.mp) for (const rd of this.mp.riders) if (rd.pid !== this.mp!.localPid && rd.ent && rd.ent.z > pz) r++;
    if (r !== this.rank) {
      if (this.phase === 'race') {
        if (r < this.rank) {
          this.rankFlash = 1;
          this.audio.overtake();
          this.fx.float('P' + r, this.W * 0.14, this.H * 0.2, '#7dff9b', 22 * this.u);
        } else this.rankFlash = -1;
      }
      this.rank = r;
    }
  }

  /* ------------------------------------------------------------ */
  /* race flow                                                     */
  /* ------------------------------------------------------------ */
  private startFinish() {
    this.phase = 'finish';
    this.finT = 0;
    this.finishPos = this.rank;
    const mp = this.mp;
    if (mp) {
      mp.finished = true;
      this.net?.send({
        t: 'finish',
        from: mp.localPid,
        name: this.settings.name,
        z: Math.round(this.P.pos + PLAYER_Z),
        timeSec: Math.round(this.raceTime * 100) / 100,
        score: Math.round(this.score),
        takedowns: this.takedownsRace,
      });
      if (mp.isHost) {
        const me = mp.riders.find((r) => r.pid === mp.localPid);
        if (me && !mp.finishOrder.some((f) => f.pid === me.pid)) {
          mp.finishOrder.push({
            pid: me.pid,
            name: this.settings.name,
            color: me.color,
            timeSec: this.raceTime,
            score: Math.round(this.score),
            takedowns: this.takedownsRace,
            isAi: false,
          });
        }
        this.mpBroadcastResults();
      }
    }
    const win = this.rank <= 3;
    // in a room nobody is eliminated, so never show the "too slow" warning
    const ok = !!this.mp || this.rank <= QUALIFY;
    this.audio.finish(ok);
    const ord = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH', '10TH'];
    this.msg = {
      text: 'FINISH!',
      sub: (ord[this.rank - 1] || this.rank + 'TH') + ' PLACE' + (ok ? '' : ' — TOO SLOW'),
      color: ok ? '#ffd23f' : '#ff7a59',
      t: 0,
      dur: 3.4,
    };
    this.flashA = 0.4;
    if (ok) {
      for (let i = 0; i < (win ? 120 : 60); i++) {
        const cols = ['#ff9f1c', '#ffd23f', '#ffffff', '#ff5d8f', '#7dff9b'];
        this.fx.spawn(
          rand(0, this.W),
          rand(-this.H * 0.3, 0),
          rand(-60, 60) * this.u,
          rand(40, 160) * this.u,
          rand(1.6, 3),
          rand(4, 8) * this.u,
          cols[i % cols.length],
          'petal',
          120 * this.u,
          0,
          0.3,
        );
      }
    }
  }

  private endRace() {
    const P = this.P;
    const pos = this.finishPos;
    const qualified = pos <= QUALIFY;
    const lvMul = 1 + (this.level - 1) * 0.25;
    const positionBonus = Math.round((POS_BONUS[pos - 1] ?? 10) * lvMul);
    const healthBonus = Math.round(P.hp * 10);
    const cashBonus = this.takedownsRace * 250;
    const raceScore = positionBonus + healthBonus + cashBonus;
    this.score += qualified ? raceScore : positionBonus;
    this.dispScore = this.score;
    if (this.mp) {
      // multiplayer: everyone races on, standings decide the table
      const mp = this.mp;
      if (!mp.results.length) mp.results = this.mpBuildResults();
      const mine = mp.results.find((r) => r.pid === mp.localPid);
      this.setMode('result');
      this.hooks.onResult({
        level: this.level,
        position: mine ? mine.pos : pos,
        qualified: true,
        total: mp.total,
        timeSec: this.raceTime,
        takedowns: this.takedownsRace,
        positionBonus,
        healthBonus,
        cashBonus,
        raceScore,
        score: Math.round(this.score),
      });
      this.hooks.onMpResults?.(mp.results);
      return;
    }
    if (!qualified) {
      this.gameOver('disqualified');
      return;
    }
    this.setMode('result');
    this.hooks.onResult({
      level: this.level,
      position: pos,
      qualified,
      total: TOTAL_RACERS,
      timeSec: this.raceTime,
      takedowns: this.takedownsRace,
      positionBonus,
      healthBonus,
      cashBonus,
      raceScore,
      score: Math.round(this.score),
    });
  }

  private gameOver(reason: 'wasted' | 'disqualified') {
    this.audio.setEngine(0, 0, false, false);
    this.audio.setSiren(0);
    this.setMode('over');
    this.hooks.onOver({
      score: Math.round(this.score),
      level: this.level,
      takedowns: this.takedownsRun,
      reason,
      position: reason === 'disqualified' ? this.finishPos : this.rank,
      distanceKm: Math.round(this.distance * 10) / 10,
    });
  }

  /* ------------------------------------------------------------ */
  /* fx helpers                                                    */
  /* ------------------------------------------------------------ */
  private vib(ms: number) {
    if (this.isTouch && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  }

  private burst(x: number, y: number, n: number, colors: string[], speed: number, life: number, size: number, shape: PShape, grav: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.fx.spawn(
        x,
        y,
        Math.cos(a) * v,
        Math.sin(a) * v - speed * 0.25,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.8),
        colors[(Math.random() * colors.length) | 0],
        shape,
        grav,
        0,
        0.8,
      );
    }
  }

  private sparks(x: number, y: number, n: number) {
    this.burst(x, y, n, ['#fff4b0', '#ffb02e', '#ff7a1f'], 420 * this.u, 0.45, 3.5 * this.u, 'line', 700 * this.u);
  }

  screenOf(e: Ent): { x: number; y: number; sc: number } | null {
    const seg = e.seg;
    if (!seg) return null;
    if (e.z - this.P.pos < 220) return null;
    const pct = percentRemaining(e.z, SEG_LEN);
    const sc = lerp(seg.p1.sc, seg.p2.sc, pct);
    if (sc <= 0) return null;
    return {
      x: lerp(seg.p1.sx, seg.p2.sx, pct) + (sc * e.x * ROAD_W * this.W) / 2,
      y: lerp(seg.p1.sy, seg.p2.sy, pct),
      sc,
    };
  }

  /* ------------------------------------------------------------ */
  /* rendering                                                     */
  /* ------------------------------------------------------------ */
  private proj(p: Pt, camX: number, camY: number, camZ: number) {
    p.cx = -camX;
    p.cy = p.wy - camY;
    p.cz = p.wz - camZ;
    const sc = (CAM_D * this.fovK) / p.cz;
    p.sc = sc;
    p.sx = Math.round(this.W / 2 + (sc * p.cx * this.W) / 2);
    p.sy = Math.round(this.hy - (sc * p.cy * this.H) / 2);
    p.sw = Math.round((sc * ROAD_W * this.W) / 2);
  }

  private tile(g: CanvasRenderingContext2D, img: HTMLCanvasElement, frac: number, bottom: number, destH: number) {
    const k = destH / img.height;
    const pw = img.width * k;
    const x0 = -(((frac % 1) + 1) % 1) * pw;
    const top = bottom - destH;
    for (let x = x0; x < this.W + 40; x += pw) g.drawImage(img, x, top, pw + 1, destH);
  }

  private drawBgZone(g: CanvasRenderingContext2D, zi: number, alpha: number) {
    const set = this.bgs[zi];
    if (!set) return;
    const hy = this.hy;
    g.globalAlpha = alpha;
    const skyH = hy + 42;
    const k = skyH / set.sky.height;
    const pw = set.sky.width * k;
    const x0 = -(((this.bgOff[0] % 1) + 1) % 1) * pw;
    for (let x = x0; x < this.W + 40; x += pw) g.drawImage(set.sky, x, -40, pw + 1, skyH);
    this.tile(g, set.far, this.bgOff[1], hy + 2, hy * 0.55);
    this.tile(g, set.near, this.bgOff[2], hy + 2, hy * 0.36);
    g.globalAlpha = 1;
  }

  private render() {
    const g = this.ctx;
    const W = this.W;
    const H = this.H;
    if (!this.ready) {
      g.fillStyle = '#10201a';
      g.fillRect(0, 0, W, H);
      return;
    }
    const sh = this.shake * this.shake;
    const u = this.u;
    g.save();
    if (sh > 0.001) {
      g.translate(W / 2, H / 2);
      g.rotate((Math.random() - 0.5) * sh * 0.05);
      g.translate(-W / 2 + (Math.random() - 0.5) * sh * 22 * u, -H / 2 + (Math.random() - 0.5) * sh * 22 * u);
    }
    this.renderWorld(g);
    this.fx.draw(g);
    g.restore();
    this.renderOverlays(g);
    if (this.mode !== 'menu') drawHud(g, this);
  }

  private renderWorld(g: CanvasRenderingContext2D) {
    const P = this.P;
    const segs = this.segs;
    const n = segs.length;
    const W = this.W;
    const H = this.H;
    const hy = this.hy;
    const trackLen = n * SEG_LEN;
    const base = this.segAt(P.pos);
    const basePct = percentRemaining(P.pos, SEG_LEN);
    const pSeg = this.segAt(P.pos + PLAYER_Z);
    const pPct = percentRemaining(P.pos + PLAYER_Z, SEG_LEN);
    const playerY = interpolate(pSeg.p1.wy, pSeg.p2.wy, pPct);

    // background
    const zi = this.segAt(P.pos + 45 * SEG_LEN).zone;
    if (zi !== this.bgCur) {
      this.bgPrev = this.bgCur;
      this.bgCur = zi;
      this.bgFade = 0;
    }
    if (this.bgFade < 1) {
      this.drawBgZone(g, this.bgPrev, 1);
      this.drawBgZone(g, this.bgCur, this.bgFade);
    } else this.drawBgZone(g, this.bgCur, 1);
    g.fillStyle = ZONES[this.bgCur].fog;
    g.fillRect(-40, hy + 1, W + 80, H - hy + 40);

    // road
    let maxy = H;
    let x = 0;
    let dx = -(base.curve * basePct);
    const camX = P.x * ROAD_W;
    const camY = playerY + CAM_H;
    const dd = this.drawDist;
    for (let i = 0; i < dd; i++) {
      const seg = segs[(base.index + i) % n];
      seg.looped = seg.index < base.index;
      const t = i / dd;
      seg.fog = 1 - Math.exp(-t * t * FOG_DENSITY);
      seg.clip = maxy;
      const zoff = P.pos - (seg.looped ? trackLen : 0);
      this.proj(seg.p1, camX - x, camY, zoff);
      this.proj(seg.p2, camX - x - dx, camY, zoff);
      x += dx;
      dx += seg.curve;
      if (seg.p1.cz <= CAM_D || seg.p2.sy >= seg.p1.sy || seg.p2.sy >= maxy) continue;
      this.drawSegment(g, seg);
      maxy = seg.p1.sy;
    }

    // sprites back to front
    const half = W / 2;
    for (let i = dd - 1; i >= 0; i--) {
      const seg = segs[(base.index + i) % n];
      const alpha = 1 - seg.fog * seg.fog * seg.fog;
      if (alpha <= 0.02) continue;
      if (seg.mark === 1 || seg.mark === 3) this.drawGate(g, seg, alpha);
      const sps = seg.sprites;
      if (sps.length) {
        const sc = seg.p1.sc;
        if (sc > 0) {
          g.globalAlpha = alpha;
          for (let k = 0; k < sps.length; k++) {
            const sp = sps[k];
            const spr = S[sp.id];
            if (!spr) continue;
            const dw = spr.ww * sp.s * sc * half;
            if (dw < 2) continue;
            const sx = seg.p1.sx + sc * sp.x * ROAD_W * half;
            if (sx + dw / 2 < -30 || sx - dw / 2 > W + 30) continue;
            this.blit(g, spr, sx, seg.p1.sy, dw, seg.clip, sp.flip);
          }
          g.globalAlpha = 1;
        }
      }
      const es = seg.ents;
      if (es.length) {
        const zoff = P.pos - (seg.looped ? trackLen : 0);
        for (let k = 0; k < es.length; k++) this.drawEnt(g, es[k], seg, alpha, zoff);
      }
    }

    this.drawPlayer(g, pSeg, pPct);
  }

  private blit(g: CanvasRenderingContext2D, spr: Spr, cx: number, by: number, dw: number, clipY: number, flip: boolean) {
    const dh = (dw * spr.h) / spr.w;
    const top = by - dh;
    let clipH = by - clipY;
    if (clipH < 0) clipH = 0;
    if (clipH >= dh) return;
    const sh = clipH > 0 ? spr.h * (1 - clipH / dh) : spr.h;
    const dhh = dh - clipH;
    if (flip) {
      g.save();
      g.translate(cx, 0);
      g.scale(-1, 1);
      g.drawImage(spr.c, 0, 0, spr.w, sh, -dw / 2, top, dw, dhh);
      g.restore();
    } else {
      g.drawImage(spr.c, 0, 0, spr.w, sh, cx - dw / 2, top, dw, dhh);
    }
  }

  private drawSegment(g: CanvasRenderingContext2D, seg: Segment) {
    const p1 = seg.p1;
    const p2 = seg.p2;
    const W = this.W;
    const lv = Math.min(FOG_LEVELS - 1, (seg.fog * FOG_LEVELS) | 0);
    const c = ZONE_LUT[seg.zone][lv];
    const s = seg.stripe;
    const x1 = p1.sx;
    const y1 = p1.sy;
    const w1 = p1.sw;
    const x2 = p2.sx;
    const y2 = p2.sy;
    const w2 = p2.sw;
    g.fillStyle = c.grass[s];
    g.fillRect(-40, y2, W + 80, y1 - y2 + 1);
    if (w1 > 3) {
      const r1 = w1 / 9;
      const r2 = w2 / 9;
      g.fillStyle = c.rumble[s];
      g.beginPath();
      g.moveTo(x1 - w1 - r1, y1);
      g.lineTo(x1 - w1, y1);
      g.lineTo(x2 - w2, y2);
      g.lineTo(x2 - w2 - r2, y2);
      g.closePath();
      g.moveTo(x1 + w1 + r1, y1);
      g.lineTo(x1 + w1, y1);
      g.lineTo(x2 + w2, y2);
      g.lineTo(x2 + w2 + r2, y2);
      g.closePath();
      g.fill();
    }
    g.fillStyle = c.road[s];
    g.beginPath();
    g.moveTo(x1 - w1, y1);
    g.lineTo(x1 + w1, y1);
    g.lineTo(x2 + w2, y2);
    g.lineTo(x2 - w2, y2);
    g.closePath();
    g.fill();
    if (w1 > 6) {
      const lw1 = w1 / 44;
      const lw2 = w2 / 44;
      g.fillStyle = c.yellow;
      g.beginPath();
      for (let k = -1; k <= 1; k += 2) {
        const o1 = k * w1 * 0.045;
        const o2 = k * w2 * 0.045;
        g.moveTo(x1 + o1 - lw1, y1);
        g.lineTo(x1 + o1 + lw1, y1);
        g.lineTo(x2 + o2 + lw2, y2);
        g.lineTo(x2 + o2 - lw2, y2);
        g.closePath();
      }
      g.fill();
      if (s === 0) {
        g.fillStyle = c.lane;
        g.beginPath();
        for (let k = -1; k <= 1; k += 2) {
          const o1 = k * w1 * 0.5;
          const o2 = k * w2 * 0.5;
          g.moveTo(x1 + o1 - lw1, y1);
          g.lineTo(x1 + o1 + lw1, y1);
          g.lineTo(x2 + o2 + lw2, y2);
          g.lineTo(x2 + o2 - lw2, y2);
          g.closePath();
        }
        g.fill();
      }
    }
    const idx = seg.index;
    const fi = this.track.finishIdx;
    if (w1 > 4 && (idx === 3 || idx === 4 || idx === fi || idx === fi + 1)) {
      const N = 12;
      g.fillStyle = '#f4f1e8';
      g.beginPath();
      g.moveTo(x1 - w1, y1);
      g.lineTo(x1 + w1, y1);
      g.lineTo(x2 + w2, y2);
      g.lineTo(x2 - w2, y2);
      g.closePath();
      g.fill();
      g.fillStyle = '#16161a';
      g.beginPath();
      for (let k = 0; k < N; k++) {
        if (((k + idx) & 1) === 0) continue;
        const a = k / N;
        const b = (k + 1) / N;
        g.moveTo(x1 - w1 + 2 * w1 * a, y1);
        g.lineTo(x1 - w1 + 2 * w1 * b, y1);
        g.lineTo(x2 - w2 + 2 * w2 * b, y2);
        g.lineTo(x2 - w2 + 2 * w2 * a, y2);
        g.closePath();
      }
      g.fill();
    }
  }

  private drawGate(g: CanvasRenderingContext2D, seg: Segment, alpha: number) {
    const sc = seg.p1.sc;
    if (sc <= 0 || seg.p1.cz <= CAM_D * 300) return;
    const half = this.W / 2;
    const cx = seg.p1.sx;
    const y = seg.p1.sy;
    if (y > seg.clip + 400) return;
    const isFinish = seg.mark === 3;
    const hx = ROAD_W * 1.2 * sc * half;
    const hgt = 1500 * sc * half;
    const pw = Math.max(2, 80 * sc * half);
    const bh = 380 * sc * half;
    if (hx < 6) return;
    g.globalAlpha = alpha;
    const z = ZONES[seg.zone];
    g.fillStyle = '#2a2a30';
    g.fillRect(cx - hx - pw / 2, y - hgt, pw, hgt);
    g.fillRect(cx + hx - pw / 2, y - hgt, pw, hgt);
    const bx = cx - hx - pw;
    const bw = hx * 2 + pw * 2;
    const by = y - hgt - bh * 0.55;
    if (isFinish) {
      g.fillStyle = '#f4f1e8';
      g.fillRect(bx, by, bw, bh);
      g.fillStyle = '#16161a';
      const cols = 24;
      const cw = bw / cols;
      const rows = 3;
      const rh = bh / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) & 1) g.fillRect(bx + c * cw, by + r * rh, cw + 0.5, rh + 0.5);
    } else {
      g.fillStyle = z.accent;
      g.fillRect(bx, by, bw, bh);
      g.fillStyle = '#f5b82e';
      g.fillRect(bx, by, bw, Math.max(2, bh * 0.1));
      g.fillRect(bx, by + bh - Math.max(2, bh * 0.1), bw, Math.max(2, bh * 0.1));
    }
    if (bh > 12) {
      const label = isFinish ? 'FINISH' : seg.gateName;
      let size = bh * 0.56;
      g.font = `${size}px Bungee, Impact, sans-serif`;
      const maxW = bw * 0.8;
      const mw = g.measureText(label).width;
      if (mw > maxW) {
        size *= maxW / mw;
        g.font = `${size}px Bungee, Impact, sans-serif`;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = Math.max(1, size * 0.12);
      g.strokeStyle = isFinish ? '#f4f1e8' : 'rgba(0,0,0,0.55)';
      if (isFinish) {
        g.fillStyle = '#16161a';
        g.fillRect(cx - bw * 0.26, by + bh * 0.2, bw * 0.52, bh * 0.6);
        g.fillStyle = '#ffd23f';
      } else g.fillStyle = '#fff3d1';
      if (!isFinish) g.strokeText(label, cx, by + bh * 0.5);
      g.fillText(label, cx, by + bh * 0.52);
    }
    g.globalAlpha = 1;
  }

  private drawEnt(g: CanvasRenderingContext2D, e: Ent, seg: Segment, alpha: number, zoff: number) {
    const cz = e.z - zoff;
    if (cz < 220) return;
    const pct = percentRemaining(e.z, SEG_LEN);
    const sc = lerp(seg.p1.sc, seg.p2.sc, pct);
    if (sc <= 0) return;
    const half = this.W / 2;
    const ex = lerp(seg.p1.sx, seg.p2.sx, pct) + sc * e.x * ROAD_W * half;
    const ey = lerp(seg.p1.sy, seg.p2.sy, pct);
    let spr: Spr | undefined;
    if (e.kind === 'rival') spr = S[`rival${e.ci}_${e.pose}`];
    else if (e.kind === 'cop') spr = S[`cop_${e.pose}`];
    else if (e.kind === 'remote') spr = S[`mp_${e.ci}_${e.pose}`] || S[`rival${e.ci % 8}_${e.pose}`];
    else spr = S[e.spr];
    if (!spr) return;
    let dw = spr.ww * sc * half;
    if (dw < 2) return;
    if (ex + dw / 2 < -30 || ex - dw / 2 > this.W + 30) return;
    const u = this.u;

    if (e.kind === 'pickup') {
      const t = this.time * 3 + e.ph;
      const bob = 90 + Math.sin(t * 1.3) * 28;
      const by = ey - bob * sc * half;
      const spin = 0.55 + 0.45 * Math.abs(Math.cos(t * 0.8));
      g.globalAlpha = alpha * 0.28;
      g.fillStyle = e.pk === 'coconut' ? '#7df0ff' : e.pk === 'banana' ? '#ffe35a' : '#ffe9a0';
      g.beginPath();
      g.arc(ex, by - dw * 0.18, dw * 0.46, 0, 6.283);
      g.fill();
      g.globalAlpha = alpha;
      dw *= spin;
      this.blit(g, spr, ex, by, dw, seg.clip + 400, false);
      g.globalAlpha = 1;
      return;
    }

    const dh = (dw * spr.h) / spr.w;
    if (e.state === 'down') {
      const hopPx = e.hop * sc * half;
      g.save();
      g.globalAlpha = alpha * (e.t < 0.5 ? Math.max(0, e.t / 0.5) : 1);
      g.translate(ex, ey - hopPx - dh * 0.4);
      g.rotate(e.rot);
      g.drawImage(spr.c, -dw / 2, -dh * 0.6, dw, dh);
      g.restore();
      g.globalAlpha = 1;
      return;
    }
    let a = alpha;
    if (e.invuln > 0 && ((this.time * 14) | 0) % 2 === 0) a *= 0.35;
    g.globalAlpha = a;
    this.blit(g, spr, ex, ey, dw, seg.clip, false);
    if (e.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(0.6, e.flash * 3) * a;
      this.blit(g, spr, ex, ey, dw, seg.clip, false);
      g.globalCompositeOperation = 'source-over';
    }
    // name tags for other human riders
    if (e.kind === 'remote' && dw > 10 && this.settings.nameTags) {
      const r = this.mp?.riders.find((q) => q.pid === e.pid);
      const label = r ? r.name : e.name || 'RIDER';
      const size = Math.max(9 * this.u, Math.min(16 * this.u, dw * 0.15));
      setTagFont(g, size);
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      const ty = ey - dh - size * 0.55;
      const tw = g.measureText(label).width;
      g.globalAlpha = a * 0.85;
      g.fillStyle = 'rgba(6,20,15,0.75)';
      g.fillRect(ex - tw / 2 - 4 * this.u, ty - size, tw + 8 * this.u, size * 1.25);
      g.globalAlpha = a;
      g.fillStyle = '#fff3d1';
      g.fillText(label, ex, ty - size * 0.15);
    }
    g.globalAlpha = a;
    if (e.kind === 'cop' && dw > 8) {
      const on = ((this.time * 8) | 0) % 2 === 0;
      const r = Math.max(2, dw * 0.05);
      const by = ey - dh * 0.99;
      g.fillStyle = on ? 'rgba(255,40,40,0.4)' : 'rgba(50,110,255,0.4)';
      g.beginPath();
      g.arc(ex, by, r * 3, 0, 6.283);
      g.fill();
      g.fillStyle = on ? '#ff2a2a' : '#2a6bff';
      g.beginPath();
      g.arc(ex, by, r, 0, 6.283);
      g.fill();
    }
    if (e.state === 'windup' && dw > 14) {
      const r = Math.max(7 * u, dw * 0.09);
      const by = ey - dh - r * 1.2;
      g.fillStyle = '#ff2e2e';
      g.beginPath();
      g.arc(ex, by, r, 0, 6.283);
      g.fill();
      g.lineWidth = Math.max(1, r * 0.18);
      g.strokeStyle = '#fff';
      g.stroke();
      g.fillStyle = '#fff';
      g.font = `${r * 1.5}px Bungee, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('!', ex, by + r * 0.08);
    }
    g.globalAlpha = 1;
  }

  private drawPlayer(g: CanvasRenderingContext2D, pSeg: Segment, pPct: number) {
    const P = this.P;
    const W = this.W;
    const H = this.H;
    const sc0 = CAM_D / PLAYER_Z;
    const dw = RIDER_WW * sc0 * (W / 2);
    const s = dw / RIDER_W;
    const camYp = lerp(pSeg.p1.cy, pSeg.p2.cy, pPct);
    const sc = (CAM_D * this.fovK) / PLAYER_Z;
    const sp = P.speed / MAX_SPEED;
    const bob = Math.sin(this.time * 38) * sp * 1.3 * this.u;
    let py = this.hy - (sc * camYp * H) / 2 + bob;
    py = Math.min(py, H - 6 * this.u);
    this.pY = py;
    this.pS = s;
    const o = this.pOpts;
    o.lean = P.lean;
    o.brake = this.input.brake && this.phase === 'race';
    o.stick = P.weapon > 0 ? '#a8662a' : null;
    let e = 0;
    if (P.punchT > 0) {
      const prog = 1 - P.punchT / PUNCH_DUR;
      e = prog < 0.35 ? prog / 0.35 : 1 - (prog - 0.35) / 0.65;
      e = clamp(e, 0, 1);
    }
    o.armL = P.punchSide < 0 ? e : 0;
    o.armR = P.punchSide > 0 ? e : 0;
    if (P.invuln > 0 && P.wipe <= 0 && ((this.blink * 14) | 0) % 2 === 0) return;
    const sx = W / 2;
    if (P.wipe > 0) {
      const hopPx = P.hop * ((CAM_D * this.fovK) / PLAYER_Z) * (W / 2);
      g.save();
      g.translate(sx, py - hopPx - 70 * s);
      g.rotate(P.wipeRot);
      drawRider(g, o, 0, 70 * s, s);
      g.restore();
      if (Math.random() < 0.6) this.sparks(sx + rand(-20, 20) * s, py, 1);
    } else {
      drawRider(g, o, sx, py, s);
    }
  }

  private renderOverlays(g: CanvasRenderingContext2D) {
    const W = this.W;
    const H = this.H;
    const P = this.P;
    const u = this.u;
    const playing = this.mode !== 'menu';
    // speed lines
    const sp = P.speed / MAX_SPEED;
    if (playing && (sp > 0.8 || P.nitroOn) && P.wipe <= 0) {
      const inten = P.nitroOn ? 0.5 : clamp((sp - 0.8) * 1.4, 0, 0.25);
      g.strokeStyle = P.nitroOn ? 'rgba(180,235,255,0.55)' : 'rgba(255,255,255,0.35)';
      g.lineWidth = Math.max(1, 1.4 * u);
      g.globalAlpha = inten + 0.2;
      g.beginPath();
      const cx = W / 2;
      const cy = this.hy + 14 * u;
      const n = P.nitroOn ? 22 : 12;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283;
        const r0 = (0.32 + Math.random() * 0.25) * W;
        const r1 = r0 + (0.1 + Math.random() * 0.22) * W;
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.7);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    // rain
    if (this.rainA > 0.02) {
      g.strokeStyle = 'rgba(210,225,235,0.55)';
      g.lineWidth = Math.max(1, u);
      g.globalAlpha = this.rainA;
      g.beginPath();
      const dt = this.mode === 'paused' ? 0 : this.frameDt;
      for (const d of this.drops) {
        d.y += d.v * dt * 1.9;
        d.x -= dt * 0.18;
        if (d.y > 1) {
          d.y = -0.05;
          d.x = Math.random();
        }
        if (d.x < 0) d.x += 1;
        const x = d.x * W;
        const y = d.y * H;
        g.moveTo(x, y);
        g.lineTo(x - 3 * u, y + 14 * u);
      }
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = `rgba(190,215,205,${0.1 * this.rainA})`;
      g.fillRect(0, 0, W, H);
    }
    // vignettes
    if (this.gradVig) {
      if (this.hurtA > 0.01) {
        const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
        rg.addColorStop(0, 'rgba(255,0,0,0)');
        rg.addColorStop(1, `rgba(255,20,20,${this.hurtA * 0.55})`);
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
      }
      if (this.cop && this.cop.state !== 'down' && this.mode === 'playing') {
        const gap = Math.abs(P.pos + PLAYER_Z - this.cop.z);
        const lvl = clamp(1 - gap / 9000, 0.12, 1);
        const red = ((this.time * 5) | 0) % 2 === 0;
        const rg = g.createLinearGradient(red ? 0 : W, 0, red ? W * 0.28 : W * 0.72, 0);
        rg.addColorStop(0, red ? `rgba(255,30,30,${0.38 * lvl})` : `rgba(40,110,255,${0.38 * lvl})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
      }
      if (P.nitroOn) {
        const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        rg.addColorStop(0, 'rgba(80,190,255,0)');
        rg.addColorStop(1, 'rgba(80,190,255,0.28)');
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
      }
    }
    if (this.flashA > 0.01) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.7, this.flashA)})`;
      g.fillRect(0, 0, W, H);
    }
  }
}
