import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ScoreEntry } from "../game/scores";
import type { RaceResult, RunResult } from "../game/types";
import type { Stats } from "../game/db";
import { fmt } from "../game/util";
import { cn } from "../utils/cn";

const ORD = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"];

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd mx-0.5">{children}</span>;
}

export function MuteButton({
  muted,
  onToggle,
  className,
}: {
  muted: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      aria-label={muted ? "Unmute" : "Mute"}
      onClick={(e) => {
        e.currentTarget.blur();
        onToggle();
      }}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full border-2 border-kasavu/70 bg-paddy-dark/80 text-mundu backdrop-blur transition hover:bg-kasavu/25 active:scale-90",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
        {muted ? (
          <>
            <path d="m16 9 5 6" />
            <path d="m21 9-5 6" />
          </>
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        )}
      </svg>
    </button>
  );
}

export function ScoreTable({
  scores,
  highlightId,
  rows = 8,
}: {
  scores: ScoreEntry[];
  highlightId?: number | null;
  rows?: number;
}) {
  return (
    <ol className="space-y-1">
      {scores.slice(0, rows).map((s, i) => (
        <li
          key={s.id}
          className={cn(
            "flex items-center gap-2 rounded-lg px-2.5 py-1 text-[15px]",
            s.id === highlightId ? "anim-row ring-2 ring-kasavu" : "bg-black/25",
          )}
        >
          <span className={cn("w-5 font-display text-sm", i === 0 ? "text-kasavu" : i < 3 ? "text-mundu" : "text-mundu/60")}>{i + 1}</span>
          <span className="flex-1 truncate font-display text-[13px] tracking-wide">{s.name}</span>
          <span className="font-display text-[13px] tabular-nums text-kasavu">{fmt(s.score)}</span>
          <span className="w-8 text-right text-xs text-mundu/60">R{s.level}</span>
        </li>
      ))}
      {scores.length === 0 && <li className="px-2 py-3 text-center text-mundu/60">No rides yet — be the first!</li>}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

export function MenuScreen({
  scores,
  touch,
  muted,
  onToggleMute,
  onStart,
  onOptions,
  onMultiplayer,
  stats,
}: {
  scores: ScoreEntry[];
  touch: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onStart: () => void;
  onOptions: () => void;
  onMultiplayer: () => void;
  stats: Stats | null;
}) {
  return (
    <div className="anim-fade fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(2,18,12,0.35),rgba(2,12,8,0.84))] p-3 sm:p-6 md:items-center">
      <div className="my-auto grid w-full max-w-5xl items-stretch gap-3 sm:gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="card anim-pop flex flex-col justify-between p-4 sm:p-6">
          <div>
            <div className="kasavu-bar mb-3" />
            <div className="font-mal text-xl font-bold leading-none text-kasavu sm:text-3xl">കേരളം</div>
            <h1 className="title-3d anim-bob mt-1 font-display text-[clamp(2rem,min(7.4vw,12vh),4.5rem)] leading-[0.92]">
              ROAD RASH
              <br />
              KERALA
            </h1>
            <p className="mt-3 text-base leading-snug text-mundu/90 sm:text-lg [@media(max-height:520px)]:hidden">
              Backwaters, tea hills and Pooram fever. Outrun the KSRTC bus, brawl with the pack, shake off the police —{" "}
              <b className="text-kasavu">God&apos;s Own Country, God&apos;s own mayhem.</b>
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 sm:mt-5">
            <button onClick={onStart} className="btn-gold anim-pulse-gold px-8 py-3 text-xl sm:px-10 sm:text-2xl">
              RIDE!
            </button>
            <span className="text-sm text-mundu/80">
              {touch ? (
                "or tap anywhere on RIDE"
              ) : (
                <>
                  press <Kbd>Enter</Kbd>
                </>
              )}
            </span>
            <MuteButton muted={muted} onToggle={onToggleMute} className="ml-auto" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onMultiplayer} className="btn-ghost px-5 py-2.5 text-base">
              MULTIPLAYER
            </button>
            <button onClick={onOptions} className="btn-ghost px-5 py-2.5 text-base">
              OPTIONS
            </button>
          </div>

          {stats && (
            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
              {[
                ["RACES", String(stats.races)],
                ["WINS", String(stats.wins)],
                ["TAKEDOWNS", String(stats.takedowns)],
                ["KM", String(stats.km)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-black/25 px-1 py-1.5">
                  <div className="font-display text-sm">{v}</div>
                  <div className="tracking-widest text-mundu/55">{k}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-xl bg-black/30 p-3 text-[15px] leading-snug [@media(max-height:520px)]:hidden">
            {touch ? (
              <ul className="space-y-1 text-mundu/90">
                <li>
                  <b className="text-kasavu">Drag</b> the left pad to steer — throttle is automatic
                </li>
                <li>
                  <b className="text-kasavu">Tap fists</b> to punch rivals off their bikes
                </li>
                <li>
                  <b className="text-kasavu">Hold NITRO</b> to boost, tap BRAKE to slow
                </li>
              </ul>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-mundu/90">
                <div>
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd> steer
                </div>
                <div>
                  <Kbd>↑</Kbd> gas <Kbd>↓</Kbd> brake
                </div>
                <div>
                  <Kbd>Z</Kbd>
                  <Kbd>X</Kbd> punch L / R
                </div>
                <div>
                  <Kbd>Space</Kbd> nitro
                </div>
                <div>
                  <Kbd>P</Kbd> pause <Kbd>R</Kbd> restart
                </div>
                <div>
                  <Kbd>M</Kbd> sound
                </div>
              </div>
            )}
            <p className="mt-2 text-[13px] text-mundu/70">
              Finish <b className="text-kasavu">top 5</b> to qualify for the next race. Grab ₹ notes, tender coconuts (nitro) and bananas (health).
            </p>
          </div>
        </div>

        <div className="card anim-pop p-4 sm:p-5 [animation-delay:90ms]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-kasavu sm:text-xl">HALL OF FAME</h2>
            <span className="text-xs text-mundu/60">saved on this device</span>
          </div>
          <ScoreTable scores={scores} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PauseScreen({
  muted,
  touch,
  onToggleMute,
  onResume,
  onRestart,
  onMenu,
}: {
  muted: boolean;
  touch: boolean;
  onToggleMute: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="anim-fade fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <div className="card anim-pop w-full max-w-sm p-6 text-center">
        <h2 className="title-3d font-display text-5xl">PAUSED</h2>
        <div className="kasavu-bar my-4" />
        <div className="flex flex-col gap-3">
          <button onClick={onResume} className="btn-gold py-3 text-xl">
            RESUME
          </button>
          <button onClick={onRestart} className="btn-ghost py-2.5 text-base">
            RESTART {touch ? "" : <Kbd>R</Kbd>}
          </button>
          <button onClick={onMenu} className="btn-ghost py-2.5 text-base">
            MAIN MENU {touch ? "" : <Kbd>Q</Kbd>}
          </button>
        </div>
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-mundu/80">
          <MuteButton muted={muted} onToggle={onToggleMute} />
          <span>{muted ? "Sound off" : "Sound on"}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, value, delay, accent }: { label: string; value: string; delay: number; accent?: boolean }) {
  return (
    <div
      className="anim-slide flex items-baseline justify-between border-b border-kasavu/20 py-1.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-mundu/80">{label}</span>
      <span className={cn("font-display tabular-nums", accent ? "text-xl text-kasavu" : "text-base text-mundu")}>{value}</span>
    </div>
  );
}

export function ResultScreen({
  res,
  onNext,
  children,
  embedded,
}: {
  res: RaceResult;
  onNext: () => void;
  children?: React.ReactNode;
  embedded?: boolean;
}) {
  const medal = res.position === 1 ? "text-kasavu" : res.position <= 3 ? "text-mundu" : "text-[#ffb27a]";
  const m = Math.floor(res.timeSec / 60);
  const s = Math.floor(res.timeSec % 60)
    .toString()
    .padStart(2, "0");
  return (
    <div className="anim-fade fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/65 p-3 backdrop-blur-[2px]">
      <div className="card anim-pop my-auto w-full max-w-md p-5 text-center sm:p-6">
        <div className="text-sm tracking-[0.25em] text-kasavu">RACE {res.level} COMPLETE</div>
        <div className={cn("title-3d font-display text-[clamp(3.4rem,18vw,6rem)] leading-none", medal)}>{ORD[res.position - 1]}</div>
        <div className="text-mundu/80">of {res.total} riders — you qualified!</div>
        <div className="kasavu-bar my-3" />
        <div className="text-left text-[16px]">
          <Row label="Race time" value={`${m}:${s}`} delay={80} />
          <Row label="Takedowns" value={`${res.takedowns} × 250`} delay={160} />
          <Row label="Position bonus" value={`+${fmt(res.positionBonus)}`} delay={240} />
          <Row label="Health bonus" value={`+${fmt(res.healthBonus)}`} delay={320} />
          <Row label="Takedown bonus" value={`+${fmt(res.cashBonus)}`} delay={400} />
          <Row label="TOTAL SCORE" value={fmt(res.score)} delay={500} accent />
        </div>
        {!embedded && (
          <p className="mt-3 text-sm text-mundu/70">Next up: a new route through Kerala. Rivals get faster and meaner.</p>
        )}
        <button onClick={onNext} className="btn-gold anim-pulse-gold mt-4 w-full py-3 text-xl">
          NEXT RACE →
        </button>
        <div className="mt-2 text-xs text-mundu/60">
          press <Kbd>Enter</Kbd>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function GameOverScreen({
  res,
  scores,
  myId,
  name,
  touch,
  onRename,
  onRestart,
  onMenu,
}: {
  res: RunResult;
  scores: ScoreEntry[];
  myId: number | null;
  name: string;
  touch: boolean;
  onRename: (n: string) => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const shown = useCountUp(res.score);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasted = res.reason === "wasted";
  const rank = myId != null ? scores.findIndex((s) => s.id === myId) + 1 : 0;
  return (
    <div className="anim-fade fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-[2px] sm:p-5 md:items-center">
      <div className="my-auto grid w-full max-w-4xl gap-3 sm:gap-4 md:grid-cols-[1.15fr_1fr]">
        <div className="card anim-pop p-5 sm:p-6">
          <div className="anim-wasted">
            <div className="text-xs tracking-[0.3em] text-kasavu/90">
              {wasted ? `RACE ${res.level} • HIT THE TARMAC` : `RACE ${res.level} • TOO SLOW`}
            </div>
            <h2
              className={cn(
                "title-red font-display leading-none",
                wasted ? "text-[clamp(3rem,13vw,5.4rem)]" : "text-[clamp(2.2rem,9vw,4rem)]",
              )}
            >
              {wasted ? "WASTED" : "DISQUALIFIED"}
            </h2>
            {!wasted && (
              <p className="mt-1 text-mundu/80">
                You finished <b className="text-kasavu">{ORD[Math.max(0, res.position - 1)]}</b> — top 5 needed to qualify.
              </p>
            )}
          </div>

          <div className="kasavu-bar my-3" />
          <div className="text-center">
            <div className="text-sm tracking-widest text-mundu/70">FINAL SCORE</div>
            <div className="font-display text-[clamp(2.4rem,10vw,4rem)] leading-none tabular-nums text-kasavu">{fmt(shown)}</div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["RACES", String(res.level)],
              ["TAKEDOWNS", String(res.takedowns)],
              ["DISTANCE", `${res.distanceKm} km`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-black/30 px-1 py-2">
                <div className="font-display text-lg">{v}</div>
                <div className="text-[11px] tracking-widest text-mundu/60">{k}</div>
              </div>
            ))}
          </div>

          {myId != null && (
            <div className="anim-slide mt-3 rounded-xl border border-kasavu/60 bg-kasavu/10 p-3" style={{ animationDelay: "500ms" }}>
              <div className="mb-1 text-sm font-bold text-kasavu">
                {rank === 1 ? "NEW HIGH SCORE!" : `YOU MADE THE HALL OF FAME — #${rank}`}
              </div>
              <label className="flex items-center gap-2 text-sm text-mundu/80">
                Rider name
                <input
                  ref={inputRef}
                  value={name}
                  maxLength={10}
                  onChange={(e) => onRename(e.target.value.toUpperCase().replace(/[^A-Z0-9 ._-]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="min-w-0 flex-1 rounded-md border-2 border-kasavu/60 bg-paddy-dark px-2 py-1 font-display text-base tracking-wider text-mundu outline-none focus:border-kasavu"
                />
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button onClick={onRestart} className="btn-gold anim-pulse-gold flex-1 py-3 text-xl">
              RIDE AGAIN {touch ? "" : <Kbd>R</Kbd>}
            </button>
            <button onClick={onMenu} className="btn-ghost px-5 py-3 text-base">
              MENU {touch ? "" : <Kbd>Esc</Kbd>}
            </button>
          </div>
        </div>

        <div className="card anim-pop p-4 sm:p-5 [animation-delay:90ms]">
          <h3 className="mb-3 font-display text-lg text-kasavu sm:text-xl">HALL OF FAME</h3>
          <ScoreTable scores={scores} highlightId={myId} />
        </div>
      </div>
    </div>
  );
}
