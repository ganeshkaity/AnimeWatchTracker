"use client";

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Server, HardDrive } from 'lucide-react';
import MediaServerPlayer from '../components/player/MediaServerPlayer';
import { getLocalAnime } from '../utils/localStore';

export default function MediaServerPlayerContainer({
  animeId,
  episodeId,
  episodes = [],
  onBack,
  initialSpeed = 1,
  initialVolume = 1,
}) {
  const [currentEpisodeId, setCurrentEpisodeId] = useState(episodeId);
  const [animeDetails, setAnimeDetails] = useState(null);

  useEffect(() => {
    setCurrentEpisodeId(episodeId);
  }, [episodeId]);

  useEffect(() => {
    if (animeId) {
      const local = getLocalAnime(animeId);
      if (local) setAnimeDetails(local);
    }
  }, [animeId]);

  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId) || episodes[0];

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col">
      {/* ── Top Navigation Bar ───────────────────────────────── */}
      <header className="h-14 px-4 md:px-6 bg-[#0c101c]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between z-10 shrink-0 sticky top-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer border border-white/5"
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <Server size={11} className="text-pink-400" />
              Windows Media Server
            </span>
            <span className="text-gray-600 hidden sm:inline">•</span>
            <span className="text-xs font-bold text-gray-200 truncate max-w-[200px] md:max-w-md">
              {animeDetails?.title || animeId}
            </span>
          </div>
        </div>

        <div className="text-xs font-semibold text-gray-400 hidden sm:block">
          Episode {currentEpisode?.episodeNumber || 1} of {episodes.length}
        </div>
      </header>

      {/* ── Main Area ──────────────────────────────────────────────────────── */}
      <main className="flex-1 w-full overflow-x-hidden">
        {currentEpisode ? (
          <MediaServerPlayer
            animeId={animeId}
            episode={currentEpisode}
            episodes={episodes}
            onBack={onBack}
            onEpisodeChange={(newEp) => setCurrentEpisodeId(newEp.id)}
            initialSpeed={initialSpeed}
            initialVolume={initialVolume}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400 min-h-[50vh]">
            <HardDrive size={44} className="text-gray-600 mb-3 animate-pulse" />
            <h3 className="text-sm font-bold text-white mb-1">No Episode Available</h3>
            <p className="text-xs text-gray-500">The requested episode could not be found.</p>
          </div>
        )}
      </main>
    </div>
  );
}
