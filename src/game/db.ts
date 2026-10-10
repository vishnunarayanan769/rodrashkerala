import type { ScoreEntry } from './scores';
import { loadScores as legacyScores, saveScores as legacySave } from './scores';
import { DEFAULT_SETTINGS, clampSettings } from './settings';
import type { Settings } from './settings';

/* ------------------------------------------------------------------ *
 * IndexedDB store for Road Rash Kerala.
 * Falls back to localStorage when IndexedDB is unavailable (private
 * mode, old browsers) so nothing ever breaks at runtime.
 * ------------------------------------------------------------------ */

const DB_NAME = 'roadrash-kerala';
const DB_VERSION = 1;
const LS_PREFIX = 'rrk.db.';

export interface RaceRecord {
  nid?: number;
  date: number;
  mode: 'single' | 'multi';
  level: number;
  position: number;
  total: number;
  score: number;
  takedowns: number;
  timeSec: number;
  reason: 'finished' | 'wasted' | 'disqualified';
  code?: string;
  players?: string[];
}

export interface PlayerRecord {
  name: string;
  firstSeen: number;
  lastSeen: number;
  races: number;
  wins: number;
  bestScore: number;
  takedowns: number;
}

export interface SessionRecord {
  code: string;
  created: number;
  updated: number;
  host: string;
  relay: string;
  races: number;
  lastPlayers: string[];
  lastResults?: { name: string; pos: number; score: number }[];
}

export interface Stats {
  races: number;
  wins: number;
  podiums: number;
  takedowns: number;
  km: number;
  bestScore: number;
  playMs: number;
  multiRaces: number;
}

export const DEFAULT_STATS: Stats = {
  races: 0,
  wins: 0,
  podiums: 0,
  takedowns: 0,
  km: 0,
  bestScore: 0,
  playMs: 0,
  multiRaces: 0,
};

type Store = 'kv' | 'scores' | 'races' | 'players' | 'sessions';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('scores')) db.createObjectStore('scores', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('races')) {
          const st = db.createObjectStore('races', { keyPath: 'nid', autoIncrement: true });
          st.createIndex('date', 'date');
          st.createIndex('mode', 'mode');
        }
        if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'name' });
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'code' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(store, mode);
          const req = fn(t.objectStore(store));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/* -------------------------- settings -------------------------- */

export async function dbLoadSettings(): Promise<Settings> {
  let stored: Partial<Settings> | null = null;
  const fromDb = await tx<Settings>('kv', 'readonly', (s) => s.get('settings') as IDBRequest<Settings>);
  if (fromDb && typeof fromDb === 'object') stored = fromDb;
  if (!stored) stored = lsGet<Partial<Settings>>('settings', {});
  // migrate very old single-value keys
  if (stored.name === undefined) {
    try {
      const legacyName = localStorage.getItem('rrk.name.v1');
      if (legacyName) stored.name = legacyName;
      const legacyMute = localStorage.getItem('rrk.mute.v1');
      if (legacyMute !== null) stored.muted = legacyMute === '1';
    } catch {
      /* ignore */
    }
  }
  return clampSettings({ ...DEFAULT_SETTINGS, ...(stored || {}) });
}

export async function dbSaveSettings(s: Settings): Promise<void> {
  lsSet('settings', s);
  await tx('kv', 'readwrite', (st) => st.put(s, 'settings') as IDBRequest<IDBValidKey>);
}

/* -------------------------- scores -------------------------- */

export async function dbLoadScores(): Promise<ScoreEntry[]> {
  const migrated = lsGet<boolean>('migrated', false);
  if (!migrated) {
    const legacy = legacyScores();
    if (legacy.length) {
      await dbSaveScores(legacy);
      lsSet('migrated', true);
      return legacy;
    }
    lsSet('migrated', true);
  }
  const rows = await tx<ScoreEntry[]>('scores', 'readonly', (s) => s.getAll() as IDBRequest<ScoreEntry[]>);
  const list = (rows || []).filter((r) => r && typeof r.score === 'number');
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 50);
  lsSet('scores', trimmed.slice(0, 8)); // keep sync cache warm for legacy readers
  return trimmed;
}

export async function dbSaveScores(list: ScoreEntry[]): Promise<void> {
  const sorted = [...list].sort((a, b) => b.score - a.score).slice(0, 50);
  legacySave(sorted.slice(0, 8));
  await tx('scores', 'readwrite', (s) => s.clear() as unknown as IDBRequest<undefined>);
  for (const e of sorted) await tx('scores', 'readwrite', (st) => st.put(e) as IDBRequest<IDBValidKey>);
}

export async function dbAddScore(entry: Omit<ScoreEntry, 'id' | 'date'>): Promise<{ list: ScoreEntry[]; id: number }> {
  const list = await dbLoadScores();
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const next = [...list, { ...entry, id, date: Date.now() }].sort((a, b) => b.score - a.score).slice(0, 50);
  await dbSaveScores(next);
  return { list: next.slice(0, 8), id };
}

export async function dbRenameScore(id: number, name: string): Promise<ScoreEntry[]> {
  const list = await dbLoadScores();
  const next = list.map((e) => (e.id === id ? { ...e, name } : e));
  await dbSaveScores(next);
  return next.slice(0, 8);
}

export async function dbClearScores(): Promise<ScoreEntry[]> {
  await dbSaveScores([]);
  return [];
}

/* -------------------------- races -------------------------- */

export async function dbAddRace(rec: Omit<RaceRecord, 'nid'>): Promise<void> {
  const key = await tx<IDBValidKey>('races', 'readwrite', (s) => s.put(rec) as IDBRequest<IDBValidKey>);
  lsSet(
    'recentRaces',
    [rec, ...lsGet<RaceRecord[]>('recentRaces', [])].slice(0, 10),
  );
  void key;
}

export async function dbRecentRaces(limit = 10): Promise<RaceRecord[]> {
  const rows = await tx<RaceRecord[]>('races', 'readonly', (s) => s.getAll() as IDBRequest<RaceRecord[]>);
  if (rows && rows.length) {
    rows.sort((a, b) => b.date - a.date);
    return rows.slice(0, limit);
  }
  return lsGet<RaceRecord[]>('recentRaces', []).slice(0, limit);
}

/* -------------------------- players -------------------------- */

export async function dbUpsertPlayer(name: string, patch: Partial<PlayerRecord>): Promise<void> {
  const key = name.toUpperCase();
  const existing = await tx<PlayerRecord>('players', 'readonly', (s) => s.get(key) as IDBRequest<PlayerRecord>);
  const now = Date.now();
  const rec: PlayerRecord = {
    name: key,
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    races: (existing?.races ?? 0) + (patch.races ?? 0),
    wins: (existing?.wins ?? 0) + (patch.wins ?? 0),
    bestScore: Math.max(existing?.bestScore ?? 0, patch.bestScore ?? 0),
    takedowns: (existing?.takedowns ?? 0) + (patch.takedowns ?? 0),
  };
  await tx('players', 'readwrite', (s) => s.put(rec) as IDBRequest<IDBValidKey>);
}

export async function dbPlayers(limit = 12): Promise<PlayerRecord[]> {
  const rows = await tx<PlayerRecord[]>('players', 'readonly', (s) => s.getAll() as IDBRequest<PlayerRecord[]>);
  const list = rows || [];
  list.sort((a, b) => b.bestScore - a.bestScore || b.lastSeen - a.lastSeen);
  return list.slice(0, limit);
}

/* -------------------------- sessions -------------------------- */

export async function dbSaveSession(rec: SessionRecord): Promise<void> {
  const existing = await tx<SessionRecord>('sessions', 'readonly', (s) => s.get(rec.code) as IDBRequest<SessionRecord>);
  const merged: SessionRecord = { ...rec, updated: Date.now(), created: existing?.created ?? Date.now() };
  await tx('sessions', 'readwrite', (s) => s.put(merged) as IDBRequest<IDBValidKey>);
}

export async function dbRecentSessions(limit = 6): Promise<SessionRecord[]> {
  const rows = await tx<SessionRecord[]>('sessions', 'readonly', (s) => s.getAll() as IDBRequest<SessionRecord[]>);
  const list = rows || [];
  list.sort((a, b) => b.updated - a.updated);
  return list.slice(0, limit);
}

/* -------------------------- stats -------------------------- */

export async function dbLoadStats(): Promise<Stats> {
  const v = await tx<Stats>('kv', 'readonly', (s) => s.get('stats') as IDBRequest<Stats>);
  return { ...DEFAULT_STATS, ...(v || lsGet<Partial<Stats>>('stats', {})) };
}

export async function dbBumpStats(patch: Partial<Stats>): Promise<Stats> {
  const cur = await dbLoadStats();
  const next: Stats = {
    races: cur.races + (patch.races ?? 0),
    wins: cur.wins + (patch.wins ?? 0),
    podiums: cur.podiums + (patch.podiums ?? 0),
    takedowns: cur.takedowns + (patch.takedowns ?? 0),
    km: Math.round((cur.km + (patch.km ?? 0)) * 10) / 10,
    bestScore: Math.max(cur.bestScore, patch.bestScore ?? 0),
    playMs: cur.playMs + (patch.playMs ?? 0),
    multiRaces: cur.multiRaces + (patch.multiRaces ?? 0),
  };
  lsSet('stats', next);
  await tx('kv', 'readwrite', (s) => s.put(next, 'stats') as IDBRequest<IDBValidKey>);
  return next;
}

export async function dbWipe(): Promise<void> {
  for (const store of ['kv', 'scores', 'races', 'players', 'sessions'] as Store[]) {
    await tx(store, 'readwrite', (s) => s.clear() as unknown as IDBRequest<undefined>);
  }
  const db = await openDb();
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  dbPromise = null;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX) || k.startsWith('rrk.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export async function dbStorageInfo(): Promise<{ type: string; races: number }> {
  const db = await openDb();
  const races = await dbRecentRaces(100);
  return { type: db ? 'IndexedDB' : 'localStorage fallback', races: races.length };
}
