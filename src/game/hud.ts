import type { Game } from './game';
import { RIVAL_STYLES } from './sprites';
import { fmt, clamp } from './util';

// kept in sync with game.ts
const MAX_SPEED = 12000;
const QUALIFY = 5;
const TOTAL = 8;
const START_Z = 1000;

const GOLD = '#f5b82e';
const CREAM = '#fff3d1';

export function setTagFont(g: CanvasRenderingContext2D, size: number) {
  g.font = `${size}px Bungee, "Arial Black", Impact, sans-serif`;
}

function setFont(g: CanvasRenderingContext2D, size: number, fam: 'B' | 'R') {
  g.font = fam === 'B' ? `${size}px Bungee, "Arial Black", Impact, sans-serif` : `700 ${size}px Rajdhani, "Arial Narrow", sans-serif`;
}

function text(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
  fam: 'B' | 'R' = 'B',
  outline = 'rgba(0,0,0,0.72)',
) {
  setFont(g, size, fam);
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  if (outline) {
    g.lineWidth = Math.max(2, size * 0.18);
    g.strokeStyle = outline;
    g.lineJoin = 'round';
    g.strokeText(s, x, y);
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, u: number) {
  rrect(g, x, y, w, h, r);
  g.fillStyle = 'rgba(8,22,16,0.6)';
  g.fill();
  g.lineWidth = Math.max(1, 1.4 * u);
  g.strokeStyle = 'rgba(245,184,46,0.55)';
  g.stroke();
}

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string, u: number) {
  rrect(g, x, y, w, h, h / 2);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fill();
  const fw = Math.max(0, Math.min(1, pct)) * (w - 2 * u);
  if (fw > 1) {
    rrect(g, x + u, y + u, fw, h - 2 * u, (h - 2 * u) / 2);
    g.fillStyle = color;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    rrect(g, x + u, y + u, fw, (h - 2 * u) * 0.4, (h - 2 * u) * 0.2);
    g.fill();
  }
  rrect(g, x, y, w, h, h / 2);
  g.lineWidth = Math.max(1, u);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.stroke();
}

const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];

export function drawHud(g: CanvasRenderingContext2D, G: Game) {
  const W = G.W;
  const H = G.H;
  const u = G.u;
  const P = G.P;
  const pad = 10 * u;
  g.save();
  g.lineJoin = 'round';

  // ---------- low hp pulse ----------
  if (P.hp < 25 && G.phase !== 'dead') {
    const a = 0.25 + 0.2 * Math.sin(G.time * 9);
    g.strokeStyle = `rgba(255,30,30,${a})`;
    g.lineWidth = 10 * u;
    g.strokeRect(0, 0, W, H);
  }

  // ---------- position ----------
  panel(g, pad, pad, 98 * u, 54 * u, 8 * u, u);
  text(g, 'POS', pad + 10 * u, pad + 17 * u, 12 * u, GOLD, 'left', 'R', '');
  const posCol = G.rankFlash > 0.15 ? '#7dff9b' : G.rankFlash < -0.15 ? '#ff6b5c' : '#ffffff';
  const popS = 1 + Math.abs(G.rankFlash) * 0.18;
  g.save();
  g.translate(pad + 10 * u, pad + 46 * u);
  g.scale(popS, popS);
  text(g, String(G.rank), 0, 0, 34 * u, posCol, 'left');
  g.restore();
  const fieldSize = G.mp ? G.mp.total : TOTAL;
  text(g, '/' + fieldSize, pad + 46 * u, pad + 46 * u, 15 * u, 'rgba(255,255,255,0.7)', 'left');
  if (G.mp) {
    const lead = G.rank === 1;
    text(g, lead ? 'LEADING' : 'CHASING', pad + 46 * u, pad + 22 * u, 9 * u, lead ? '#7dff9b' : '#fff3d1', 'left', 'R', '');
  } else {
    const q = G.rank <= QUALIFY;
    text(g, q ? 'QUALIFYING' : 'TOP 5 NEEDED', pad + 46 * u, pad + 22 * u, 9 * u, q ? '#7dff9b' : '#ff9a8a', 'left', 'R', '');
  }

  // ---------- hp / nitro ----------
  const bx = pad;
  const by = pad + 62 * u;
  const lw = 26 * u;
  const bw = 78 * u;
  text(g, 'HP', bx, by + 9 * u, 10 * u, '#ffb3ad', 'left', 'R');
  const hpPct = P.hp / 100;
  bar(g, bx + lw, by, bw, 11 * u, hpPct, hpPct > 0.5 ? '#46d46b' : hpPct > 0.25 ? '#ffc53d' : '#ff4d4d', u);
  text(g, 'NOS', bx, by + 25 * u, 10 * u, '#9ee3ff', 'left', 'R');
  const flick = P.nitroOn ? 0.7 + 0.3 * Math.sin(G.time * 40) : 1;
  g.globalAlpha = flick;
  bar(g, bx + lw, by + 16 * u, bw, 11 * u, P.nitro / 100, P.nitroOn ? '#ffffff' : '#3fb8ff', u);
  g.globalAlpha = 1;
  if (P.weapon > 0) {
    text(g, 'CHENDA KOL x' + P.weapon, bx, by + 44 * u, 11 * u, '#ffcf6b', 'left', 'R');
  }

  // ---------- score ----------
  const rx = W - G.rightPad - 6 * u;
  text(g, 'SCORE', rx, pad + 13 * u, 11 * u, GOLD, 'right', 'R', '');
  const pop = 1 + G.scorePop * 0.2;
  g.save();
  g.translate(rx, pad + 40 * u);
  g.scale(pop, pop);
  text(g, fmt(G.dispScore), 0, 0, 26 * u, '#ffffff', 'right');
  g.restore();
  text(g, 'BEST ' + fmt(Math.max(G.best, G.score)), rx, pad + 55 * u, 11 * u, 'rgba(255,255,255,0.7)', 'right', 'R', '');
  if (G.comboCount > 0) {
    const cy = pad + 86 * u;
    const cp = 1 + (G.comboT > 4.1 ? (G.comboT - 4.1) * 1.4 : 0);
    g.save();
    g.translate(rx, cy);
    g.scale(cp, cp);
    text(g, 'x' + G.mult, 0, 0, 28 * u, G.mult >= 4 ? '#ff5d3d' : '#ff9f1c', 'right');
    g.restore();
    text(g, G.comboCount + ' CHAIN', rx - 46 * u * (G.mult >= 10 ? 1.4 : 1), cy - 2 * u, 11 * u, CREAM, 'right', 'R');
    bar(g, rx - 72 * u, cy + 6 * u, 72 * u, 6 * u, G.comboT / 4.4, '#ff9f1c', u * 0.8);
  }

  // ---------- race progress ----------
  const left = pad + 98 * u + 14 * u;
  const right = rx - 132 * u;
  const pbw = Math.min(300 * u, right - left);
  if (pbw > 70 * u) {
    const cx = (left + right) / 2;
    const x0 = cx - pbw / 2;
    const y0 = pad + 6 * u;
    const bh = 9 * u;
    const finishZ = G.track.finishZ;
    const span = finishZ - START_Z;
    rrect(g, x0, y0, pbw, bh, bh / 2);
    g.fillStyle = 'rgba(8,22,16,0.7)';
    g.fill();
    g.lineWidth = Math.max(1, 1.2 * u);
    g.strokeStyle = 'rgba(245,184,46,0.6)';
    g.stroke();
    const prog = clamp((P.pos + 840 - START_Z) / span, 0, 1);
    rrect(g, x0 + u, y0 + u, Math.max(2, (pbw - 2 * u) * prog), bh - 2 * u, (bh - 2 * u) / 2);
    g.fillStyle = 'rgba(245,184,46,0.45)';
    g.fill();
    // zone ticks
    const zs = G.track.zoneStart;
    g.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 1; i < zs.length; i++) {
      const f = clamp((zs[i] * 200 - START_Z) / span, 0, 1);
      g.fillRect(x0 + pbw * f - 0.5 * u, y0, Math.max(1, u), bh);
    }
    // finish flag
    g.fillStyle = '#f4f1e8';
    g.fillRect(x0 + pbw - 3 * u, y0 - 2 * u, 3 * u, bh + 4 * u);
    // rivals
    for (const e of G.rivals) {
      const f = clamp((e.z - START_Z) / span, 0, 1);
      g.fillStyle = RIVAL_STYLES[e.ci % RIVAL_STYLES.length].shirt;
      g.globalAlpha = e.state === 'down' ? 0.4 : 1;
      g.beginPath();
      g.arc(x0 + pbw * f, y0 + bh / 2, 3 * u, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
    if (G.cop && G.cop.state !== 'down') {
      const f = clamp((G.cop.z - START_Z) / span, 0, 1);
      g.fillStyle = ((G.time * 8) | 0) % 2 ? '#ff3b3b' : '#3b7bff';
      g.beginPath();
      g.arc(x0 + pbw * f, y0 + bh / 2, 3.4 * u, 0, 6.283);
      g.fill();
    }
    g.fillStyle = '#ffd23f';
    g.strokeStyle = '#fff';
    g.lineWidth = Math.max(1, 1.4 * u);
    g.beginPath();
    g.arc(x0 + pbw * prog, y0 + bh / 2, 5 * u, 0, 6.283);
    g.fill();
    g.stroke();
    const zi = G.segAt(P.pos + 840).zone;
    const zname = ['FORT KOCHI', 'ALAPPUZHA', 'MUNNAR', 'THRISSUR', 'KOVALAM'][zi] || '';
    text(g, `RACE ${G.level}  ·  ${zname}`, cx, y0 + bh + 14 * u, 11 * u, CREAM, 'center', 'R');
  }

  // ---------- police ----------
  if (G.cop && G.cop.state !== 'down') {
    const gap = (P.pos + 840 - G.cop.z) / 40;
    const on = ((G.time * 5) | 0) % 2 === 0;
    const label = gap > 8 ? `POLICE  ${Math.round(gap)} m BEHIND` : gap < -8 ? 'POLICE AHEAD!' : 'POLICE ALONGSIDE!';
    setFont(g, 12 * u, 'B');
    const tw = g.measureText(label).width + 22 * u;
    const px = W / 2 - tw / 2;
    const py = pad + 52 * u;
    rrect(g, px, py, tw, 20 * u, 10 * u);
    g.fillStyle = on ? 'rgba(220,30,40,0.85)' : 'rgba(40,100,240,0.85)';
    g.fill();
    g.lineWidth = Math.max(1, 1.5 * u);
    g.strokeStyle = '#fff';
    g.stroke();
    text(g, label, W / 2, py + 15 * u, 12 * u, '#fff', 'center', 'B', '');
  }

  // ---------- speed ----------
  const kmh = Math.round((P.speed / MAX_SPEED) * 150);
  text(g, String(kmh), W / 2 + 4 * u, H - 19 * u, 25 * u, P.nitroOn ? '#9be8ff' : '#ffffff', 'center');
  text(g, 'KM/H', W / 2 + 4 * u, H - 6 * u, 10 * u, GOLD, 'center', 'R');

  // ---------- zone banner ----------
  if (G.banner && G.phase !== 'dead') {
    const b = G.banner;
    const t = b.t;
    const a = t < 0.35 ? t / 0.35 : t > 2.7 ? Math.max(0, (3.2 - t) / 0.5) : 1;
    const slide = t < 0.35 ? (1 - t / 0.35) * 24 * u : 0;
    g.globalAlpha = a;
    const y = H * 0.27 - slide;
    setFont(g, 36 * u, 'B');
    const w = Math.min(W * 0.9, g.measureText(b.name).width);
    g.fillStyle = GOLD;
    g.fillRect(W / 2 - w / 2 - 70 * u, y - 14 * u, 52 * u, 4 * u);
    g.fillRect(W / 2 + w / 2 + 18 * u, y - 14 * u, 52 * u, 4 * u);
    g.fillStyle = '#fff3d1';
    g.fillRect(W / 2 - w / 2 - 70 * u, y - 8 * u, 52 * u, 2 * u);
    g.fillRect(W / 2 + w / 2 + 18 * u, y - 8 * u, 52 * u, 2 * u);
    text(g, b.name, W / 2, y + 8 * u, 36 * u, GOLD, 'center');
    text(g, b.tag, W / 2, y + 28 * u, 16 * u, CREAM, 'center', 'R');
    g.globalAlpha = 1;
  }

  // ---------- countdown ----------
  if (G.phase === 'countdown') {
    const cd = G.cd;
    text(g, `RACE ${G.level}`, W / 2, H * 0.14, 24 * u, GOLD, 'center');
    text(g, `Finish in the top ${QUALIFY} to qualify`, W / 2, H * 0.14 + 20 * u, 14 * u, CREAM, 'center', 'R');
    const n = cd > 1.6 ? '3' : cd > 0.8 ? '2' : cd > 0 ? '1' : '';
    if (n) {
      const f = (cd % 0.8) / 0.8;
      const s = 1 + Math.max(0, (f - 0.65) / 0.35) * 0.7;
      const col = n === '3' ? '#ff6b5c' : n === '2' ? '#ffc53d' : '#7dff9b';
      g.save();
      g.globalAlpha = f < 0.1 ? f / 0.1 : 1;
      g.translate(W / 2, H * 0.47);
      g.scale(s, s);
      text(g, n, 0, 0, 110 * u, col, 'center');
      g.restore();
    }
  }

  // ---------- big message ----------
  if (G.msg) {
    const m = G.msg;
    const t = m.t;
    const inT = Math.min(1, t / 0.22);
    const s = 0.55 + inT * 0.45 + Math.sin(inT * Math.PI) * 0.18;
    const a = t > m.dur - 0.4 ? Math.max(0, (m.dur - t) / 0.4) : 1;
    g.save();
    g.globalAlpha = a;
    g.translate(W / 2, H * 0.4);
    g.scale(s, s);
    text(g, m.text, 0, 0, (m.text.length > 8 ? 40 : 56) * u, m.color, 'center');
    if (m.sub) text(g, m.sub, 0, 26 * u, 18 * u, CREAM, 'center', 'R');
    g.restore();
  }

  // ---------- first-timer hints ----------
  if (G.hintT > 0 && G.phase !== 'dead' && G.phase !== 'finish') {
    const touch = G.input.usedTouch || G.isTouch;
    const lines = touch
      ? ['DRAG THE PAD TO STEER', 'TAP FISTS TO PUNCH RIVALS  •  HOLD NITRO TO BOOST']
      : ['ARROWS / WASD  steer & gas', 'Z / X  punch left / right   •   SPACE  nitro'];
    const a = Math.min(1, G.hintT / 1.2);
    g.globalAlpha = a;
    const hy = H * 0.66;
    setFont(g, 14 * u, 'R');
    const tw = Math.max(g.measureText(lines[0]).width, g.measureText(lines[1]).width) + 30 * u;
    rrect(g, W / 2 - tw / 2, hy - 18 * u, tw, 44 * u, 10 * u);
    g.fillStyle = 'rgba(8,22,16,0.62)';
    g.fill();
    g.strokeStyle = 'rgba(245,184,46,0.6)';
    g.lineWidth = Math.max(1, 1.4 * u);
    g.stroke();
    text(g, lines[0], W / 2, hy, 14 * u, GOLD, 'center', 'R', '');
    text(g, lines[1], W / 2, hy + 19 * u, 14 * u, CREAM, 'center', 'R', '');
    g.globalAlpha = 1;
  }
  if (G.promptT > 0 && G.phase === 'race') {
    const side = G.promptSide;
    const touch = G.input.usedTouch || G.isTouch;
    const flash = ((G.time * 6) | 0) % 2 === 0;
    const label = touch ? (side < 0 ? '< PUNCH!' : 'PUNCH! >') : side < 0 ? '< Z  PUNCH!' : 'X  PUNCH! >';
    text(g, label, W / 2 + side * 110 * u, H * 0.58, 20 * u, flash ? '#ffd23f' : '#ffffff', 'center');
  }

  // ---------- floaters ----------
  for (const f of G.fx.floaters) {
    if (!f.active) continue;
    const a = Math.min(1, (f.life / f.max) * 2.4);
    g.globalAlpha = a;
    const s = 1 + f.pop * 0.35;
    g.save();
    g.translate(f.x, f.y);
    g.scale(s, s);
    text(g, f.text, 0, 0, f.size, f.color, 'center');
    g.restore();
  }
  g.globalAlpha = 1;

  // ---------- finish placement (small ribbon) ----------
  if (G.phase === 'finish' && G.finishPos > 0) {
    text(g, ORD[G.finishPos - 1] + ' PLACE', W / 2, H * 0.8, 20 * u, GOLD, 'center');
  }

  // ---------- multiplayer ----------
  if (G.mp) {
    const board = G.mpBoard();
    if (board.length) {
      // Fixed anchor below the score/combo stack, so the box never jumps or
      // overlaps the combo meter when a chain starts or ends.
      const rowH = 13 * u;
      const headH = 18 * u;
      const bw = Math.min(132 * u, W * 0.3);
      const bx = W - G.rightPad - bw - 4 * u;
      const by = pad + 104 * u;
      // Keep clear of the touch controls (bottom ~47%) and the bottom HUD.
      const touchUi = G.input.usedTouch || G.isTouch;
      const maxBottom = touchUi ? H * 0.52 : H - 46 * u;
      const fitRows = Math.floor((maxBottom - by - headH - 4 * u) / rowH);
      const rows = Math.max(0, Math.min(board.length, fitRows));
      if (rows >= 2) {
        // If not everyone fits, always keep the local rider visible.
        const meIdx = board.findIndex((r) => r.me);
        let shown = board.slice(0, rows).map((r, i) => ({ r, pos: i + 1 }));
        if (meIdx >= rows) {
          shown = board.slice(0, rows - 1).map((r, i) => ({ r, pos: i + 1 }));
          shown.push({ r: board[meIdx], pos: meIdx + 1 });
        }
        const bh = headH + shown.length * rowH + 4 * u;
        panel(g, bx, by, bw, bh, 7 * u, u);
        text(g, 'RIDERS', bx + 7 * u, by + 12.5 * u, 10 * u, GOLD, 'left', 'R', '');
        text(g, board.length + ' / 10', bx + bw - 7 * u, by + 12.5 * u, 9 * u, 'rgba(255,255,255,0.55)', 'right', 'R', '');

        g.save();
        g.beginPath();
        g.rect(bx, by, bw, bh);
        g.clip();
        const nameX = bx + 30 * u;
        const tagW = 16 * u;
        shown.forEach(({ r, pos }, i) => {
          const y = by + headH + i * rowH;
          if (r.me) {
            g.fillStyle = 'rgba(125,255,155,0.16)';
            g.fillRect(bx + 2 * u, y, bw - 4 * u, rowH);
          }
          const col = r.me ? '#7dff9b' : r.ai ? 'rgba(255,255,255,0.62)' : '#fff3d1';
          const base = y + rowH * 0.74;
          text(g, String(pos), bx + 7 * u, base, 10 * u, col, 'left', 'B', '');
          g.fillStyle = r.color;
          g.fillRect(bx + 22 * u, y + 2.5 * u, 4 * u, rowH - 5 * u);
          // narrow face + measured truncation so long names never spill out
          const maxW = bx + bw - 6 * u - nameX - (r.down || r.ai ? tagW : 0);
          setFont(g, 11 * u, 'R');
          let nm = r.name;
          if (g.measureText(nm).width > maxW) {
            while (nm.length > 1 && g.measureText(nm + '…').width > maxW) nm = nm.slice(0, -1);
            nm += '…';
          }
          text(g, nm, nameX, base, 11 * u, col, 'left', 'R', '');
          const tag = r.down ? 'KO' : r.ai ? 'CPU' : '';
          if (tag) text(g, tag, bx + bw - 6 * u, base, 8 * u, r.down ? '#ff6b5c' : 'rgba(255,255,255,0.45)', 'right', 'R', '');
        });
        g.restore();
      }
    }
    // room code + engine badge
    text(g, 'ROOM ' + G.mp.code, W / 2 - 4 * u, H - 34 * u, 11 * u, GOLD, 'center', 'R', '');
    text(g, G.mp.isHost ? 'HOST' : 'GUEST', W / 2 - 4 * u, H - 22 * u, 10 * u, 'rgba(255,255,255,0.6)', 'center', 'R', '');
  }

  // ---------- fps ----------
  if (G.showFps) {
    const fps = G.frameDt > 0 ? Math.round(1 / G.frameDt) : 0;
    text(g, fps + ' FPS', W - G.rightPad - 4 * u, H - 10 * u, 11 * u, fps >= 55 ? '#7dff9b' : fps >= 40 ? '#ffd23f' : '#ff6b5c', 'right', 'R', '');
  }
  g.restore();
}
