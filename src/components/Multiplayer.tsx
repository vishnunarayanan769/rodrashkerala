import { useEffect, useRef, useState } from "react";
import type { Room, MpPlayer, MpResult, StartCfg } from "../game/net";
import { MAX_RIDERS, normalizeCode } from "../game/net";
import { BIKE_COLORS, DIFFICULTY } from "../game/settings";
import type { Difficulty, Settings } from "../game/settings";
import { fmt } from "../game/util";
import { cn } from "../utils/cn";
import { Kbd } from "./Overlays";

const ORD = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"];

export function MultiplayerScreen({
  settings,
  onChange,
  onJoin,
  onLeave,
  room,
  status,
  onDiffPick,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
  room: Room | null;
  status: { text: string; kind: "info" | "error" } | null;
  onDiffPick: (d: Difficulty) => void;
}) {
  const [code, setCode] = useState("");
  const [chat, setChat] = useState("");
  const [log, setLog] = useState<{ name: string; text: string; mine: boolean }[]>([]);
  const [players, setPlayers] = useState<MpPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!room) return;
    setPlayers(room.playerList());
    setIsHost(room.isHost);
    room.hooks.onPlayers = (ps) => {
      setPlayers(ps);
      setIsHost(room.isHost);
    };
    room.hooks.onChat = (name, text, mine) => {
      setLog((l) => [...l.slice(-40), { name, text, mine }]);
    };
    const prevStatus = room.hooks.onStatus;
    room.hooks.onStatus = (text, kind) => {
      prevStatus?.(text, kind);
      setLog((l) => [...l.slice(-40), { name: "•", text, mine: false }]);
    };
    return () => {
      room.hooks.onPlayers = undefined;
      room.hooks.onChat = undefined;
      room.hooks.onStatus = prevStatus;
    };
  }, [room]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: 1e6 });
  }, [log]);

  const humans = players.length || 1;
  const total = Math.max(humans, Math.min(MAX_RIDERS, settings.maxRiders));
  const ai = Math.max(0, total - humans);

  if (!room) {
    return (
      <div className="anim-fade fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(2,18,12,0.5),rgba(2,12,8,0.9))] p-3 sm:p-5">
        <div className="card anim-pop my-auto w-full max-w-md p-5">
          <h2 className="title-3d font-display text-3xl sm:text-4xl">MULTIPLAYER</h2>
          <p className="mt-1 text-sm text-mundu/75">
            Race up to <b className="text-kasavu">10 bikes</b> with one invite code. Any empty slots are filled by computer
            riders.
          </p>
          <div className="kasavu-bar my-3" />
          <label className="block text-sm text-mundu/85">Your name</label>
          <input
            value={settings.name}
            maxLength={12}
            onChange={(e) => onChange({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9 ._-]/g, "") })}
            className="mt-1 mb-3 w-full rounded-md border-2 border-kasavu/60 bg-paddy-dark px-3 py-2 font-display text-base tracking-wider text-mundu outline-none focus:border-kasavu"
          />
          <button
            onClick={() => onJoin("")}
            className="btn-gold anim-pulse-gold mb-3 w-full py-3 text-xl"
          >
            CREATE ROOM
          </button>
          <div className="text-sm text-mundu/85">Join a friend&apos;s room</div>
          <div className="mt-1 flex gap-2">
            <input
              value={code}
              maxLength={5}
              placeholder="CODE"
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && normalizeCode(code).length >= 4) onJoin(normalizeCode(code));
              }}
              className="min-w-0 flex-1 rounded-md border-2 border-kasavu/60 bg-paddy-dark px-3 py-2 font-display text-xl tracking-[0.3em] text-mundu outline-none focus:border-kasavu"
            />
            <button
              disabled={normalizeCode(code).length < 4}
              onClick={() => onJoin(normalizeCode(code))}
              className="btn-ghost px-5 py-2 font-display text-sm disabled:opacity-40"
            >
              JOIN
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-mundu/55">
            One code works across devices — riders connect peer to peer, so the host stays host and guests join the same
            room. Keep the host&apos;s tab open and on screen while others join.
          </p>
          <button onClick={onLeave} className="btn-ghost mt-3 w-full py-2 text-sm">
            BACK <Kbd>Esc</Kbd>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="anim-fade fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(2,18,12,0.5),rgba(2,12,8,0.9))] p-3 sm:p-5">
      <div className="my-auto grid w-full max-w-3xl gap-3 md:grid-cols-[1.1fr_1fr]">
        <div className="card anim-pop p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] tracking-[0.25em] text-kasavu">ROOM CODE</div>
              <div className="title-3d font-display text-[clamp(2rem,9vw,3.2rem)] leading-none tracking-[0.12em]">{room.code}</div>
            </div>
            <div className="text-right">
              <div className={cn("font-display text-sm", isHost ? "text-kasavu" : "text-mundu/70")}>{isHost ? "HOST" : "GUEST"}</div>
              <div className="text-[11px] text-mundu/55">
                {room.transportKind === "relay" ? "relay server" : room.transportKind === "p2p" ? "online · peer to peer" : "this browser"}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(room.code).catch(() => undefined);
            }}
            className="btn-ghost mt-2 w-full py-2 text-[12px]"
          >
            COPY INVITE CODE
          </button>
          <div className="mt-1 text-center text-[11px] text-mundu/55">
            Friends: Multiplayer → Join → enter this code
          </div>

          <div className="kasavu-bar my-3" />

          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="font-display text-[13px] tracking-wider text-kasavu">RIDERS IN ROOM</h3>
            <span className="text-[11px] text-mundu/55">
              {humans} human{humans === 1 ? "" : "s"} + {ai} computer
            </span>
          </div>
          <ul className="space-y-1">
            {players.map((p, i) => (
              <li key={p.pid} className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1.5 text-sm">
                <span className="w-4 text-[11px] text-mundu/50">{i + 1}</span>
                <span className="h-4 w-4 rounded border border-black/40" style={{ background: BIKE_COLORS[p.color]?.shirt || "#fff" }} />
                <span className="flex-1 truncate font-display text-[12px]">{p.name}</span>
                {p.pid === room.me.pid && <span className="text-[10px] text-kasavu">YOU</span>}
                {p.host && <span className="text-[10px] text-mundu/60">HOST</span>}
              </li>
            ))}
            {Array.from({ length: ai }).map((_, i) => (
              <li key={"ai" + i} className="flex items-center gap-2 rounded-lg bg-black/15 px-2 py-1.5 text-sm opacity-60">
                <span className="w-4 text-[11px] text-mundu/40">–</span>
                <span className="h-4 w-4 rounded border border-black/40 bg-mundu/30" />
                <span className="flex-1 font-display text-[12px] text-mundu/70">COMPUTER RIDER</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card anim-pop p-4 sm:p-5 [animation-delay:90ms]">
          <h3 className="mb-2 font-display text-[13px] tracking-wider text-kasavu">RACE SETUP</h3>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-sm text-mundu/85">Grid size</div>
              <div className="flex flex-wrap gap-1.5">
                {[4, 6, 8, 10].map((n) => (
                  <button
                    key={n}
                    disabled={!isHost}
                    onClick={() => onChange({ maxRiders: n })}
                    className={cn(
                      "rounded-lg border-2 px-3 py-1.5 font-display text-[12px] transition",
                      settings.maxRiders === n ? "border-kasavu bg-kasavu/25" : "border-kasavu/25 bg-black/20 text-mundu/70",
                      !isHost && "opacity-50",
                    )}
                  >
                    {n} BIKES
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm text-mundu/85">Difficulty</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    disabled={!isHost}
                    onClick={() => onDiffPick(d)}
                    className={cn(
                      "rounded-lg border-2 px-2 py-1.5 font-display text-[11px] transition",
                      settings.difficulty === d ? "border-kasavu bg-kasavu/25" : "border-kasavu/25 bg-black/20 text-mundu/70",
                      !isHost && "opacity-50",
                    )}
                  >
                    {DIFFICULTY[d].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-kasavu/25 bg-black/20 p-2">
              <div className="mb-1 text-[11px] tracking-wider text-kasavu">PIT CHATTER</div>
              <div ref={logRef} className="h-24 overflow-y-auto text-[12px] leading-snug">
                {log.length === 0 && <div className="text-mundu/45">Say hello to the pack…</div>}
                {log.map((l, i) => (
                  <div key={i} className={l.mine ? "text-kasavu" : "text-mundu/85"}>
                    <b className="font-display text-[11px]">{l.name}: </b>
                    {l.text}
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  room.chat(chat);
                  setChat("");
                }}
                className="mt-1.5 flex gap-1.5"
              >
                <input
                  value={chat}
                  maxLength={90}
                  onChange={(e) => setChat(e.target.value)}
                  placeholder="message…"
                  className="min-w-0 flex-1 rounded-md border-2 border-kasavu/40 bg-paddy-dark px-2 py-1 text-sm text-mundu outline-none focus:border-kasavu"
                />
                <button className="btn-ghost px-3 py-1 font-display text-[11px]">SEND</button>
              </form>
            </div>

            {status && (
              <div className={cn("rounded-lg px-2 py-1.5 text-[12px]", status.kind === "error" ? "bg-[#7a1d12]/60 text-[#ffb3a8]" : "bg-black/25 text-mundu/70")}>
                {status.text}
              </div>
            )}

            <button onClick={onLeave} className="btn-ghost w-full py-2 text-sm">
              LEAVE ROOM
            </button>
            <p className="text-center text-[11px] text-mundu/55">
              {isHost ? "Press START when everyone is in." : "Waiting for the host to start…"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MpResultsPanel({
  rows,
  localPid,
  isHost,
  onAgain,
  onLeave,
}: {
  rows: MpResult[];
  localPid: string;
  isHost: boolean;
  onAgain: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="anim-slide mt-3 rounded-xl border border-kasavu/50 bg-black/30 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-[13px] tracking-wider text-kasavu">RACE STANDINGS</h3>
        <span className="text-[11px] text-mundu/55">{rows.length} riders</span>
      </div>
      <ol className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.pid}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1 text-sm",
              r.pid === localPid ? "bg-kasavu/25 ring-1 ring-kasavu" : "bg-black/25",
            )}
          >
            <span className="w-9 font-display text-[12px] text-kasavu">{ORD[r.pos - 1] || r.pos}</span>
            <span className="h-4 w-4 rounded border border-black/40" style={{ background: BIKE_COLORS[r.color]?.shirt || "#fff" }} />
            <span className="flex-1 truncate font-display text-[12px]">
              {r.name}
              {r.isAi && <span className="ml-1 text-[10px] text-mundu/50">CPU</span>}
              {r.dnf && <span className="ml-1 text-[10px] text-mundu/50">DNF</span>}
            </span>
            <span className="text-[11px] tabular-nums text-mundu/70">{r.timeSec ? `${Math.floor(r.timeSec)}s` : "—"}</span>
            <span className="w-16 text-right text-[12px] tabular-nums text-kasavu">{fmt(r.score)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {isHost ? (
          <button onClick={onAgain} className="btn-gold flex-1 py-2.5 text-lg">
            NEXT RACE →
          </button>
        ) : (
          <div className="flex-1 rounded-xl border-2 border-kasavu/30 bg-black/25 py-2.5 text-center text-sm text-mundu/65">
            Waiting for the host…
          </div>
        )}
        <button onClick={onLeave} className="btn-ghost px-4 py-2.5 text-sm">
          LEAVE ROOM
        </button>
      </div>
    </div>
  );
}

export type { StartCfg };
