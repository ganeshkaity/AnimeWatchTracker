"use client";

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Headphones, Server, HardDrive } from 'lucide-react';
import AudioStoryPlayer from '../components/player/AudioStoryPlayer';
import { getLocalAudioStory, getLocalAudioTracks } from '../utils/localStore';

export default function AudioStoryPlayerContainer({
  storyId,
  trackId,
  tracks = [],
  onBack,
  initialSpeed = 1,
  initialVolume = 1,
}) {
  const [currentTrackId, setCurrentTrackId] = useState(trackId);
  const [storyDetails, setStoryDetails] = useState(null);

  useEffect(() => {
    setCurrentTrackId(trackId);
  }, [trackId]);

  useEffect(() => {
    if (storyId) {
      const local = getLocalAudioStory(storyId);
      if (local) setStoryDetails(local);
    }
  }, [storyId]);

  const storedTracks = (typeof window !== 'undefined' && storyId) ? getLocalAudioTracks(storyId) : [];
  const mergedTracks = (tracks && tracks.length > 0)
    ? tracks.map(tr => {
        const s = storedTracks?.find(x => x.id === tr.id);
        return s ? { ...tr, ...s } : tr;
      })
    : (storedTracks || []);

  const currentTrack = mergedTracks.find((t) => t.id === currentTrackId) || mergedTracks[0];

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col relative">
      {/* ── Top Navigation Bar (Transparent Header) ────────────────────────── */}
      <header
        className="h-14 px-4 bg-transparent flex items-center justify-between z-20 shrink-0 absolute top-0 inset-x-0 pointer-events-none"
        style={{ background: 'transparent', backgroundColor: 'transparent' }}
      >
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent hover:bg-white/10 border border-white/15 text-gray-300 hover:text-white text-xs font-semibold transition-all cursor-pointer backdrop-blur-sm"
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
              <Headphones size={11} className="text-cyan-400" />
              Audio Stories Player
            </span>
            <span className="text-gray-600 hidden sm:inline">•</span>
            <span className="text-xs font-semibold text-gray-200 truncate max-w-[200px] md:max-w-md drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {storyDetails?.title || storyId}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-[11px] font-mono text-gray-300 pointer-events-auto backdrop-blur-sm">
          Track <span className="text-cyan-400 font-bold">{currentTrack?.trackNumber || 1}</span> of {mergedTracks.length}
        </div>
      </header>

      {/* ── Main Area ──────────────────────────────────────────────────────── */}
      <main className="flex-1 w-full overflow-x-hidden pt-14 sm:pt-16">
        {currentTrack ? (
          <AudioStoryPlayer
            storyId={storyId}
            track={currentTrack}
            tracks={mergedTracks}
            onBack={onBack}
            onTrackChange={(newTr) => setCurrentTrackId(newTr.id)}
            initialSpeed={initialSpeed}
            initialVolume={initialVolume}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400 min-h-[50vh]">
            <HardDrive size={44} className="text-gray-600 mb-3 animate-pulse" />
            <h3 className="text-sm font-bold text-white mb-1">No Track Available</h3>
            <p className="text-xs text-gray-500">The requested audio track could not be found.</p>
          </div>
        )}
      </main>
    </div>
  );
}
