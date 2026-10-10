import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Game } from "../game/game";
import { cn } from "../utils/cn";

function TBtn({
  className,
  style,
  onDown,
  onUp,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  onDown: () => void;
  onUp?: () => void;
  children: ReactNode;
}) {
  const [down, setDown] = useState(false);
  const release = () => {
    setDown(false);
    onUp?.();
  };
  return (
    <div
      className={cn(
        "tbtn absolute flex aspect-square flex-col items-center justify-center rounded-full border-[3px] border-kasavu/85 bg-paddy-dark/70 text-mundu shadow-[0_6px_16px_rgba(0,0,0,0.5)] backdrop-blur-[2px]",
        down && "down",
        className,
      )}
      style={style}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        setDown(true);
        onDown();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

function Fist({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-[46%] w-[46%]" style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <g fill="#ffd25a" stroke="#3a1a00" strokeWidth="3" strokeLinejoin="round">
        <rect x="14" y="24" width="38" height="26" rx="9" />
        <rect x="14" y="15" width="9" height="16" rx="4.5" />
        <rect x="23.5" y="12" width="9" height="18" rx="4.5" />
        <rect x="33" y="12" width="9" height="18" rx="4.5" />
        <rect x="42.5" y="15" width="9" height="16" rx="4.5" />
        <path d="M14 38c-9-2-10 9-3 12l12 5" />
      </g>
    </svg>
  );
}

function Bolt() {
  return (
    <svg viewBox="0 0 64 64" className="h-[46%] w-[46%]">
      <path d="M36 4 14 36h14l-4 24 26-34H34z" fill="#58c8ff" stroke="#06314a" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function SteerPad({ game, style }: { game: Game; style: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const [val, setVal] = useState(0);

  const update = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const dz = 0.07;
    const a = Math.abs(nx);
    const v = a < dz ? 0 : Math.sign(nx) * Math.min(1, (a - dz) / 0.62);
    game.input.steerAnalog = v;
    setVal(v);
  };
  const end = (id: number) => {
    if (active.current !== id) return;
    active.current = null;
    game.input.steerAnalog = 0;
    setVal(0);
  };

  return (
    <div
      ref={ref}
      className="tbtn absolute overflow-hidden rounded-[28px] border-[3px] border-kasavu/80 bg-paddy-dark/60 shadow-[0_6px_16px_rgba(0,0,0,0.5)] backdrop-blur-[2px]"
      style={style}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        active.current = e.pointerId;
        update(e.clientX);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) update(e.clientX);
      }}
      onPointerUp={(e) => end(e.pointerId)}
      onPointerCancel={(e) => end(e.pointerId)}
      onLostPointerCapture={(e) => end(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-[7%]">
        <svg viewBox="0 0 40 60" className={cn("h-[46%] transition-opacity", val < -0.05 ? "opacity-100" : "opacity-45")}>
          <path d="M30 8 10 30l20 22" fill="none" stroke="#f5b82e" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="text-center font-display text-[11px] tracking-widest text-mundu/60">STEER</div>
        <svg viewBox="0 0 40 60" className={cn("h-[46%] transition-opacity", val > 0.05 ? "opacity-100" : "opacity-45")}>
          <path d="m10 8 20 22-20 22" fill="none" stroke="#f5b82e" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div
        className="pointer-events-none absolute top-1/2 aspect-square h-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#fff3c4] bg-gradient-to-b from-[#ffe07a] to-[#e8921a] shadow-lg"
        style={{ left: `${50 + val * 36}%` }}
      />
    </div>
  );
}

export function TouchControls({ game, portrait, top }: { game: Game; portrait: boolean; top: number }) {
  const label = "pointer-events-none mt-0.5 font-display text-[10px] tracking-wider text-mundu/85";
  const containerStyle: CSSProperties = portrait ? { left: 0, right: 0, bottom: 0, top } : { left: 0, right: 0, bottom: 0, height: "47%" };

  const padStyle: CSSProperties = portrait
    ? { left: "3%", bottom: "5%", width: "56%", height: "58%" }
    : { left: "1.5%", bottom: "4%", width: "37%", height: "56%" };

  const pL: CSSProperties = portrait ? { right: "28%", bottom: "6%", width: "25%" } : { right: "20%", bottom: "5%", height: "50%" };
  const pR: CSSProperties = portrait ? { right: "2%", bottom: "6%", width: "25%" } : { right: "1.5%", bottom: "5%", height: "50%" };
  const nitro: CSSProperties = portrait ? { right: "15%", bottom: "39%", width: "26%" } : { right: "11%", bottom: "50%", height: "42%" };
  const brake: CSSProperties = portrait ? { left: "3%", bottom: "70%", width: "17%" } : { left: "1.5%", bottom: "64%", height: "30%" };

  return (
    <div className="absolute z-20 touch-none select-none" style={containerStyle}>
      <SteerPad game={game} style={padStyle} />
      <TBtn style={brake} onDown={() => (game.input.touchBrake = true)} onUp={() => (game.input.touchBrake = false)} className="border-[#ff8a7a]/80">
        <span className="pointer-events-none font-display text-[11px] tracking-wider text-[#ffb3a8]">BRAKE</span>
      </TBtn>
      <TBtn style={nitro} onDown={() => (game.input.touchNitro = true)} onUp={() => (game.input.touchNitro = false)} className="border-[#58c8ff]/90">
        <Bolt />
        <span className={label}>NITRO</span>
      </TBtn>
      <TBtn style={pL} onDown={() => game.input.pressPunch(-1)}>
        <Fist flip />
        <span className={label}>PUNCH L</span>
      </TBtn>
      <TBtn style={pR} onDown={() => game.input.pressPunch(1)}>
        <Fist />
        <span className={label}>PUNCH R</span>
      </TBtn>
    </div>
  );
}
