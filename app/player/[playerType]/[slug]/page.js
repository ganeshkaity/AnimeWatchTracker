"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { getLocalAnimes, getLocalEpisodes, getLocalMovie } from '../../../utils/localStore';
import YoutubePlayerContainer from '../../../pages/YoutubePlayerContainer';
import MediaServerPlayerContainer from '../../../pages/MediaServerPlayerContainer';
import YtDlpPlayerContainer from '../../../pages/YtDlpPlayerContainer';
import { Loader2 } from 'lucide-react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, loading: authLoading } = useAuth();

  const playerType = params?.playerType || 'mediaserver';
  const animeId = params?.slug;
  const initialEpId = searchParams.get('ep');
  const speedParam = searchParams.get('speed');
  const volumeParam = searchParams.get('volume');
  const qualityParam = searchParams.get('quality');
  const isMovieType = searchParams.get('type') === 'movie';

  const [episodes, setEpisodes] = useState([]);
  const [activeEpId, setActiveEpId] = useState(initialEpId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (playerType === 'audio') {
      router.replace(`/audio-player/${animeId}${initialEpId ? `?ep=${initialEpId}` : ''}`);
      return;
    }
  }, [playerType, animeId, initialEpId, router]);

  useEffect(() => {
    if (!animeId || playerType === 'audio') return;

    const loadEpisodes = async () => {
      setLoading(true);
      try {
        // Check if movie
        let localMovie = getLocalMovie(animeId);
        if (isMovieType || localMovie) {
          if (!localMovie && currentUser?.uid && db) {
            const mSnap = await getDoc(doc(db, 'users', currentUser.uid, 'movies', animeId));
            if (mSnap.exists()) {
              localMovie = { id: mSnap.id, ...mSnap.data() };
            }
          }
          if (localMovie) {
            const movieEp = {
              id: localMovie.id,
              episodeNumber: 1,
              title: localMovie.title,
              name: localMovie.title,
              fileName: localMovie.localFileName || localMovie.title,
              filePath: localMovie.localFilePath,
              youtubeId: localMovie.youtubeId || localMovie.youtubeUrl,
              isYouTube: Boolean(localMovie.isYouTube || localMovie.youtubeUrl || localMovie.youtubeId),
              lastPositionSeconds: localMovie.currentTime || 0,
              watchedSeconds: localMovie.currentTime || 0,
              durationSeconds: localMovie.duration || (localMovie.runtime ? localMovie.runtime * 60 : 0),
              isWatched: Boolean(localMovie.watched || localMovie.completed),
              isMovie: true,
            };
            setEpisodes([movieEp]);
            setActiveEpId(movieEp.id);
            setLoading(false);
            return;
          }
        }

        let localEps = getLocalEpisodes(animeId) || [];
        if (localEps.length === 0 && currentUser?.uid && db) {
          const snap = await getDocs(collection(db, 'users', currentUser.uid, 'anime', animeId, 'episodes'));
          const dbEps = [];
          snap.forEach(d => dbEps.push({ id: d.id, ...d.data() }));
          localEps = dbEps;
        }

        // Apply quality override if provided in query params
        if (qualityParam) {
          localEps = localEps.map(e => ({ ...e, selectedQuality: qualityParam }));
        }

        setEpisodes(localEps);
        if (!activeEpId && localEps.length > 0) {
          setActiveEpId(localEps[0].id);
        }
      } catch (err) {
        console.error('[PlayerPage] Error loading episodes:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEpisodes();
  }, [animeId, currentUser, isMovieType]);

  const handleBack = () => {
    if (isMovieType || getLocalMovie(animeId)) {
      router.push(`/movies/${animeId}`);
    } else {
      router.push(`/${animeId}`);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-3 bg-black text-white">
        <Loader2 className="animate-spin text-[#7c5cff]" size={36} />
        <span className="text-xs uppercase tracking-widest text-gray-400 font-bold">Loading Player...</span>
      </div>
    );
  }

  const currentEpisodeId = activeEpId || (episodes.length > 0 ? episodes[0].id : null);

  if (!currentEpisodeId) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-4 bg-black text-white">
        <h2 className="text-lg font-bold">No episode selected or found</h2>
        <button onClick={handleBack} className="px-4 py-2 bg-[#7c5cff] rounded-xl text-xs font-bold">
          Back to Anime
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {playerType === 'youtube' ? (
        <YoutubePlayerContainer
          animeId={animeId}
          episodeId={currentEpisodeId}
          episodes={episodes}
          onBack={handleBack}
        />
      ) : playerType === 'ytdlp' || playerType === 'yt-dlp' ? (
        <YtDlpPlayerContainer
          animeId={animeId}
          episodeId={currentEpisodeId}
          episodes={episodes}
          onBack={handleBack}
          initialSpeed={speedParam ? parseFloat(speedParam) : 1}
          initialVolume={volumeParam ? parseFloat(volumeParam) / 100 : 1}
        />
      ) : (
        <MediaServerPlayerContainer
          animeId={animeId}
          episodeId={currentEpisodeId}
          episodes={episodes}
          onBack={handleBack}
          initialSpeed={speedParam ? parseFloat(speedParam) : 1}
          initialVolume={volumeParam ? parseFloat(volumeParam) / 100 : 1}
        />
      )}
    </div>
  );
}
