"use client";

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Server, HardDrive } from 'lucide-react';
import MediaServerPlayer from '../components/player/MediaServerPlayer';
import { getLocalAnime, getLocalEpisodes } from '../utils/localStore';

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

  const storedEps = (typeof window !== 'undefined' && animeId) ? getLocalEpisodes(animeId) : [];
  const mergedEpisodes = (episodes && episodes.length > 0)
    ? episodes.map(ep => {
        const s = storedEps?.find(x => x.id === ep.id);
        return s ? { ...ep, ...s } : ep;
      })
    : (storedEps || []);

  const currentEpisode = mergedEpisodes.find((e) => e.id === currentEpisodeId) || mergedEpisodes[0];

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col relative">
      {/* ── Top Navigation Bar (Completely Transparent - No Blur / No Glass - Scrollable) ─────────────────── */}
      <header
        className="h-14 px-4 md:px-4 bg-transparent flex items-center justify-between z-20 shrink-0 absolute top-0 inset-x-0 pointer-events-none"
        style={{ background: 'transparent', backgroundColor: 'transparent' }}
      >
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent hover:bg-white/10 border border-white/15 text-gray-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-transparent border border-pink-500/30 text-pink-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Server size={11} className="text-pink-400" />
              Windows Media Server
            </span>
            <span className="text-gray-600 hidden sm:inline">•</span>
            <span className="text-xs font-semibold text-gray-200 truncate max-w-[200px] md:max-w-md drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {animeDetails?.title || animeId}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-transparent border border-white/15 text-[11px] font-mono text-gray-300 pointer-events-auto">
          Episode <span className="text-pink-400 font-bold">{currentEpisode?.episodeNumber || 1}</span> of {episodes.length}
        </div>
      </header>

      {/* ── Main Area (Padded so player cards sit cleanly below nav bar without overlap) ── */}
      <main className="flex-1 w-full overflow-x-hidden pt-14 sm:pt-16">
        {currentEpisode ? (
          <MediaServerPlayer
            animeId={animeId}
            episode={currentEpisode}
            episodes={mergedEpisodes}
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
