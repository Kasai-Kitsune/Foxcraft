'use client';

interface HudProps {
  version: string;
  slot: number;
  icons: string[];
  names: string[];
  flash: { name: string; n: number };
  debugOn: boolean;
  debugLines: string[];
  showCross: boolean;
  isTouch: boolean;
  onSelect: (i: number) => void;
  onPause: () => void;
}

export default function Hud({
  version,
  slot,
  icons,
  names,
  flash,
  debugOn,
  debugLines,
  showCross,
  isTouch,
  onSelect,
  onPause,
}: HudProps) {
  return (
    <>
      {/* crosshair (inverted, classic) */}
      {showCross && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0 mix-blend-difference">
          <div className="absolute h-[2px] w-[20px] -translate-x-1/2 -translate-y-1/2 bg-white" />
          <div className="absolute h-[20px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-white" />
        </div>
      )}

      {/* version + debug */}
      <div className="mc pointer-events-none absolute left-2 top-1.5 z-10 text-sm text-white/70 mc-shadow-text">
        {version}
        {isTouch ? ' (touch)' : ''}
      </div>
      {debugOn && debugLines.length > 0 && (
        <pre className="mc pointer-events-none absolute left-2 top-8 z-10 max-w-[90vw] whitespace-pre-wrap bg-black/50 p-2 text-[13px] leading-[1.15] text-[#e8e8e8]">
          {debugLines.join('\n')}
        </pre>
      )}

      {/* item name flash */}
      {flash.name && (
        <div
          key={flash.n}
          className="mc pointer-events-none absolute bottom-[76px] left-1/2 z-10 -translate-x-1/2 text-xl text-white mc-shadow-text"
          style={{ animation: 'mc-flash-fade 1.4s forwards' }}
        >
          {flash.name}
        </div>
      )}

      {/* hotbar */}
      <nav
        className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-1"
        aria-label="Block selection"
      >
        {icons.map((ic, i) => (
          <button
            key={i}
            className={`mc-slot ${i === slot ? 'mc-slot-selected' : ''}`}
            onClick={() => onSelect(i)}
            aria-label={names[i]}
            aria-pressed={i === slot}
          >
            <span
              className="pixelated block h-4/5 w-4/5"
              style={{ backgroundImage: `url(${ic})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
            />
          </button>
        ))}
      </nav>

      {/* pause button (touch only) */}
      {isTouch && (
        <button
          className="mc-btn mc-btn-sm absolute right-2 top-2 z-30 w-12"
          onClick={onPause}
          aria-label="Pause"
        >
          II
        </button>
      )}
    </>
  );
}
