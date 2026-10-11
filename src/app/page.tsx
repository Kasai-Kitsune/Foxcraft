'use client';

import dynamic from 'next/dynamic';

const FoxGame = dynamic(() => import('@/components/game/FoxGame'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-black" />,
});

export default function Page() {
  return <FoxGame />;
}
