import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game } from "./game/game";
import type { Mode, RaceResult, RunResult } from "./game/types";
import { loadScores, saveScores, renameScore, qualifies, bestScore } from "./game/scores";
import type { ScoreEntry } from "./game/scores";
import {
  dbLoadSettings,
  dbSaveSettings,
  dbLoadScores,
  dbAddScore,
  dbRenameScore,
  dbAddRace,
  dbRecentRaces,
  dbBumpStats,
  dbLoadStats,
  dbUpsertPlayer,
  dbWipe,
  dbStorageInfo,
  dbPlayers,
} from "./game/db";
import type { PlayerRecord, RaceRecord, Stats } from "./game/db";
import { DEFAULT_SETTINGS, sanitizeName } from "./game/settings";
import type { Difficulty, EngineSound, Settings } from "./game/settings";
import { Room, makeRoomCode, normalizeCode } from "./game/net";
import type { MpResult } from "./game/net";
import { GameOverScreen, MenuScreen, MuteButton, PauseScreen, ResultScreen } from "./components/Overlays";
import { MpResultsPanel, MultiplayerScreen } from "./components/Multiplayer";
import { OptionsScreen } from "./components/Options";
import { TouchControls } from "./components/TouchControls";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0 || !!window.matchMedia?.("(pointer: coarse)").matches;
}

function viewport() {
  const vv = window.visualViewport;
  return { w: Math.round(vv?.width ?? window.innerWidth), h: Math.round(vv?.height ?? window.innerHeight) };
}

interface Layout {
  w: number;
  h: number;
  x: number;
  y: number;
  portrait: boolean;
}

function computeLayout(vw: number, vh: number, touch: boolean): Layout {
  const portrait = vh > vw * 1.1;
  if (portrait) {
    const w = vw;
    const h = Math.round(Math.min(vw * 0.95, vh * 0.58));
    return { w, h, x: 0, y: touch ? 0 : Math.round((vh - h) / 2), portrait: true };
  }
  const aspect = clamp(vw / vh, 1.3, 2.25);
  let w = vw;
  let h = Math.round(vw / aspect);
  if (h > vh) {
    h = vh;
    w = Math.round(h * aspect);
  }
  return { w, h, x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), portrait: false };
}

type Screen = "menu" | "options" | "mp" | null;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const roomRef = useRef<Room | null>(null);
  const modeRef = useRef<Mode>("menu");
  const stampRef = useRef(0);
  const myIdRef = useRef<number | null>(null);
  const settingsRef = useRef<Settings>({ ...DEFAULT_SETTINGS });

  const [mode, setMode] = useState<Mode>("menu");
  const [screen, setScreen] = useState<Screen>("menu");
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [result, setResult] = useState<RaceResult | null>(null);
  const [over, setOver] = useState<RunResult | null>(null);
  const [mpResults, setMpResults] = useState<MpResult[] | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [name, setName] = useState(() => loadScores()[0]?.name ?? "RIDER");
  const [muted, setMuted] = useState(false);
  const [touch, setTouch] = useState(() => detectTouch());
  const [vp, setVp] = useState(() => viewport());
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [stats, setStats] = useState<Stats | null>(null);
  const [races, setRaces] = useState<RaceRecord[]>([]);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [storage, setStorage] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [mpStatus, setMpStatus] = useState<{ text: string; kind: "info" | "error" } | null>(null);

  const layout = useMemo(() => computeLayout(vp.w, vp.h, touch), [vp.w, vp.h, touch]);

  /* ---------------- load persisted data ---------------- */
  const refreshData = useCallback(async () => {
    const [s, sc, st, rc, pl, info] = await Promise.all([
      dbLoadSettings(),
      dbLoadScores(),
      dbLoadStats(),
      dbRecentRaces(10),
      dbPlayers(12),
      dbStorageInfo(),
    ]);
    setSettings(s);
    settingsRef.current = s;
    setScores(sc.slice(0, 8));
    setStats(st);
    setRaces(rc);
    setPlayers(pl);
    setStorage(`${info.type} · ${info.races} races stored`);
    setName(s.name);
    setMuted(s.muted);
    return s;
  }, []);

  /* ---------------- create the game once ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, {
      onMode: (m) => {
        modeRef.current = m;
        stampRef.current = performance.now();
        setMode(m);
        if (m !== "result") setMpResults(null);
      },
      onResult: (r) => setResult(r),
      onMpResults: (rows) => setMpResults(rows),
      onOver: async (r) => {
        const s = settingsRef.current;
        const list = await dbLoadScores();
        const rider = sanitizeName(s.name);
        if (qualifies(list.slice(0, 8), r.score)) {
          const out = await dbAddScore({ name: rider, score: r.score, level: r.level, takedowns: r.takedowns });
          setScores(out.list);
          setMyId(out.id);
          myIdRef.current = out.id;
        } else {
          setScores(list.slice(0, 8));
          setMyId(null);
          myIdRef.current = null;
        }
        await dbAddRace({
          date: Date.now(),
          mode: "single",
          level: r.level,
          position: r.position,
          total: 8,
          score: r.score,
          takedowns: r.takedowns,
          timeSec: 0,
          reason: r.reason === "wasted" ? "wasted" : "disqualified",
        });
        await dbBumpStats({
          races: 1,
          takedowns: r.takedowns,
          km: r.distanceKm,
          bestScore: r.score,
          wins: r.position === 1 ? 1 : 0,
          podiums: r.position <= 3 ? 1 : 0,
          playMs: 0,
        });
        await dbUpsertPlayer(rider, { races: 1, wins: r.position === 1 ? 1 : 0, bestScore: r.score, takedowns: r.takedowns });
        setStats(await dbLoadStats());
        setRaces(await dbRecentRaces(10));
        setName(rider);
        setOver(r);
      },
    });
    gameRef.current = game;
    void refreshData().then((s) => {
      game.applySettings(s);
      game.best = bestScore(loadScores());
    });
    const v = viewport();
    const l = computeLayout(v.w, v.h, detectTouch());
    game.resize(l.w, l.h);
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [refreshData]);

  /* ---------------- keep canvas size in sync ---------------- */
  useEffect(() => {
    gameRef.current?.resize(layout.w, layout.h);
  }, [layout.w, layout.h]);

  useEffect(() => {
    const onResize = () => setVp(viewport());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const g = gameRef.current;
    if (g) {
      g.input.autoThrottle = touch;
      g.input.usedTouch = touch;
    }
  }, [touch, mode]);

  useEffect(() => {
    const g = gameRef.current;
    if (g) g.best = bestScore(scores);
  }, [scores]);

  useEffect(() => {
    const onPtr = (e: PointerEvent) => {
      if (e.pointerType === "touch") setTouch(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code.startsWith("Arrow") || e.code === "KeyZ" || e.code === "KeyX" || e.code === "Space") setTouch(false);
    };
    window.addEventListener("pointerdown", onPtr, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPtr);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /* ---------------- settings ---------------- */
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      settingsRef.current = next;
      gameRef.current?.applySettings(next);
      void dbSaveSettings(next);
      return next;
    });
  }, []);

  const previewEngine = useCallback((e: EngineSound) => {
    const g = gameRef.current;
    if (!g) return;
    g.applySettings({ ...settingsRef.current, engineSound: e });
    g.audio.unlock();
    g.audio.previewEngine();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const n = !m;
      patchSettings({ muted: n });
      return n;
    });
  }, [patchSettings]);

  /* ---------------- multiplayer room lifecycle ---------------- */
  const leaveRoom = useCallback(() => {
    roomRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setMpStatus(null);
    gameRef.current?.detachRoom();
  }, []);

  /**
   * Back to the home screen. The game only flips its own mode to "menu"; the
   * overlay is driven by `screen`, so this must reset that too — otherwise you
   * land on the live canvas with no UI. Any open room is released as well, so
   * its invite code (and WebRTC id) is freed for the next room.
   */
  const toHome = useCallback(() => {
    leaveRoom();
    setMpResults(null);
    setScreen("menu");
    gameRef.current?.goMenu();
  }, [leaveRoom]);

  const joinRoom = useCallback(
    (rawCode: string) => {
      const g = gameRef.current;
      if (!g) return;
      // Never stack rooms: a leftover hub keeps the invite code (and its
      // WebRTC id) locked, so re-joining would silently start a second room.
      leaveRoom();
      const code = normalizeCode(rawCode) || makeRoomCode();
      const s = settingsRef.current;
      const r = new Room(code, sanitizeName(s.name), s.bikeColor, s.relayUrl);
      r.hooks.onStatus = (text, kind) => setMpStatus({ text, kind });
      roomRef.current = r;
      setRoom(r);
      g.attachRoom(r);
      g.unlockAudio();
      if (!rawCode) setMpStatus({ text: `Room ${code} created — share the code!`, kind: "info" });
      else setMpStatus({ text: `Joining room ${code}…`, kind: "info" });
      void dbSaveSettings(s);
    },
    [leaveRoom],
  );

  const hostStart = useCallback(() => {
    const g = gameRef.current;
    const r = roomRef.current;
    if (!g || !r || !r.isHost) return;
    const cfg = g.makeMpCfg();
    if (r.startRace(cfg)) {
      setScreen(null);
      g.startMultiplayer(cfg);
      setMpStatus({ text: "Race started!", kind: "info" });
    } else {
      setMpStatus({ text: "You are not the host.", kind: "error" });
    }
  }, []);

  // start when the host says so (peers)
  useEffect(() => {
    if (!room) return;
    // IMPORTANT: the Game installs its own onStart/onAgain handlers in
    // attachRoom(). Wrap them instead of replacing, otherwise a guest would
    // just close the lobby and never actually start the race.
    const gameStart = room.hooks.onStart;
    const gameAgain = room.hooks.onAgain;
    room.hooks.onStart = (cfg) => {
      setScreen(null);
      setMpResults(null);
      gameStart?.(cfg);
    };
    room.hooks.onAgain = (cfg) => {
      setScreen(null);
      setMpResults(null);
      gameAgain?.(cfg);
    };
    return () => {
      room.hooks.onStart = gameStart;
      room.hooks.onAgain = gameAgain;
    };
  }, [room]);

  // record multiplayer results
  useEffect(() => {
    const g = gameRef.current;
    if (!g || !mpResults || !room) return;
    const mine = mpResults.find((r) => r.pid === room.me.pid);
    if (!mine) return;
    const rider = sanitizeName(settingsRef.current.name);
    void (async () => {
      await dbAddRace({
        date: Date.now(),
        mode: "multi",
        level: g.level,
        position: mine.pos,
        total: mpResults.length,
        score: mine.score || Math.round(g.score),
        takedowns: mine.takedowns,
        timeSec: mine.timeSec,
        reason: "finished",
        code: room.code,
        players: mpResults.filter((r) => !r.isAi).map((r) => r.name),
      });
      await dbBumpStats({
        races: 1,
        multiRaces: 1,
        takedowns: mine.takedowns,
        wins: mine.pos === 1 ? 1 : 0,
        podiums: mine.pos <= 3 ? 1 : 0,
        bestScore: mine.score,
      });
      await dbUpsertPlayer(rider, { races: 1, wins: mine.pos === 1 ? 1 : 0, bestScore: mine.score, takedowns: mine.takedowns });
      const list = await dbLoadScores();
      if (qualifies(list.slice(0, 8), Math.round(g.score))) {
        const out = await dbAddScore({ name: rider, score: Math.round(g.score), level: g.level, takedowns: mine.takedowns });
        setScores(out.list);
        setMyId(out.id);
        myIdRef.current = out.id;
      }
      setStats(await dbLoadStats());
      setRaces(await dbRecentRaces(10));
    })();
  }, [mpResults, room]);

  /* ---------------- keyboard shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "INPUT") {
        if (e.key === "Enter") (t as HTMLInputElement).blur();
        return;
      }
      if (e.repeat) return;
      const g = gameRef.current;
      if (!g) return;
      const m = modeRef.current;
      const since = performance.now() - stampRef.current;
      if (e.code === "KeyM") {
        toggleMute();
        return;
      }
      if (screen === "options" || screen === "mp") {
        if (e.code === "Escape") {
          if (screen === "mp" && room) leaveRoom();
          setScreen("menu");
        }
        return;
      }
      if (screen === "menu" && m === "menu") {
        if (e.code === "KeyO") setScreen("options");
        else if (e.code === "KeyM" && !room) setScreen("mp");
      }
      switch (m) {
        case "menu":
          if (e.code === "Enter" || e.code === "Space") {
            e.preventDefault();
            setScreen(null);
            g.start();
          }
          break;
        case "playing":
          if (e.code === "Escape" || e.code === "KeyP") g.pause();
          else if (e.code === "KeyR") g.restart();
          break;
        case "paused":
          if (e.code === "Escape" || e.code === "KeyP" || e.code === "Enter") g.resume();
          else if (e.code === "KeyR") g.restart();
          else if (e.code === "KeyQ") toHome();
          break;
        case "result":
          if ((e.code === "Enter" || e.code === "Space") && since > 600) {
            e.preventDefault();
            if (g.mp) g.nextRace();
            else {
              setScreen(null);
              g.nextRace();
            }
          }
          break;
        case "over":
          if (e.code === "KeyR" || ((e.code === "Enter" || e.code === "Space") && since > 700)) {
            e.preventDefault();
            g.restart();
          } else if (e.code === "Escape") g.goMenu();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute, screen, room, leaveRoom, toHome]);

  // auto-pause when the window loses focus
  useEffect(() => {
    const onBlur = () => {
      if (modeRef.current === "playing") gameRef.current?.pause();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  const onRename = (n: string) => {
    setName(n);
    const final = sanitizeName(n);
    patchSettings({ name: final });
    const id = myIdRef.current;
    if (id != null) {
      setScores((prev) => {
        const next = renameScore(prev, id, final);
        void dbRenameScore(id, final);
        return next;
      });
    }
  };

  const onWipe = async () => {
    await dbWipe();
    setScores([]);
    setStats(null);
    setRaces([]);
    setPlayers([]);
    setMyId(null);
    myIdRef.current = null;
    saveScores([]);
    const fresh = { ...DEFAULT_SETTINGS, name: "RIDER" };
    setSettings(fresh);
    settingsRef.current = fresh;
    gameRef.current?.applySettings(fresh);
    await refreshData();
  };

  const g = gameRef.current;
  const showMpPanel = mode === "result" && mpResults && room;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_20%,#0f5a41_0%,#06241b_70%)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute overflow-hidden" style={{ left: layout.x, top: layout.y, width: layout.w, height: layout.h }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />

        {mode === "playing" && (
          <div className="absolute right-2 top-2 z-20 flex gap-1.5">
            <button
              aria-label="Pause"
              onClick={(e) => {
                e.currentTarget.blur();
                gameRef.current?.pause();
              }}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-kasavu/70 bg-paddy-dark/80 text-mundu backdrop-blur transition hover:bg-kasavu/25 active:scale-90"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="5" y="4" width="5" height="16" rx="1.5" />
                <rect x="14" y="4" width="5" height="16" rx="1.5" />
              </svg>
            </button>
            <MuteButton muted={muted} onToggle={toggleMute} className="h-[34px] w-[34px]" />
          </div>
        )}

        {touch && mode === "playing" && !layout.portrait && g && <TouchControls game={g} portrait={false} top={0} />}
      </div>

      {touch && mode === "playing" && layout.portrait && g && (
        <TouchControls game={g} portrait top={layout.y + layout.h} />
      )}

      {mode === "menu" && screen === "menu" && (
        <MenuScreen
          scores={scores}
          touch={touch}
          muted={muted}
          onToggleMute={toggleMute}
          onStart={() => {
            setScreen(null);
            gameRef.current?.start();
          }}
          onOptions={() => setScreen("options")}
          onMultiplayer={() => setScreen("mp")}
          stats={stats}
        />
      )}

      {screen === "options" && (
        <OptionsScreen
          settings={settings}
          stats={stats}
          races={races}
          players={players}
          storage={storage}
          onChange={patchSettings}
          onPreviewEngine={previewEngine}
          onClose={() => setScreen("menu")}
          onWipe={onWipe}
        />
      )}

      {screen === "mp" && (
        <MultiplayerScreen
          settings={settings}
          onChange={patchSettings}
          onJoin={joinRoom}
          onLeave={() => {
            if (room) leaveRoom();
            setScreen("menu");
          }}
          room={room}
          status={mpStatus}
          onDiffPick={(d: Difficulty) => patchSettings({ difficulty: d })}
        />
      )}

      {screen === "mp" && room && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
          <button
            onClick={hostStart}
            disabled={!room.isHost}
            className={room.isHost ? "btn-gold anim-pulse-gold" : "btn-ghost opacity-60"}
            style={{ pointerEvents: "auto", padding: "12px 44px", fontSize: 22 }}
          >
            {room.isHost ? "START RACE" : "WAITING FOR HOST"}
          </button>
        </div>
      )}

      {mode === "paused" && (
        <PauseScreen
          muted={muted}
          touch={touch}
          onToggleMute={toggleMute}
          onResume={() => gameRef.current?.resume()}
          onRestart={() => gameRef.current?.restart()}
          onMenu={toHome}
        />
      )}

      {mode === "result" && result && (
        <ResultScreen
          res={result}
          onNext={() => {
            if (room) gameRef.current?.nextRace();
            else {
              setScreen(null);
              gameRef.current?.nextRace();
            }
          }}
          embedded={showMpPanel ? true : false}
        >
          {showMpPanel && (
            <MpResultsPanel
              rows={mpResults}
              localPid={room.me.pid}
              isHost={room.isHost}
              onAgain={() => gameRef.current?.nextRace()}
              onLeave={() => {
                leaveRoom();
                gameRef.current?.goMenu();
                setScreen("menu");
              }}
            />
          )}
        </ResultScreen>
      )}

      {mode === "over" && over && (
        <GameOverScreen
          res={over}
          scores={scores}
          myId={myId}
          name={name}
          touch={touch}
          onRename={onRename}
          onRestart={() => gameRef.current?.restart()}
          onMenu={toHome}
        />
      )}
    </div>
  );
}


