'use client';

import { useEffect, useRef, useState } from 'react';
import { Game, type GameState, type UIMsg } from '@/game/game';
import TitleScreen from './TitleScreen';
import LoadingScreen from './LoadingScreen';
import Hud from './Hud';
import PauseMenu from './PauseMenu';
import TouchControls from './TouchControls';

export default function FoxGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [game, setGame] = useState<Game | null>(null);

  const [state, setState] = useState<GameState>('title');
  const [progress, setProgress] = useState({ phase: '', p: 0 });
  const [slot, setSlot] = useState(0);
  const [flash, setFlash] = useState({ name: '', n: 0 });
  const [debugOn, setDebugOn] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [settings, setSettings] = useState({ fog: 'Foggy', sound: true, cam: 'Third Person' });
  const [locked, setLocked] = useState(false);
  const [icons, setIcons] = useState<string[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [seed, setSeed] = useState('');
  const [version, setVersion] = useState('Foxcraft Alpha 0.1.0');
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current, (m: UIMsg) => {
      switch (m.t) {
        case 'state': setState(m.state); break;
        case 'progress': setProgress({ phase: m.phase, p: m.p }); break;
        case 'hud':
          setSlot(m.slot);
          setFlash((f) => ({ name: m.flash, n: f.n + 1 }));
          break;
        case 'debug': setDebugLines(m.lines); break;
        case 'debugOn': setDebugOn(m.on); break;
        case 'settings': setSettings({ fog: m.fog, sound: m.sound, cam: m.cam }); break;
        case 'lock': setLocked(m.locked); break;
      }
    });
    setGame(game);
    setIcons(game.getHotbarIcons());
    setNames(game.getHotbarNames());
    setVersion(game.getVersion());
    return () => {
      game.dispose();
      setGame(null);
    };
  }, []);

  const start = (seedStr: string, fogIdx: number) => {
    setSeed(seedStr);
    if (game) void game.newWorld(seedStr, fogIdx);
  };

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {state === 'title' && <TitleScreen version={version} isTouch={isTouch} onStart={start} />}
      {state === 'loading' && <LoadingScreen phase={progress.phase} p={progress.p} />}

      {state === 'playing' && (
        <>
          <Hud
            version={version}
            slot={slot}
            icons={icons}
            names={names}
            flash={flash}
            debugOn={debugOn}
            debugLines={debugLines}
            showCross={locked || isTouch}
            isTouch={isTouch}
            onSelect={(i) => game?.selectSlot(i)}
            onPause={() => game?.pause()}
          />
          {isTouch && <TouchControls game={game} />}
        </>
      )}

      {state === 'paused' && (
        <PauseMenu
          version={version}
          seed={seed}
          settings={settings}
          onResume={() => game?.resume()}
          onToggleCam={() => game?.toggleCamera()}
          onCycleFog={() => game?.cycleFog()}
          onToggleSound={() => game?.toggleSound()}
          onQuit={() => game?.toTitle()}
        />
      )}

      {/* first capture of the mouse after world load */}
      {state === 'playing' && !locked && !isTouch && (
        <button
          className="mc absolute inset-0 z-50 flex items-center justify-center bg-black/45 text-3xl text-white mc-shadow-text"
          onClick={() => game?.lockNow()}
        >
          Click to play
        </button>
      )}
    </div>
  );
}
