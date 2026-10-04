"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { getLocalAudioTracks, getLocalAudioStory } from '../../utils/localStore';
import AudioStoryPlayerContainer from '../../pages/AudioStoryPlayerContainer';
import { Loader2 } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

export default function AudioPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, loading: authLoading } = useAuth();

  const storyId = params?.slug;
  const initialTrackId = searchParams.get('ep') || searchParams.get('track');
  const speedParam = searchParams.get('speed');
  const volumeParam = searchParams.get('volume');

  const [tracks, setTracks] = useState([]);
  const [activeTrackId, setActiveTrackId] = useState(initialTrackId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storyId) return;

    const loadTracks = async () => {
      setLoading(true);
      try {
        let localTracks = getLocalAudioTracks(storyId) || [];
        if (localTracks.length === 0 && currentUser?.uid && db) {
          const snap = await getDocs(collection(db, 'users', currentUser.uid, 'audioStories', storyId, 'tracks'));
          const dbTracks = [];
          snap.forEach(d => dbTracks.push({ id: d.id, ...d.data() }));
          localTracks = dbTracks;
        }

        setTracks(localTracks);
        if (!activeTrackId && localTracks.length > 0) {
          setActiveTrackId(localTracks[0].id);
        }
      } catch (err) {
        console.error('[AudioPlayerPage] Error loading tracks:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTracks();
  }, [storyId, currentUser]);

  const handleBack = () => {
    router.push(`/audio-story/${storyId}`);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-3 bg-black text-white">
        <Loader2 className="animate-spin text-cyan-400" size={36} />
        <span className="text-xs uppercase tracking-widest text-gray-400 font-bold">Loading Audio Player...</span>
      </div>
    );
  }

  const currentTrackId = activeTrackId || (tracks.length > 0 ? tracks[0].id : null);

  if (!currentTrackId) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-4 bg-black text-white">
        <h2 className="text-lg font-bold">No audio track found</h2>
        <button onClick={handleBack} className="px-4 py-2 bg-cyan-500 text-black rounded-xl text-xs font-bold">
          Back to Audio Story
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <AudioStoryPlayerContainer
        storyId={storyId}
        trackId={currentTrackId}
        tracks={tracks}
        onBack={handleBack}
        initialSpeed={speedParam ? parseFloat(speedParam) : 1}
        initialVolume={volumeParam ? parseFloat(volumeParam) / 100 : 1}
      />
    </div>
  );
}
