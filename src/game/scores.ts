export interface ScoreEntry {
  name: string;
  score: number;
  level: number;
  takedowns: number;
  date: number;
  id: number;
}

const KEY = 'rrk.scores.v1';
const NAME_KEY = 'rrk.name.v1';
const MUTE_KEY = 'rrk.mute.v1';
const SEEN_KEY = 'rrk.seen.v1';
const MAX_ENTRIES = 8;

const DEFAULTS: ScoreEntry[] = [
  { name: 'KUTTAN', score: 24000, level: 3, takedowns: 11, date: 0, id: -1 },
  { name: 'APPU', score: 15500, level: 2, takedowns: 8, date: 0, id: -2 },
  { name: 'SHAJI', score: 9800, level: 2, takedowns: 5, date: 0, id: -3 },
  { name: 'BIJU', score: 6200, level: 1, takedowns: 4, date: 0, id: -4 },
  { name: 'MANI', score: 3600, level: 1, takedowns: 2, date: 0, id: -5 },
];

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadScores(): ScoreEntry[] {
  const raw = safeGet(KEY);
  if (!raw) return DEFAULTS.map((d) => ({ ...d }));
  try {
    const arr = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(arr)) return DEFAULTS.map((d) => ({ ...d }));
    return arr
      .filter((e) => e && typeof e.score === 'number' && typeof e.name === 'string')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  } catch {
    return DEFAULTS.map((d) => ({ ...d }));
  }
}

export function saveScores(list: ScoreEntry[]) {
  safeSet(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

export function qualifies(list: ScoreEntry[], score: number): boolean {
  if (score <= 0) return false;
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

export function addScore(
  list: ScoreEntry[],
  entry: Omit<ScoreEntry, 'id' | 'date'>,
): { list: ScoreEntry[]; id: number } {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const next = [...list, { ...entry, id, date: Date.now() }]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
  saveScores(next);
  return { list: next, id };
}

export function renameScore(list: ScoreEntry[], id: number, name: string): ScoreEntry[] {
  const next = list.map((e) => (e.id === id ? { ...e, name } : e));
  saveScores(next);
  return next;
}

export function bestScore(list: ScoreEntry[]): number {
  return list.length ? list[0].score : 0;
}

export function loadName(): string {
  return safeGet(NAME_KEY) || 'RIDER';
}
export function saveName(n: string) {
  safeSet(NAME_KEY, n);
}
export function loadMuted(): boolean {
  return safeGet(MUTE_KEY) === '1';
}
export function saveMuted(m: boolean) {
  safeSet(MUTE_KEY, m ? '1' : '0');
}
export function hasSeenHints(): boolean {
  return safeGet(SEEN_KEY) === '1';
}
export function markSeenHints() {
  safeSet(SEEN_KEY, '1');
}
