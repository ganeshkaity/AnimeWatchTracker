"use client";

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import AnimeDetail from '../../pages/AnimeDetail';
import Player from '../../pages/Player';
import ArtPlayerContainer from '../../pages/ArtPlayerContainer';
import VideoJsContainer from '../../pages/VideoJsContainer';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function AnimePage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, loading } = useAuth();

  const animeId = params?.slug;

  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [activeEpisodesList, setActiveEpisodesList] = useState([]);
  const [playerType, setPlayerType] = useState('builtin');

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-3">
        <Loader2 className="animate-spin text-neonCyan" size={36} />
        <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <AnimeDetail
        animeId={animeId}
        onBack={() => router.push('/')}
        onPlayEpisode={(epId, epList, type = 'builtin', extraOpts = {}) => {
          const speed = extraOpts.speed || 1;
          const volume = Math.round((extraOpts.volume ?? 1) * 100);
          const quality = extraOpts.quality || '';
          let query = `?ep=${encodeURIComponent(epId)}&speed=${speed}&volume=${volume}`;
          if (quality) query += `&quality=${encodeURIComponent(quality)}`;

          router.push(`/player/${type}/${animeId}${query}`);
        }}
      />
    </div>
  );
}
