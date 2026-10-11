'use client';

import { useMemo, useState } from 'react';
import { FOG_PRESETS } from '@/game/game';
import { drawBlockIcon, getTiles, T } from '@/game/textures';
import { DirtBackdrop } from './DirtBackdrop';

const SPLASHES = [
  'Now with 100% more fox!',
  'Punch trees, get wood!',
  'The fog is a feature!',
  'Gritty on purpose!',
  'As seen in 2010!',
  'Every pixel handmade!',
  '0% Java, 100% foxy!',
  'Beware of dark caves!',
  'Chunky!',
  'Water is wet!',
  'Also try going outside!',
  '16 glorious colors!',
  'Beta when?',
  'Tail physics included!',
];

const CONTROLS: Array<[string, string]> = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look around'],
  ['Hold LMB', 'Mine block'],
  ['RMB', 'Place block'],
  ['Space', 'Jump / swim up'],
  ['Shift', 'Sprint'],
  ['1–9 / Wheel', 'Select block'],
  ['F', 'Cycle fog'],
  ['V', 'Toggle camera'],
  ['G', 'Debug info'],
  ['M', 'Mute sound'],
  ['Esc', 'Pause'],
];

export default function TitleScreen({
  version,
  isTouch,
  onStart,
}: {
  version: string;
  isTouch: boolean;
  onStart: (seed: string, fogIdx: number) => void;
}) {
  const [panel, setPanel] = useState<'main' | 'create'>('main');
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 100000)));
  const [fogIdx, setFogIdx] = useState(0);
  const [splash] = useState(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);

  const grassIcon = useMemo(() => {
    const t = getTiles();
    return drawBlockIcon(t[T.grassTop], t[T.grassSide], 64);
  }, []);

  return (
    <div className="absolute inset-0" style={{ animation: 'mc-fade-in 0.3s' }}>
      <DirtBackdrop>
        <div className="flex h-full flex-col items-center justify-center px-4">
          {/* Logo */}
          <div className="relative mb-1 text-center">
            <h1
              className="mc text-[clamp(3rem,11vw,6.2rem)] font-bold leading-[0.95] tracking-wide text-[#e6e6e6]"
              style={{ textShadow: '0.05em 0.05em 0 #3c3c3c, 0.11em 0.11em 0 rgba(0,0,0,0.6)' }}
            >
              FOXCRAFT
            </h1>
            <div
              className="mc absolute -right-4 -top-4 text-xl text-[#ffff55] mc-shadow-text md:-right-10 md:text-2xl"
              style={{ animation: 'mc-splash-pulse 0.9s ease-in-out infinite' }}
            >
              {splash}
            </div>
          </div>

          <div className="mb-8 flex items-center gap-3">
            <span
              className="pixelated block h-10 w-10 md:h-12 md:w-12"
              style={{ backgroundImage: `url(${grassIcon})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }}
              role="img"
              aria-label="Grass block"
            />
            <span className="mc text-lg text-[#c9c9c9] mc-shadow-text md:text-xl">
              {version.replace('Foxcraft ', '')}
            </span>
          </div>

          {panel === 'main' ? (
            <div className="w-[min(90vw,24rem)] space-y-2">
              <button className="mc-btn" onClick={() => setPanel('create')}>
                Singleplayer
              </button>
              <button className="mc-btn" disabled title="It is 2010 — the servers are not ready.">
                Multiplayer
              </button>
              <p className="mc pt-3 text-center text-sm text-[#a8a8a8] mc-shadow-text">
                WASD + Mouse · Hold LMB to mine · RMB to place
              </p>
            </div>
          ) : (
            <div className="mc-panel mc w-[min(92vw,26rem)] space-y-4 p-5">
              <h2 className="text-center text-2xl text-[#e8e8e8] mc-shadow-text">Create New World</h2>

              <div className="space-y-1">
                <label htmlFor="seed" className="block text-base text-[#c9c9c9]">
                  Seed for the world generator
                </label>
                <div className="flex gap-2">
                  <input
                    id="seed"
                    className="mc-input"
                    value={seed}
                    maxLength={24}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="leave blank for random"
                  />
                  <button className="mc-btn mc-btn-sm w-24" onClick={() => setSeed(String(Math.floor(Math.random() * 100000)))}>
                    Random
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="block text-base text-[#c9c9c9]">Fog / Render distance</span>
                <div className="flex gap-2">
                  {FOG_PRESETS.map((f, i) => (
                    <button
                      key={f.name}
                      className="mc-btn mc-btn-sm flex-1"
                      style={i === fogIdx ? { background: '#5f7d3e', color: '#fff' } : undefined}
                      onClick={() => setFogIdx(i)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#8f8f8f]">Foggy is the authentic alpha experience.</p>
              </div>

              <button className="mc-btn" onClick={() => onStart(seed.trim() || 'fox', fogIdx)}>
                Create New World
              </button>
              <button className="mc-btn mc-btn-sm" onClick={() => setPanel('main')}>
                Back
              </button>

              {isTouch ? (
                <p className="text-xs text-[#a8c98f]">Touch controls: left stick moves, right side looks, hold to mine, tap to place.</p>
              ) : (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-white/10 pt-3 text-sm text-[#b9b9b9]">
                  {CONTROLS.map(([k, v]) => (
                    <div key={k} className="contents">
                      <span className="text-[#e8e8e8]">{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* corner texts */}
        <div className="mc absolute bottom-2 left-3 text-sm text-[#c9c9c9] mc-shadow-text">{version}</div>
        <div className="mc absolute bottom-2 right-3 max-w-[60vw] text-right text-xs leading-tight text-[#9a9a9a]">
          A fan-made tribute. Not affiliated with Mojang or Microsoft.
        </div>
      </DirtBackdrop>
    </div>
  );
}
