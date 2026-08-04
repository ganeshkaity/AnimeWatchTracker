"use client";

import React, { useState, useEffect } from 'react';
import { Play, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { upsertLocalEpisode, getLocalEpisodes } from '../utils/localStore';

export default function YoutubePlayerContainer({ animeId, episodeId, episodes, onBack }) {
  const { currentUser } = useAuth();
  const [currentEpisodeId, setCurrentEpisodeId] = useState(episodeId);

  useEffect(() => {
    setCurrentEpisodeId(episodeId);
  }, [episodeId]);

  const currentEpIndex = episodes.findIndex(e => e.id === currentEpisodeId);
  const episode = episodes[currentEpIndex];

  if (!episode) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white">
        <p>Episode not found.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition">Go Back</button>
      </div>
    );
  }

  const youtubeId = episode.youtubeId || episode.filePath?.replace('youtube://', '');

  return (
    <div className="w-full h-screen bg-black flex flex-col relative">
      {/* Top Bar overlay */}
      <div className="absolute top-0 left-0 w-full p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none">
        <button 
          onClick={onBack}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition flex items-center justify-center pointer-events-auto"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="text-white text-sm font-bold text-shadow-md drop-shadow-md">
          {episode.isOffPattern ? 'SP ' : 'EP '} 
          {episode.episodeNumber || (currentEpIndex + 1)}: {episode.fileName || episode.title}
        </div>
        <div className="w-10"></div> {/* spacer */}
      </div>

      <div className="flex-1 w-full h-full relative z-0">
        {youtubeId ? (
          <iframe
            className="w-full h-full border-none"
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&controls=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube Video Player"
          ></iframe>
        ) : (
          <div className="flex-1 flex items-center justify-center text-red-500">
            Invalid YouTube ID
          </div>
        )}
      </div>
    </div>
  );
}
