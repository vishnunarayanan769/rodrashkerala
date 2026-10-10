export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';
export type EngineSound = 'thunder' | 'sport' | 'cruiser' | 'retro' | 'electric' | 'silent';

export interface Settings {
  name: string;
  bikeColor: number;
  difficulty: Difficulty;
  gameSpeed: number; // 0.7 .. 1.35 world time multiplier
  engineSound: EngineSound;
  masterVol: number; // 0..1
  musicVol: number; // 0..1
  sfxVol: number; // 0..1
  muted: boolean;
  quality: number; // 0.55..1
  relayUrl: string; // empty => same-device rooms via BroadcastChannel
  maxRiders: number; // multiplayer grid size (2..10)
  showFps: boolean;
  nameTags: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: 'RIDER',
  bikeColor: 0,
  difficulty: 'normal',
  gameSpeed: 1,
  engineSound: 'thunder',
  masterVol: 0.85,
  musicVol: 1,
  sfxVol: 1,
  muted: false,
  quality: 1,
  relayUrl: '',
  maxRiders: 10,
  showFps: false,
  nameTags: true,
};

export const ENGINE_PROFILES: Record<EngineSound, { label: string; hint: string; o1: OscillatorType; o2: OscillatorType; ratio: number; pitch: number; filter: number; gain: number }> = {
  thunder: { label: 'THUNDER', hint: 'Big single, deep growl', o1: 'sawtooth', o2: 'square', ratio: 0.5, pitch: 1, filter: 1, gain: 1 },
  sport: { label: 'SPORT', hint: 'Revvy inline-four whine', o1: 'square', o2: 'sawtooth', ratio: 1.505, pitch: 1.35, filter: 1.25, gain: 0.85 },
  cruiser: { label: 'CRUISER', hint: 'Lazy V-twin chug', o1: 'sawtooth', o2: 'triangle', ratio: 0.251, pitch: 0.78, filter: 0.8, gain: 1.05 },
  retro: { label: 'RETRO 2T', hint: 'Tinny two-stroke buzz', o1: 'square', o2: 'square', ratio: 2.01, pitch: 1.6, filter: 1.5, gain: 0.7 },
  electric: { label: 'E-BIKE', hint: 'Futuristic hum', o1: 'triangle', o2: 'sine', ratio: 3.01, pitch: 1.1, filter: 2.2, gain: 0.6 },
  silent: { label: 'SILENT', hint: 'Wind and traffic only', o1: 'sine', o2: 'sine', ratio: 1, pitch: 1, filter: 0.2, gain: 0 },
};

export interface EngineProfile {
  label: string;
  hint: string;
  o1: OscillatorType;
  o2: OscillatorType;
  ratio: number;
  pitch: number;
  filter: number;
  gain: number;
}

export interface DiffPreset {
  label: string;
  tag: string;
  rival: number; // AI top-speed multiplier
  aggr: number; // AI aggression
  aiHp: number; // hits needed to drop an AI rider
  dmgIn: number; // damage you take multiplier
  dmgOut: number; // damage you deal multiplier
  cop: number; // police frequency multiplier
  traffic: number; // traffic density multiplier
  rubber: number; // catch-up assist for the player
}

export const DIFFICULTY: Record<Difficulty, DiffPreset> = {
  easy: { label: 'EASY', tag: 'Sunday ride — forgiving rivals', rival: 0.86, aggr: 0.5, aiHp: 2, dmgIn: 0.6, dmgOut: 1.5, cop: 0.6, traffic: 0.75, rubber: 1.1 },
  normal: { label: 'NORMAL', tag: 'The classic Kerala scrap', rival: 1, aggr: 1, aiHp: 3, dmgIn: 1, dmgOut: 1, cop: 1, traffic: 1, rubber: 1 },
  hard: { label: 'HARD', tag: 'Mean riders, dense traffic', rival: 1.07, aggr: 1.35, aiHp: 4, dmgIn: 1.35, dmgOut: 0.85, cop: 1.4, traffic: 1.25, rubber: 0.95 },
  insane: { label: 'INSANE', tag: 'Chenda-fuelled chaos', rival: 1.14, aggr: 1.7, aiHp: 5, dmgIn: 1.7, dmgOut: 0.75, cop: 1.8, traffic: 1.5, rubber: 0.9 },
};

export const BIKE_COLORS: { name: string; shirt: string; shirt2: string; bike: string; band: string | null }[] = [
  { name: 'Chilli Red', shirt: '#b3122e', shirt2: '#ffd23f', bike: '#ff8a00', band: '#ffd23f' },
  { name: 'Backwater Teal', shirt: '#0f8b8d', shirt2: '#e9fff9', bike: '#1f6f8b', band: null },
  { name: 'Kasavu Gold', shirt: '#f2c14e', shirt2: '#5a3b00', bike: '#8f6b00', band: '#d62839' },
  { name: 'Pooram Violet', shirt: '#7b2cbf', shirt2: '#f1d4ff', bike: '#5a189a', band: '#ffffff' },
  { name: 'Monsoon Blue', shirt: '#3a86ff', shirt2: '#ffffff', bike: '#274690', band: null },
  { name: 'Banana Green', shirt: '#06a77d', shirt2: '#d6ffe9', bike: '#047857', band: null },
  { name: 'Laterite', shirt: '#e5383b', shirt2: '#ffe3e3', bike: '#9d0208', band: null },
  { name: 'Charcoal', shirt: '#222831', shirt2: '#00adb5', bike: '#393e46', band: null },
  { name: 'Hibiscus', shirt: '#ff5d8f', shirt2: '#ffffff', bike: '#c9184a', band: '#ffffff' },
  { name: 'Ivory Mundu', shirt: '#f1faee', shirt2: '#457b9d', bike: '#2d6a4f', band: null },
];

export function sanitizeName(n: string, fallback = 'RIDER'): string {
  const v = (n || '').toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').trim();
  return (v || fallback).slice(0, 12);
}

export function clampSettings(s: Partial<Settings>): Settings {
  const d = DEFAULT_SETTINGS;
  const num = (v: unknown, def: number, lo: number, hi: number) => {
    const n = typeof v === 'number' && isFinite(v) ? v : def;
    return Math.max(lo, Math.min(hi, n));
  };
  return {
    name: sanitizeName(typeof s.name === 'string' ? s.name : d.name),
    bikeColor: Math.max(0, Math.min(BIKE_COLORS.length - 1, Math.round(num(s.bikeColor, 0, 0, BIKE_COLORS.length - 1)))),
    difficulty: (['easy', 'normal', 'hard', 'insane'] as Difficulty[]).includes(s.difficulty as Difficulty) ? (s.difficulty as Difficulty) : d.difficulty,
    gameSpeed: Math.round(num(s.gameSpeed, 1, 0.7, 1.35) * 100) / 100,
    engineSound: (Object.keys(ENGINE_PROFILES) as EngineSound[]).includes(s.engineSound as EngineSound) ? (s.engineSound as EngineSound) : d.engineSound,
    masterVol: num(s.masterVol, d.masterVol, 0, 1),
    musicVol: num(s.musicVol, d.musicVol, 0, 1),
    sfxVol: num(s.sfxVol, d.sfxVol, 0, 1),
    muted: !!s.muted,
    quality: num(s.quality, 1, 0.55, 1),
    relayUrl: typeof s.relayUrl === 'string' ? s.relayUrl.trim().slice(0, 160) : '',
    maxRiders: Math.max(2, Math.min(10, Math.round(num(s.maxRiders, 10, 2, 10)))),
    showFps: !!s.showFps,
    nameTags: s.nameTags === undefined ? true : !!s.nameTags,
  };
}

export const SPEED_LABEL = (v: number) => (v < 0.85 ? 'CHILL' : v < 1 ? 'RELAXED' : v < 1.08 ? 'NORMAL' : v < 1.2 ? 'FAST' : 'TURBO');
