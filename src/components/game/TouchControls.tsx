'use client';

import { useRef } from 'react';
import type { Game } from '@/game/game';

/**
 * Mobile fallback: left virtual joystick, right-side drag-to-look,
 * hold-to-mine, tap-to-place, jump button, camera toggle.
 */
export default function TouchControls({ game }: { game: Game | null }) {
  const stickRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const look = useRef({ id: -1, x: 0, y: 0, moved: 0, t0: 0, mining: false, timer: 0 });

  if (!game) return null;

  const R = 42;

  const setKnob = (dx: number, dy: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const stickMove = (e: React.PointerEvent) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob(dx, dy);
    game.setTouchMove(dx / R, -dy / R);
  };

  const stickReset = () => {
    setKnob(0, 0);
    game.setTouchMove(0, 0);
  };

  const lookDown = (e: React.PointerEvent) => {
    const s = look.current;
    if (s.id !== -1) return;
    s.id = e.pointerId;
    s.x = e.clientX;
    s.y = e.clientY;
    s.moved = 0;
    s.t0 = performance.now();
    s.mining = false;
    s.timer = window.setTimeout(() => {
      if (s.id !== -1 && s.moved < 14) {
        s.mining = true;
        game.touch.mining = true;
      }
    }, 220);
  };

  const lookMove = (e: React.PointerEvent) => {
    const s = look.current;
    if (s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    s.x = e.clientX;
    s.y = e.clientY;
    s.moved += Math.abs(dx) + Math.abs(dy);
    game.addTouchLook(dx * 1.7, dy * 1.7);
  };

  const lookUp = (e: React.PointerEvent) => {
    const s = look.current;
    if (s.id !== e.pointerId) return;
    clearTimeout(s.timer);
    if (s.mining) {
      game.setTouchMining(false);
    } else if (performance.now() - s.t0 < 300 && s.moved < 14) {
      game.touchPlace();
    }
    s.id = -1;
  };

  return (
    <>
      {/* look + interact zone (right 60%) */}
      <div
        className="absolute inset-y-0 right-0 z-20 w-[60%] touch-none"
        onPointerDown={lookDown}
        onPointerMove={lookMove}
        onPointerUp={lookUp}
        onPointerCancel={lookUp}
      />

      {/* joystick */}
      <div
        ref={stickRef}
        className="absolute bottom-20 left-4 z-20 flex h-28 w-28 touch-none items-center justify-center rounded-full border-2 border-black/70 bg-white/10"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          stickMove(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) stickMove(e);
        }}
        onPointerUp={stickReset}
        onPointerCancel={stickReset}
      >
        <div
          ref={knobRef}
          className="h-14 w-14 rounded-full border-2 border-black/70 bg-neutral-400/80"
          style={{ transform: 'translate(0,0)' }}
        />
      </div>

      {/* jump */}
      <button
        className="mc-btn absolute bottom-24 right-4 z-30 h-16 w-16 rounded-full !text-lg"
        onPointerDown={() => { game.setTouchJump(true); }}
        onPointerUp={() => { game.setTouchJump(false); }}
        onPointerCancel={() => { game.setTouchJump(false); }}
        aria-label="Jump"
      >
        JUMP
      </button>

      {/* camera toggle */}
      <button
        className="mc-btn mc-btn-sm absolute right-16 top-2 z-30 w-12"
        onClick={() => game.toggleCamera()}
        aria-label="Toggle camera"
      >
        CAM
      </button>
    </>
  );
}
