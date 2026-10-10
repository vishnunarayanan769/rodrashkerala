import { useState } from "react";
import type { Difficulty, EngineSound, Settings } from "../game/settings";
import { BIKE_COLORS, DIFFICULTY, ENGINE_PROFILES, SPEED_LABEL } from "../game/settings";
import { fmt } from "../game/util";
import type { PlayerRecord, RaceRecord, Stats } from "../game/db";
import { cn } from "../utils/cn";
import { Kbd, MuteButton } from "./Overlays";

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-kasavu/30 bg-black/25 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[13px] tracking-wider text-kasavu">{title}</h3>
        {hint && <span className="text-[11px] text-mundu/50">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-mundu/85">{label}</span>
        <span className="font-display text-[12px] text-kasavu">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-paddy-dark accent-[#f5b82e] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#fff3c4] [&::-webkit-slider-thumb]:bg-[#f5b82e]"
      />
    </label>
  );
}

export function OptionsScreen({
  settings,
  stats,
  races,
  players,
  storage,
  onChange,
  onPreviewEngine,
  onClose,
  onWipe,
}: {
  settings: Settings;
  stats: Stats | null;
  races: RaceRecord[];
  players: PlayerRecord[];
  storage: string;
  onChange: (patch: Partial<Settings>) => void;
  onPreviewEngine: (e: EngineSound) => void;
  onClose: () => void;
  onWipe: () => void;
}) {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [tab, setTab] = useState<"game" | "riders" | "data">("game");

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "game", label: "GAME" },
    { id: "riders", label: "RIDERS" },
    { id: "data", label: "DATA" },
  ];

  return (
    <div className="anim-fade fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(2,18,12,0.5),rgba(2,12,8,0.9))] p-3 sm:p-5">
      <div className="card anim-pop my-auto w-full max-w-2xl p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="title-3d font-display text-3xl sm:text-4xl">OPTIONS</h2>
          <div className="flex items-center gap-2">
            <MuteButton muted={settings.muted} onToggle={() => onChange({ muted: !settings.muted })} />
            <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
              BACK <Kbd>Esc</Kbd>
            </button>
          </div>
        </div>

        <div className="mb-3 flex gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 rounded-lg border-2 px-2 py-1.5 font-display text-[12px] tracking-wider transition",
                tab === t.id
                  ? "border-kasavu bg-kasavu/25 text-mundu"
                  : "border-kasavu/30 bg-black/20 text-mundu/60 hover:text-mundu",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "game" && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Section title="RIDER NAME">
              <input
                value={settings.name}
                maxLength={12}
                onChange={(e) => onChange({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9 ._-]/g, "") })}
                onBlur={(e) => onChange({ name: e.target.value.trim() || "RIDER" })}
                className="w-full rounded-md border-2 border-kasavu/60 bg-paddy-dark px-3 py-2 font-display text-base tracking-wider text-mundu outline-none focus:border-kasavu"
              />
              <p className="mt-1 text-[11px] text-mundu/55">Shown over your bike and on the score table.</p>
            </Section>

            <Section title="DIFFICULTY">
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => onChange({ difficulty: d })}
                    className={cn(
                      "rounded-lg border-2 px-2 py-1.5 font-display text-[12px] transition",
                      settings.difficulty === d ? "border-kasavu bg-kasavu/25" : "border-kasavu/25 bg-black/20 text-mundu/70",
                    )}
                  >
                    {DIFFICULTY[d].label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-mundu/55">{DIFFICULTY[settings.difficulty].tag}</p>
            </Section>

            <Section title="GAME SPEED" hint={SPEED_LABEL(settings.gameSpeed)}>
              <Slider
                label="World speed"
                value={settings.gameSpeed}
                min={0.7}
                max={1.35}
                step={0.05}
                onChange={(v) => onChange({ gameSpeed: v })}
                display={`${settings.gameSpeed.toFixed(2)}×`}
              />
              <p className="mt-1 text-[11px] text-mundu/55">Slow it down to enjoy the scenery, or crank it to turbo.</p>
            </Section>

            <Section title="BIKE SOUND">
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(ENGINE_PROFILES) as EngineSound[]).map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      onChange({ engineSound: e });
                      onPreviewEngine(e);
                    }}
                    className={cn(
                      "rounded-lg border-2 px-2 py-1.5 font-display text-[12px] transition",
                      settings.engineSound === e ? "border-kasavu bg-kasavu/25" : "border-kasavu/25 bg-black/20 text-mundu/70",
                    )}
                  >
                    {ENGINE_PROFILES[e].label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-mundu/55">{ENGINE_PROFILES[settings.engineSound].hint}</p>
            </Section>

            <Section title="VOLUME">
              <div className="space-y-2">
                <Slider label="Master" value={settings.masterVol} min={0} max={1} step={0.05} onChange={(v) => onChange({ masterVol: v })} display={`${Math.round(settings.masterVol * 100)}%`} />
                <Slider label="Music" value={settings.musicVol} min={0} max={1} step={0.05} onChange={(v) => onChange({ musicVol: v })} display={`${Math.round(settings.musicVol * 100)}%`} />
                <Slider label="Effects" value={settings.sfxVol} min={0} max={1} step={0.05} onChange={(v) => onChange({ sfxVol: v })} display={`${Math.round(settings.sfxVol * 100)}%`} />
              </div>
            </Section>

            <Section title="DISPLAY">
              <div className="space-y-2">
                <Slider label="Render quality" value={settings.quality} min={0.55} max={1} step={0.05} onChange={(v) => onChange({ quality: v })} display={`${Math.round(settings.quality * 100)}%`} />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { k: "showFps" as const, l: "SHOW FPS" },
                    { k: "nameTags" as const, l: "NAME TAGS" },
                  ].map((o) => (
                    <button
                      key={o.k}
                      onClick={() => onChange({ [o.k]: !settings[o.k] } as Partial<Settings>)}
                      className={cn(
                        "rounded-lg border-2 px-2.5 py-1.5 font-display text-[11px] transition",
                        settings[o.k] ? "border-kasavu bg-kasavu/25" : "border-kasavu/25 bg-black/20 text-mundu/60",
                      )}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            </Section>
          </div>
        )}

        {tab === "riders" && (
          <div className="grid gap-2.5">
            <Section title="YOUR BIKE" hint="used in multiplayer">
              <div className="grid grid-cols-5 gap-1.5">
                {BIKE_COLORS.map((c, i) => (
                  <button
                    key={c.name}
                    title={c.name}
                    onClick={() => onChange({ bikeColor: i })}
                    className={cn(
                      "group relative flex h-12 items-end justify-center rounded-lg border-2 pb-1 transition",
                      settings.bikeColor === i ? "border-kasavu" : "border-kasavu/25",
                    )}
                    style={{ background: `linear-gradient(180deg, ${c.shirt} 0%, ${c.bike} 100%)` }}
                  >
                    <span className="rounded bg-black/45 px-1 text-[9px] tracking-wide text-mundu">{c.name.split(" ")[0].slice(0, 7)}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="MULTIPLAYER GRID" hint={`max 10 bikes`}>
              <Slider
                label="Bikes on the grid"
                value={settings.maxRiders}
                min={2}
                max={10}
                step={1}
                onChange={(v) => onChange({ maxRiders: v })}
                display={`${settings.maxRiders} bikes`}
              />
              <p className="mt-1 text-[11px] text-mundu/55">
                Empty slots are filled by computer riders, so a race always starts full.
              </p>
              <div className="mt-2">
                <label className="block text-sm text-mundu/85">Relay server (optional)</label>
                <input
                  value={settings.relayUrl}
                  placeholder="ws://your-server:8080"
                  onChange={(e) => onChange({ relayUrl: e.target.value })}
                  className="mt-1 w-full rounded-md border-2 border-kasavu/40 bg-paddy-dark px-3 py-1.5 text-sm text-mundu outline-none focus:border-kasavu"
                />
                <p className="mt-1 text-[11px] text-mundu/55">
                  Leave empty for the built-in peer-to-peer lobby, which already works across devices. Only set this if you
                  run your own private relay.
                </p>
              </div>
            </Section>

            {players.length > 0 && (
              <Section title="RIDERS SEEN ON THIS DEVICE">
                <ul className="space-y-1 text-sm">
                  {players.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
                      <span className="font-display text-[12px]">{p.name}</span>
                      <span className="text-[11px] text-mundu/60">
                        {p.races} races · {p.wins} wins · best {fmt(p.bestScore)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}

        {tab === "data" && (
          <div className="grid gap-2.5">
            <Section title="CAREER" hint={storage}>
              {stats ? (
                <div className="grid grid-cols-3 gap-1.5 text-center sm:grid-cols-4">
                  {[
                    ["RACES", String(stats.races)],
                    ["WINS", String(stats.wins)],
                    ["PODIUMS", String(stats.podiums)],
                    ["TAKEDOWNS", String(stats.takedowns)],
                    ["DISTANCE", `${stats.km} km`],
                    ["BEST SCORE", fmt(stats.bestScore)],
                    ["MP RACES", String(stats.multiRaces)],
                    ["PLAY TIME", `${Math.round(stats.playMs / 60000)} m`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-black/25 px-1 py-2">
                      <div className="font-display text-base">{v}</div>
                      <div className="text-[10px] tracking-widest text-mundu/55">{k}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-mundu/60">Loading career stats…</p>
              )}
            </Section>

            <Section title="RECENT RACES">
              {races.length === 0 ? (
                <p className="text-sm text-mundu/60">No races recorded yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {races.slice(0, 8).map((r, i) => (
                    <li key={r.nid ?? i} className="flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
                      <span className="text-[11px] text-mundu/70">
                        {r.mode === "multi" ? "MP" : "SP"} · R{r.level}
                        {r.code ? ` · ${r.code}` : ""}
                      </span>
                      <span className="font-display text-[12px]">
                        P{r.position}/{r.total}
                      </span>
                      <span className="text-[11px] text-kasavu">{fmt(r.score)}</span>
                      <span className="text-[11px] text-mundu/55">
                        {r.takedowns} KO · {Math.floor(r.timeSec)}s
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="STORAGE" hint="kept on this device only">
              <p className="text-[12px] leading-snug text-mundu/65">
                Scores, settings, race history, rider records and multiplayer sessions live in this browser&apos;s IndexedDB
                database. Nothing is uploaded anywhere.
              </p>
              <div className="mt-2 flex gap-2">
                {!confirmWipe ? (
                  <button onClick={() => setConfirmWipe(true)} className="btn-ghost px-3 py-2 text-[12px]">
                    ERASE ALL DATA
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        onWipe();
                        setConfirmWipe(false);
                      }}
                      className="rounded-xl border-2 border-[#ff8a7a] bg-[#7a1d12]/60 px-3 py-2 font-display text-[12px] text-mundu"
                    >
                      YES, ERASE EVERYTHING
                    </button>
                    <button onClick={() => setConfirmWipe(false)} className="btn-ghost px-3 py-2 text-[12px]">
                      CANCEL
                    </button>
                  </>
                )}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
