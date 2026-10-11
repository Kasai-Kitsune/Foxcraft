'use client';

import { DirtBackdrop } from './DirtBackdrop';

export default function LoadingScreen({ phase, p }: { phase: string; p: number }) {
  return (
    <DirtBackdrop>
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <div className="mc text-3xl text-[#e8e8e8] mc-shadow-text md:text-4xl">Generating world</div>
        <div className="mc min-h-7 text-lg text-[#b9b9b9] mc-shadow-text">{phase}&hellip;</div>
        <div className="mc-bar" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="mc-bar-fill" style={{ width: `${Math.round(p * 100)}%` }} />
        </div>
        <div className="mc text-sm text-[#8f8f8f]">{Math.round(p * 100)}%</div>
      </div>
    </DirtBackdrop>
  );
}
