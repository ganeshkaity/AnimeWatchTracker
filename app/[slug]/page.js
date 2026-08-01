"use client";

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import AnimeDetail from '../pages/AnimeDetail';
import Player from '../pages/Player';
import ArtPlayerContainer from '../pages/ArtPlayerContainer';
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
      <AnimatePresence mode="wait">
        {activeEpisodeId ? (
          <motion.div
            key="player"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {playerType === 'artplayer' ? (
              <ArtPlayerContainer
                animeId={animeId}
                episodeId={activeEpisodeId}
                episodes={activeEpisodesList}
                onBack={() => setActiveEpisodeId(null)}
              />
            ) : (
              <Player
                animeId={animeId}
                episodeId={activeEpisodeId}
                episodes={activeEpisodesList}
                onBack={() => setActiveEpisodeId(null)}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <AnimeDetail
              animeId={animeId}
              onBack={() => router.push('/')}
              onPlayEpisode={(epId, epList, type = 'builtin') => {
                setActiveEpisodeId(epId);
                setActiveEpisodesList(epList);
                setPlayerType(type);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
