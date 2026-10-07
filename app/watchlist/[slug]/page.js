"use client";

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import WatchlistDetail from '../../pages/WatchlistDetail';

export default function WatchlistItemPage() {
  const params = useParams();
  const router = useRouter();
  const watchlistId = params?.slug;

  return (
    <div className="min-h-screen text-white bg-[#07090f]">
      <WatchlistDetail
        watchlistId={watchlistId}
        onBack={() => router.push('/watchlist')}
      />
    </div>
  );
}
