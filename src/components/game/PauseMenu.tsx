'use client';

import { useState } from 'react';

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

export default function PauseMenu({
  version,
  seed,
  settings,
  onResume,
  onToggleCam,
  onCycleFog,
  onToggleSound,
  onQuit,
}: {
  version: string;
  seed: string;
  settings: { fog: string; sound: boolean; cam: string };
  onResume: () => void;
  onToggleCam: () => void;
  onCycleFog: () => void;
  onToggleSound: () => void;
  onQuit: () => void;
}) {
  const [showControls, setShowControls] = useState(false);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-4"
      style={{ animation: 'mc-fade-in 0.15s' }}
      role="dialog"
      aria-label="Game menu"
    >
      <div className="mc-panel mc w-full max-w-md space-y-2 p-5">
        <h2 className="mb-3 text-center text-2xl text-[#e8e8e8] mc-shadow-text">Game Menu</h2>

        <button className="mc-btn" onClick={onResume}>
          Back to Game
        </button>
        <button className="mc-btn" onClick={onToggleCam}>
          Camera: {settings.cam}
        </button>
        <button className="mc-btn" onClick={onCycleFog}>
          Fog: {settings.fog}
        </button>
        <button className="mc-btn" onClick={onToggleSound}>
          Sound: {settings.sound ? 'On' : 'Off'}
        </button>
        <button className="mc-btn" onClick={() => setShowControls((s) => !s)}>
          {showControls ? 'Hide' : 'Show'} Controls
        </button>
        {showControls && (
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-1 py-1 text-sm text-[#b9b9b9]">
            {CONTROLS.map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-[#e8e8e8]">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}
        <button className="mc-btn" onClick={onQuit}>
          Quit to Title
        </button>

        <p className="pt-1 text-center text-sm text-[#8f8f8f]">
          {version} · Seed: {seed || 'fox'}
        </p>
        <p className="text-center text-xs text-[#6f6f6f]">Worlds are not saved — it is alpha, after all.</p>
      </div>
    </div>
  );
}
