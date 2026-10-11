'use client';

import { useMemo, type ReactNode } from 'react';
import { getDirtBackgroundURL } from '@/game/textures';

/** Classic tiled-dirt darkened backdrop for menus. */
export function DirtBackdrop({ children }: { children?: ReactNode }) {
  const url = useMemo(() => getDirtBackgroundURL(), []);
  return (
    <div
      className="absolute inset-0"
      style={{ backgroundImage: `url(${url})`, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}
