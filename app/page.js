"use client";

import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useRouter } from 'next/navigation';
import Dashboard from './pages/Dashboard';
import AnimeDetail from './pages/AnimeDetail';
import Player from './pages/Player';
import VideoJsContainer from './pages/VideoJsContainer';
import ArtPlayerContainer from './pages/ArtPlayerContainer';
import YoutubePlayerContainer from './pages/YoutubePlayerContainer';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export default function Home() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const [activeAnimeId, setActiveAnimeId] = useState(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [activeEpisodesList, setActiveEpisodesList] = useState([]);
  const [playerType, setPlayerType] = useState('builtin');

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-3">
        <Loader2 className="animate-spin text-neonCyan" size={36} />
        <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Booting Tracker...</span>
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
            {playerType === 'videojs' ? (
              <VideoJsContainer
                animeId={activeAnimeId}
                episodeId={activeEpisodeId}
                episodes={activeEpisodesList}
                onBack={() => setActiveEpisodeId(null)}
              />
            ) : playerType === 'artplayer' ? (
              <ArtPlayerContainer
                animeId={activeAnimeId}
                episodeId={activeEpisodeId}
                episodes={activeEpisodesList}
                onBack={() => setActiveEpisodeId(null)}
              />
            ) : playerType === 'youtube' ? (
              <YoutubePlayerContainer
                animeId={activeAnimeId}
                episodeId={activeEpisodeId}
                episodes={activeEpisodesList}
                onBack={() => setActiveEpisodeId(null)}
              />
            ) : (
              <Player
                animeId={activeAnimeId}
                episodeId={activeEpisodeId}
                episodes={activeEpisodesList}
                onBack={() => setActiveEpisodeId(null)}
              />
            )}
          </motion.div>
        ) : activeAnimeId ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <AnimeDetail
              animeId={activeAnimeId}
              onBack={() => setActiveAnimeId(null)}
              onPlayEpisode={(epId, epList, type = 'builtin') => {
                setActiveEpisodeId(epId);
                setActiveEpisodesList(epList);
                setPlayerType(type);
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <Dashboard
              onSelectAnime={(id) => {
                router.push(`/${id}`);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
