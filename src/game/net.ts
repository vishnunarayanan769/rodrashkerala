/* ------------------------------------------------------------------ *
 * Multiplayer networking.
 *
 * Transport is pluggable:
 *   • BroadcastChannel — zero setup, works between tabs/windows of the
 *     same browser on one machine (great for couch testing).
 *   • WebSocket relay — point "Relay server" in Options at the tiny
 *     server in ./server/relay.mjs to play with friends on other
 *     devices. The relay only forwards envelopes, never stores data.
 *
 * Every envelope carries the sender pid, so peers can be identified
 * without any accounts. No game data is ever sent anywhere else.
 * ------------------------------------------------------------------ */

import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Difficulty } from './settings';

export const MAX_RIDERS = 10;
export const ROOM_CODE_LEN = 5;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function makePid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function normalizeCode(c: string): string {
  return (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN);
}

export interface MpPlayer {
  pid: string;
  name: string;
  color: number;
  order: number;
  host: boolean;
  seen: number;
  ready: boolean;
}

export interface RiderState {
  z: number;
  x: number;
  sp: number;
  hp: number;
  pose: number;
  down: boolean;
  fin: boolean;
}

export interface NetTraffic {
  n: number;
  s: string;
  z: number;
  x: number;
  d: number;
  v: number;
}

export interface NetRival {
  n: number;
  c: number;
  nm: string;
  z: number;
  x: number;
  v: number;
  st: number; // 0 ride, 1 windup, 2 swing, 3 down
  hp: number;
  p: number; // pose
  r: number; // rot
  h: number; // hop
}

export interface StartCfg {
  seed: number;
  level: number;
  total: number;
  difficulty: Difficulty;
  players: { pid: string; name: string; color: number }[];
}

export interface MpResult {
  pid: string;
  name: string;
  color: number;
  pos: number;
  score: number;
  takedowns: number;
  timeSec: number;
  isAi: boolean;
  dnf: boolean;
}

export type NetMsg =
  | { t: 'hello'; from: string; name: string; color: number }
  | { t: 'bye'; from: string }
  | { t: 'ping'; from: string }
  | { t: 'roster'; from: string; players: { pid: string; name: string; color: number; order: number; ready: boolean }[] }
  | { t: 'chat'; from: string; name: string; text: string }
  | { t: 'start'; from: string; cfg: StartCfg }
  | { t: 'state'; from: string; st: RiderState }
  | { t: 'world'; from: string; tr: NetTraffic[]; rv: NetRival[] }
  | { t: 'punch'; from: string; name: string; target: string; side: number }
  | { t: 'hit'; from: string; hp: number }
  | { t: 'finish'; from: string; name: string; z: number; timeSec: number; score: number; takedowns: number }
  | { t: 'results'; from: string; rows: MpResult[] }
  | { t: 'again'; from: string; cfg: StartCfg };

interface Envelope {
  room: string;
  from: string;
  data: NetMsg;
}

export interface Transport {
  readonly kind: 'local' | 'relay' | 'p2p';
  /** pid of whoever opened the room, if the transport knows it. */
  hubPid?: string;
  /** still dialling — host election should wait rather than guess. */
  connecting?: boolean;
  send(m: NetMsg): void;
  close(): void;
  onMessage: ((m: NetMsg, from: string, hub?: string) => void) | null;
  onStatus: ((s: 'open' | 'closed' | 'error', info?: string) => void) | null;
}

/* ------------------------- BroadcastChannel ------------------------- */

export class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  private ch: BroadcastChannel | null = null;
  private storageListener: ((e: StorageEvent) => void) | null = null;
  onMessage: ((m: NetMsg, from: string) => void) | null = null;
  onStatus: ((s: 'open' | 'closed' | 'error', info?: string) => void) | null = null;

  constructor(private room: string, private me: string) {
    try {
      this.ch = new BroadcastChannel('rrk-mp-' + room);
      this.ch.onmessage = (e) => {
        const env = e.data as Envelope;
        if (!env || env.room !== room || env.from === me) return;
        this.onMessage?.(env.data, env.from);
      };
      // fallback for browsers without BroadcastChannel (iOS < 15.4)
      if (typeof BroadcastChannel === 'undefined') this.ch = null;
      if (!this.ch) {
        this.storageListener = (e: StorageEvent) => {
          if (!e.key || e.key !== 'rrk.mp.bus' || !e.newValue) return;
          try {
            const env = JSON.parse(e.newValue) as Envelope;
            if (env.room !== room || env.from === me) return;
            this.onMessage?.(env.data, env.from);
          } catch {
            /* ignore */
          }
        };
        window.addEventListener('storage', this.storageListener);
      }
      this.onStatus?.('open');
    } catch {
      this.ch = null;
      this.onStatus?.('error', 'BroadcastChannel unavailable');
    }
  }

  send(m: NetMsg) {
    const env: Envelope = { room: this.room, from: this.me, data: m };
    if (this.ch) {
      try {
        this.ch.postMessage(env);
      } catch {
        /* ignore */
      }
    } else {
      try {
        localStorage.setItem('rrk.mp.bus', JSON.stringify(env));
      } catch {
        /* ignore */
      }
    }
  }

  close() {
    try {
      this.ch?.close();
    } catch {
      /* ignore */
    }
    if (this.storageListener) window.removeEventListener('storage', this.storageListener);
    this.ch = null;
    this.storageListener = null;
    this.onStatus?.('closed');
  }
}

/* --------------------------- WebSocket relay --------------------------- */

export class RelayTransport implements Transport {
  readonly kind = 'relay' as const;
  private ws: WebSocket | null = null;
  private queue: NetMsg[] = [];
  private closed = false;
  onMessage: ((m: NetMsg, from: string) => void) | null = null;
  onStatus: ((s: 'open' | 'closed' | 'error', info?: string) => void) | null = null;

  constructor(url: string, private room: string, private me: string) {
    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        if (this.closed) return;
        ws.send(JSON.stringify({ join: room, from: me }));
        for (const m of this.queue) this.rawSend(m);
        this.queue.length = 0;
        this.onStatus?.('open');
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        try {
          const env = JSON.parse(e.data) as Envelope;
          if (!env || env.from === me) return;
          this.onMessage?.(env.data, env.from);
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => this.onStatus?.('error', 'Could not reach relay server');
      ws.onclose = () => {
        if (!this.closed) this.onStatus?.('closed', 'Relay connection closed');
      };
    } catch {
      this.onStatus?.('error', 'Invalid relay URL');
    }
  }

  private rawSend(m: NetMsg) {
    try {
      this.ws?.send(JSON.stringify({ room: this.room, from: this.me, data: m }));
    } catch {
      /* ignore */
    }
  }

  send(m: NetMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.rawSend(m);
    else if (this.queue.length < 60) this.queue.push(m);
  }

  close() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}

/* ---------------------- WebRTC (PeerJS) transport ---------------------- *
 * Cross-device rooms with nothing to host. The first client to open a code
 * claims a deterministic peer id and becomes the "hub"; everybody else
 * connects to it and the hub fans messages out to the rest of the room.
 * Falls back to BroadcastChannel (same browser) if signalling is unreachable.
 * ---------------------------------------------------------------------- */

const PEER_PREFIX = 'rrk-kerala-v1-';
export const hubIdFor = (code: string) => PEER_PREFIX + code;

interface Envelope2 extends Envelope {
  hub?: string;
}

export class PeerTransport implements Transport {
  readonly kind = 'p2p' as const;
  onMessage: ((m: NetMsg, from: string, hub?: string) => void) | null = null;
  onStatus: ((s: 'open' | 'closed' | 'error', info?: string) => void) | null = null;
  /** pid of the room hub, once known — the hub is the game host. */
  hubPid: string | undefined = undefined;
  connecting = true;
  private joinTries = 0;

  private peer: Peer | null = null;
  private isHub = false;
  private conns = new Set<DataConnection>();
  private connByPid = new Map<string, DataConnection>();
  private link: DataConnection | null = null;
  private pending: Envelope2[] = [];
  private local: LocalTransport | null = null;
  private opened = false;
  private closed = false;
  private bootTimer: number | null = null;

  constructor(private code: string, private me: string) {
    this.claimHub();
    this.bootTimer = window.setTimeout(() => {
      if (!this.opened && !this.closed) this.fallback('The online lobby is not responding');
    }, 7000);
  }

  private markOpen(info?: string) {
    if (this.opened) return;
    this.opened = true;
    this.connecting = false;
    if (this.bootTimer !== null) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    this.onStatus?.('open', info);
  }

  private claimHub() {
    let peer: Peer;
    try {
      peer = new Peer(hubIdFor(this.code), { debug: 0 });
    } catch {
      this.fallback('WebRTC is unavailable in this browser');
      return;
    }
    this.peer = peer;
    this.hubPid = this.me;
    peer.on('open', () => {
      if (this.closed) return;
      this.isHub = true;
      this.hubPid = this.me;
      this.markOpen('Room is open — friends can join with this code');
    });
    peer.on('connection', (c) => this.attach(c, false));
    peer.on('error', (e) => this.onError(e));
    peer.on('disconnected', () => {
      try {
        if (!this.closed) peer.reconnect();
      } catch {
        /* ignore */
      }
    });
  }

  private joinHub() {
    let peer: Peer;
    try {
      peer = new Peer({ debug: 0 });
    } catch {
      this.fallback('WebRTC is unavailable in this browser');
      return;
    }
    this.peer = peer;
    peer.on('open', () => {
      if (this.closed) return;
      try {
        const c = peer.connect(hubIdFor(this.code), { reliable: true });
        this.attach(c, true);
      } catch {
        this.fallback('Could not reach that room');
      }
    });
    peer.on('error', (e) => this.onError(e));
    peer.on('disconnected', () => {
      try {
        if (!this.closed) peer.reconnect();
      } catch {
        /* ignore */
      }
    });
  }

  private attach(c: DataConnection, asLink: boolean) {
    c.on('open', () => {
      if (this.closed) return;
      if (asLink) {
        this.link = c;
        this.markOpen('Connected to the room');
        for (const env of this.pending) this.rawSend(c, env);
        this.pending = [];
      } else {
        this.conns.add(c);
        // let the newcomer learn who the hub is
        this.rawSend(c, { room: this.code, from: this.me, hub: this.me, data: { t: 'ping', from: this.me } });
        this.onStatus?.('open');
      }
    });
    c.on('data', (d) => {
      if (this.closed) return;
      const env = d as Envelope2;
      if (!env || typeof env !== 'object' || !env.data) return;
      if (env.hub && !this.isHub) this.hubPid = env.hub;
      if (env.from === this.me) return;
      if (env.from) this.connByPid.set(env.from, c);
      // the hub relays everything it did not originate
      if (this.isHub) {
        const tagged: Envelope2 = { ...env, hub: this.me };
        for (const other of this.conns) if (other !== c && other.open) this.rawSend(other, tagged);
      }
      this.onMessage?.(env.data, env.from, this.hubPid);
    });
    const drop = () => {
      this.conns.delete(c);
      if (this.link === c) {
        this.link = null;
        if (!this.closed) this.onStatus?.('closed', 'Lost the connection to the host');
      }
    };
    c.on('close', drop);
    c.on('error', drop);
  }

  private onError(err: unknown) {
    if (this.closed) return;
    const type = String((err as { type?: string } | null)?.type || '');
    if (type === 'unavailable-id' && !this.isHub) {
      // Somebody already opened this code — we are a guest, not the hub.
      // Clearing hubPid matters: otherwise this client would keep believing it
      // opened the room and crown itself host of a second, separate room.
      this.teardownPeer();
      this.isHub = false;
      this.hubPid = undefined;
      this.joinHub();
      return;
    }
    if (type === 'peer-unavailable') {
      // The host may still be claiming the code — retry a few times before
      // concluding the room really is not there.
      if (this.joinTries < 4) {
        this.joinTries++;
        if (this.bootTimer !== null) {
          clearTimeout(this.bootTimer);
          this.bootTimer = null;
        }
        this.teardownPeer();
        this.onStatus?.('error', `Looking for room ${this.code}… (attempt ${this.joinTries + 1})`);
        window.setTimeout(() => {
          if (!this.closed && !this.local) this.joinHub();
        }, 1100);
        return;
      }
      this.onStatus?.('error', `No open room with code ${this.code}`);
      this.fallback('Room not found online');
      return;
    }
    if (!this.opened && ['network', 'server-error', 'socket-error', 'socket-closed', 'ssl-unavailable', 'browser-incompatible', 'disconnected'].includes(type)) {
      this.fallback('Could not reach the online lobby');
      return;
    }
    if (!this.opened) this.fallback('Connection failed');
  }

  private rawSend(c: DataConnection, env: Envelope2) {
    try {
      c.send(env);
    } catch {
      /* ignore */
    }
  }

  /** Degrade to same-browser rooms rather than failing outright. */
  private fallback(reason: string) {
    if (this.closed || this.local) return;
    this.teardownPeer();
    this.connecting = false;
    this.isHub = false;
    this.hubPid = undefined; // no hub locally — fall back to lowest-id election
    this.local = new LocalTransport(this.code, this.me);
    this.local.onMessage = (m, from) => this.onMessage?.(m, from);
    this.local.onStatus = (s, info) => this.onStatus?.(s, info);
    this.opened = true;
    if (this.bootTimer !== null) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    this.onStatus?.('error', `${reason} — switched to same-browser rooms`);
  }

  private teardownPeer() {
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
    this.conns.clear();
    this.connByPid.clear();
    this.link = null;
  }

  send(m: NetMsg) {
    if (this.closed) return;
    if (this.local) {
      this.local.send(m);
      return;
    }
    const env: Envelope2 = { room: this.code, from: this.me, hub: this.isHub ? this.me : this.hubPid, data: m };
    if (this.isHub) {
      for (const c of this.conns) if (c.open) this.rawSend(c, env);
      return;
    }
    if (this.link?.open) this.rawSend(this.link, env);
    else if (this.pending.length < 60) this.pending.push(env);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.bootTimer !== null) clearTimeout(this.bootTimer);
    this.bootTimer = null;
    this.local?.close();
    this.local = null;
    this.teardownPeer();
    this.pending = [];
  }
}

export function makeTransport(relayUrl: string, code: string, me: string): Transport {
  const url = (relayUrl || '').trim();
  if (url) return new RelayTransport(url, code, me);
  try {
    if (typeof Peer === 'function') return new PeerTransport(code, me);
  } catch {
    /* fall through to local */
  }
  return new LocalTransport(code, me);
}

/* ------------------------------- Room ------------------------------- */

export interface RoomHooks {
  onPlayers?: (players: MpPlayer[], hostPid: string) => void;
  onChat?: (name: string, text: string, mine: boolean) => void;
  onStart?: (cfg: StartCfg) => void;
  onState?: (pid: string, st: RiderState) => void;
  onWorld?: (tr: NetTraffic[], rv: NetRival[]) => void;
  onPunch?: (fromPid: string, name: string, targetPid: string, side: number) => void;
  onHit?: (pid: string, hp: number) => void;
  onFinish?: (pid: string, name: string, timeSec: number, score: number, takedowns: number) => void;
  onResults?: (rows: MpResult[]) => void;
  onAgain?: (cfg: StartCfg) => void;
  onStatus?: (text: string, kind: 'info' | 'error') => void;
}

const PRUNE_MS = 5200;
const HEARTBEAT_MS = 1200;

export class Room {
  readonly code: string;
  readonly me: MpPlayer;
  players = new Map<string, MpPlayer>();
  hooks: RoomHooks = {};
  isHost = false;
  private transport: Transport;
  private hb: number | null = null;
  private pruneT: number | null = null;
  private disposed = false;
  private joinTimer: number | null = null;
  private starting = false;
  private knownHub: string | null = null;

  constructor(code: string, name: string, color: number, relayUrl: string) {
    this.code = code;
    const pid = makePid();
    this.me = { pid, name, color, order: 0, host: true, seen: Date.now(), ready: false };
    this.players.set(pid, this.me);
    this.transport = makeTransport(relayUrl, code, pid);
    this.transport.onStatus = (s, info) => {
      if (s === 'error' || s === 'closed') this.hooks.onStatus?.(info || (s === 'error' ? 'Connection problem' : 'Disconnected'), 'error');
      else this.hooks.onStatus?.('Connected — waiting for riders…', 'info');
    };
    this.transport.onMessage = (m, from, hub) => this.receive(m, from, hub);
    this.hb = window.setInterval(() => this.beat(), HEARTBEAT_MS);
    this.pruneT = window.setInterval(() => this.prune(), 1500);
    window.addEventListener('beforeunload', this.unload);
    // Announce ourselves. Say hello a few times: the other tab may still be
    // constructing its channel when the first one goes out.
    this.refreshHost();
    const announce = () => {
      if (this.disposed) return;
      this.transport.send({ t: 'hello', from: pid, name, color });
    };
    announce();
    window.setTimeout(announce, 250);
    window.setTimeout(announce, 800);
    this.joinTimer = window.setTimeout(() => this.checkJoin(0), 1200);
  }

  get transportKind(): 'local' | 'relay' | 'p2p' {
    return this.transport.kind;
  }

  get humanCount(): number {
    return this.players.size;
  }

  /** Deterministic order: every client sorts the same way (by pid). */
  playerList(): MpPlayer[] {
    return [...this.players.values()].sort((a, b) => (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0));
  }

  private unload = () => this.leave();
  private beat() {
    this.transport.send({ t: 'ping', from: this.me.pid });
    if (this.isHost) this.broadcastRoster();
  }

  private emitPlayers() {
    this.hooks.onPlayers?.(this.playerList(), this.hostPid());
  }

  /**
   * Host election. Whoever *opened* the room (the WebRTC hub) hosts it — that
   * is stable and matches "the person who created the code". Transports with
   * no hub (BroadcastChannel / a plain relay) fall back to the lowest player
   * id, which every client computes identically, so there is never a moment
   * where nobody — or everybody — thinks they are the host.
   */
  private hostPid(): string {
    const hub = this.knownHub || this.transport.hubPid;
    if (hub && this.players.has(hub)) return hub;
    let best = this.me.pid;
    for (const pid of this.players.keys()) if (pid < best) best = pid;
    return best;
  }

  /** Re-run the election and keep per-player flags + grid order in sync. */
  private refreshHost(): boolean {
    const hp = this.hostPid();
    const was = this.isHost;
    this.isHost = hp === this.me.pid;
    const list = this.playerList();
    list.forEach((p, i) => {
      p.order = i;
      p.host = p.pid === hp;
    });
    if (this.isHost && !was) this.hooks.onStatus?.('You are the host — press START when ready', 'info');
    return this.isHost;
  }

  /**
   * Settle who hosts once the room has had a chance to form. While a WebRTC
   * transport is still dialling we keep waiting instead of guessing, so a
   * guest never crowns itself host just because ICE negotiation was slow.
   */
  private checkJoin(tries: number) {
    if (this.disposed) return;
    this.joinTimer = null;
    if (this.transport.connecting && tries < 12) {
      this.joinTimer = window.setTimeout(() => this.checkJoin(tries + 1), 700);
      return;
    }
    if (this.refreshHost()) this.broadcastRoster();
    this.emitPlayers();
  }

  private broadcastRoster() {
    if (!this.isHost) return;
    const list = this.playerList();
    // make bike colours unique where we can
    const used = new Set<number>();
    for (const p of list) {
      if (used.has(p.color)) {
        for (let i = 0; i < 10; i++) {
          if (!used.has(i)) {
            p.color = i;
            break;
          }
        }
      }
      used.add(p.color);
    }
    // NOTE: keep the live objects in the map (never swap in copies), or
    // this.me drifts out of sync with the roster we just published.
    const players = list.map((p) => ({ pid: p.pid, name: p.name, color: p.color, order: p.order, ready: p.ready }));
    this.transport.send({ t: 'roster', from: this.me.pid, players });
    this.refreshHost();
    this.emitPlayers();
  }

  private receive(m: NetMsg, from: string, hub?: string) {
    if (this.disposed) return;
    if (hub) this.knownHub = hub;
    const now = Date.now();
    let p = this.players.get(from);
    if (!p && m.t !== 'hello' && m.t !== 'bye') {
      p = { pid: from, name: 'RIDER', color: from.charCodeAt(0) % 10, order: 99, host: false, seen: now, ready: false };
      this.players.set(from, p);
    }
    if (p) p.seen = now;

    switch (m.t) {
      case 'hello': {
        const isNew = !p;
        if (!p) {
          p = { pid: from, name: m.name, color: m.color, order: 99, host: false, seen: now, ready: false };
          this.players.set(from, p);
        } else {
          p.name = m.name;
          p.color = m.color;
        }
        this.refreshHost();
        if (this.isHost) {
          this.broadcastRoster();
        } else if (isNew) {
          // Answer once so the newcomer learns we exist (and can elect the
          // same host). Only on first contact, otherwise hellos ping-pong.
          this.transport.send({ t: 'hello', from: this.me.pid, name: this.me.name, color: this.me.color });
        }
        this.emitPlayers();
        break;
      }
      case 'roster': {
        // When the transport knows who opened the room, only that client's
        // roster is authoritative — otherwise a peer that briefly believed it
        // was host (slow ICE, or a stale tab) could wipe the real player list.
        if ((this.knownHub || this.transport.hubPid) && from !== this.hostPid()) break;
        if (this.joinTimer !== null) {
          clearTimeout(this.joinTimer);
          this.joinTimer = null;
        }
        const seen = new Set<string>();
        let nameMismatch = false;
        for (const q of m.players) {
          seen.add(q.pid);
          const cur = this.players.get(q.pid);
          if (q.pid === this.me.pid) {
            // The host assigns bike colours (it de-duplicates them), but it
            // must never rename us — if it still has a placeholder name for
            // us, our hello was lost, so announce ourselves again.
            if (q.name !== this.me.name) nameMismatch = true;
            this.me.color = q.color;
            this.me.order = q.order;
            this.players.set(this.me.pid, this.me);
          } else {
            this.players.set(q.pid, {
              pid: q.pid,
              name: q.name,
              color: q.color,
              order: q.order,
              host: false,
              seen: cur?.seen ?? now,
              ready: q.ready,
            });
          }
        }
        for (const pid of [...this.players.keys()]) if (!seen.has(pid) && pid !== this.me.pid) this.players.delete(pid);
        // we were missing from the roster, or listed under the wrong name
        if (nameMismatch || !seen.has(this.me.pid)) {
          this.transport.send({ t: 'hello', from: this.me.pid, name: this.me.name, color: this.me.color });
        }
        this.refreshHost();
        this.emitPlayers();
        break;
      }
      case 'ping':
        // a heartbeat from somebody we did not know about yet
        if (p && p.name === 'RIDER' && p.order === 99) {
          this.transport.send({ t: 'hello', from: this.me.pid, name: this.me.name, color: this.me.color });
          p.order = 98;
          this.refreshHost();
        }
        break;
      case 'bye':
        this.players.delete(from);
        this.refreshHost();
        if (this.isHost) this.broadcastRoster();
        else this.emitPlayers();
        break;
      case 'chat':
        this.hooks.onChat?.(m.name, m.text, from === this.me.pid);
        break;
      case 'start':
        if (from === this.hostPid()) {
          this.starting = true;
          this.hooks.onStart?.(m.cfg);
        }
        break;
      case 'again':
        if (from === this.hostPid()) this.hooks.onAgain?.(m.cfg);
        break;
      case 'state':
        this.hooks.onState?.(from, m.st);
        break;
      case 'world':
        this.hooks.onWorld?.(m.tr, m.rv);
        break;
      case 'punch':
        this.hooks.onPunch?.(from, m.name, m.target, m.side);
        break;
      case 'hit':
        this.hooks.onHit?.(from, m.hp);
        break;
      case 'finish':
        this.hooks.onFinish?.(from, m.name, m.timeSec, m.score, m.takedowns);
        break;
      case 'results':
        this.hooks.onResults?.(m.rows);
        break;
    }
  }

  private prune() {
    const now = Date.now();
    let changed = false;
    for (const [pid, p] of this.players) {
      if (pid === this.me.pid) continue;
      if (now - p.seen > PRUNE_MS) {
        this.players.delete(pid);
        changed = true;
        this.hooks.onStatus?.(`${p.name} left the room`, 'info');
      }
    }
    if (!changed) return;
    // the lowest remaining id takes over automatically
    if (this.refreshHost()) this.broadcastRoster();
    else this.emitPlayers();
  }

  chat(text: string) {
    const t = text.trim().slice(0, 90);
    if (!t) return;
    this.transport.send({ t: 'chat', from: this.me.pid, name: this.me.name, text: t });
  }

  setReady(r: boolean) {
    this.me.ready = r;
    if (this.isHost) this.broadcastRoster();
  }

  send(m: NetMsg) {
    this.transport.send(m);
  }

  startRace(cfg: StartCfg) {
    if (!this.isHost) return false;
    this.starting = true;
    this.transport.send({ t: 'start', from: this.me.pid, cfg });
    return true;
  }

  raceAgain(cfg: StartCfg) {
    if (!this.isHost) return false;
    this.transport.send({ t: 'again', from: this.me.pid, cfg });
    return true;
  }

  get started(): boolean {
    return this.starting;
  }

  leave() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.transport.send({ t: 'bye', from: this.me.pid });
    } catch {
      /* ignore */
    }
    if (this.hb !== null) clearInterval(this.hb);
    if (this.pruneT !== null) clearInterval(this.pruneT);
    if (this.joinTimer !== null) clearTimeout(this.joinTimer);
    this.hb = this.pruneT = this.joinTimer = null;
    window.removeEventListener('beforeunload', this.unload);
    this.transport.close();
  }
}
