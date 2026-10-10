"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HardDrive, X, Folder, FileVideo, CheckCircle2,
  AlertTriangle, Loader2, ArrowRight, Sparkles, Film,
  BookOpen, Headphones, Tv
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  upsertLocalMovie, upsertLocalAnime, upsertLocalWebseries, upsertLocalManga,
  upsertLocalAudioStory, setLocalEpisodes, setLocalWebseriesEpisodes, deleteLocalWatchlist,
  getUserId
} from '../utils/localStore';

const slugify = (text) => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

export default function TransferWatchlistModal({
  isOpen,
  onClose,
  item,
  onTransferred,
}) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || getUserId();

  const [path, setPath] = useState('');
  const [fileName, setFileName] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null);
  const [scannedItems, setScannedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [success, setSuccess] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');

  if (!isOpen || !item) return null;

  const isMovie = item.contentType === 'movie';
  const isAnime = item.contentType === 'anime';
  const isSeries = ['web-series', 'webseries', 'series', 'tv'].includes(item.contentType);
  const isMangaFamily = ['manga', 'manhwa', 'manwah', 'webtoon'].includes(item.contentType);
  const isAudioStory = item.contentType === 'audio-stories' || item.contentType === 'audio-story';

  const targetSlug = slugify(item.title || item.originalTitle || '') || (
    isMovie ? `movie-${Date.now()}` :
    isSeries ? `series-${Date.now()}` :
    isAnime ? `anime-${Date.now()}` :
    isMangaFamily ? `manga-${Date.now()}` :
    `audio-${Date.now()}`
  );

  // ── 1. Browse PC for File or Folder ───────────────────────────────────────
  const handleBrowse = async () => {
    setBrowsing(true);
    setErrorMsg('');

    try {
      if (isMovie) {
        // Browse single video file
        const res = await fetch('/api/movies/select-file');
        const data = await res.json();
        if (data.success && data.path) {
          setPath(data.path);
          setFileName(data.fileName || data.path.split(/[\\/]/).pop());
          setVerified(true);
        } else if (data.error) {
          setErrorMsg(data.error);
        }
      } else {
        // Browse directory
        const res = await fetch('/api/select-folder');
        const data = await res.json();
        if (data.success && data.path) {
          setPath(data.path);
          setFileName(data.path.split(/[\\/]/).pop());

          // If anime/series, scan episodes automatically
          if (isAnime || isSeries) {
            setVerifying(true);
            const scanRes = await fetch('/api/scan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderPath: data.path }),
            });
            const scanData = await scanRes.json();
            if (scanData.success && Array.isArray(scanData.episodes)) {
              setScannedItems(scanData.episodes);
              setVerified(true);
            } else {
              setErrorMsg(scanData.error || 'Failed to scan video files in folder.');
              setVerified(false);
            }
            setVerifying(false);
          } else {
            setVerified(true);
          }
        } else if (data.error) {
          setErrorMsg(data.error);
        }
      }
    } catch (err) {
      console.error('Browse error:', err);
      setErrorMsg('Failed to open system dialog: ' + err.message);
    } finally {
      setBrowsing(false);
    }
  };

  // ── 2. Transfer Execution ──────────────────────────────────────────────────
  const handleTransfer = async () => {
    if (!path.trim()) {
      setErrorMsg('Please specify a local file or folder path on your PC.');
      return;
    }

    setTransferring(true);
    setErrorMsg('');

    try {
      const timestamp = new Date().toISOString();

      if (isMovie) {
        // Transfer to Movies Library
        const movieId = targetSlug;
        const movieData = {
          id: movieId,
          tmdbId: item.tmdbId || null,
          title: item.title,
          originalTitle: item.originalTitle || '',
          year: item.year || '',
          releaseDate: item.releaseDate || '',
          runtime: item.runtime || 0,
          genres: item.genres || [],
          rating: item.rating || 0,
          overview: item.overview || '',
          posterUrl: item.posterUrl || '',
          backdropUrl: item.backdropUrl || '',
          logoUrl: item.logoUrl || '',
          filePath: path.trim(),
          fileName: fileName || path.split(/[\\/]/).pop(),
          cast: item.cast || [],
          crew: item.crew || [],
          images: item.images || { posters: [], backdrops: [], logos: [] },
          videos: item.videos || [],
          watchProgress: 0,
          currentTime: 0,
          isWatched: false,
          watched: false,
          addedAt: timestamp,
          updatedAt: timestamp,
        };

        // Save local + Firestore
        upsertLocalMovie(movieData);
        if (db && userId) {
          await setDoc(doc(db, 'users', userId, 'movies', movieId), movieData, { merge: true });
        }

        setTargetUrl(`/movies/${movieId}`);
      } else if (isSeries) {
        // Transfer to Webseries Library
        const seriesId = targetSlug;
        const episodesList = scannedItems.length > 0 ? scannedItems.map(ep => ({
          ...ep,
          seasonNumber: ep.seasonNumber || 1,
          seriesId,
        })) : [
          {
            id: 'ep-1',
            episodeNumber: 1,
            seasonNumber: 1,
            title: 'Episode 1',
            filePath: path.trim(),
            fileName: fileName || 'Episode 1',
            isWatched: false,
            seriesId,
          }
        ];

        const seriesData = {
          id: seriesId,
          title: item.title,
          originalTitle: item.originalTitle || '',
          contentType: 'web-series',
          type: 'webseries',
          isWebseries: true,
          tmdbId: item.tmdbId || null,
          folderPath: path.trim(),
          year: item.year ? String(item.year) : '',
          releaseDate: item.releaseDate || '',
          overview: item.overview || '',
          description: item.overview || '',
          posterUrl: item.posterUrl || '',
          backdropUrl: item.backdropUrl || '',
          logoUrl: item.logoUrl || '',
          genres: Array.isArray(item.genres) && item.genres.length > 0 ? item.genres : ['Drama'],
          rating: item.rating ? parseFloat(item.rating) : 0,
          voteCount: item.voteCount || 0,
          cast: item.cast || [],
          crew: item.crew || [],
          images: item.images || { posters: [], backdrops: [], logos: [] },
          videos: item.videos || [],
          seasons: item.seasons || [],
          episodeCount: episodesList.length,
          totalEpisodes: episodesList.length,
          progressPercent: 0,
          watchStatus: 'Plan to Watch',
          status: 'Plan to Watch',
          addedAt: timestamp,
          updatedAt: timestamp,
        };

        // Save local
        upsertLocalWebseries(seriesData);
        setLocalWebseriesEpisodes(seriesId, episodesList);

        // Save Firestore
        if (db && userId) {
          await setDoc(doc(db, 'users', userId, 'webseries', seriesId), seriesData, { merge: true });
          const batch = writeBatch(db);
          episodesList.forEach((ep) => {
            const epRef = doc(db, 'users', userId, 'webseries', seriesId, 'episodes', ep.id || `ep-${ep.episodeNumber}`);
            batch.set(epRef, ep, { merge: true });
          });
          await batch.commit();
        }

        setTargetUrl(`/webseries/${seriesId}`);
      } else if (isAnime) {
        // Transfer to Anime Library
        const animeId = targetSlug;
        const episodesList = scannedItems.length > 0 ? scannedItems : [
          {
            id: 'ep-1',
            episodeNumber: 1,
            title: 'Episode 1',
            filePath: path.trim(),
            fileName: fileName || 'Episode 1',
            isWatched: false,
          }
        ];

        const animeData = {
          id: animeId,
          title: item.title,
          folderPath: path.trim(),
          thumbnailBase64: item.posterUrl || '',
          bannerImage: item.backdropUrl || '',
          logoUrl: item.logoUrl || '',
          description: item.overview || '',
          genres: item.genres || [],
          rating: item.rating || 0,
          totalEpisodes: String(episodesList.length),
          episodeCount: episodesList.length,
          progressPercent: 0,
          status: 'watching',
          addedAt: timestamp,
          updatedAt: timestamp,
        };

        // Save local
        upsertLocalAnime(animeData);
        setLocalEpisodes(animeId, episodesList);

        // Save Firestore
        if (db && userId) {
          await setDoc(doc(db, 'users', userId, 'anime', animeId), animeData, { merge: true });
          const batch = writeBatch(db);
          episodesList.forEach((ep) => {
            const epRef = doc(db, 'users', userId, 'anime', animeId, 'episodes', ep.id || `ep-${ep.episodeNumber}`);
            batch.set(epRef, ep, { merge: true });
          });
          await batch.commit();
        }

        setTargetUrl(`/anime/${animeId}`);
      } else if (isMangaFamily) {
        // Transfer to Manga Library
        const mangaId = targetSlug;
        const mangaData = {
          id: mangaId,
          title: item.title,
          folderPath: path.trim(),
          thumbnailBase64: item.posterUrl || '',
          bannerImage: item.backdropUrl || '',
          logoUrl: item.logoUrl || '',
          synopsis: item.overview || '',
          genres: item.genres || [],
          rating: item.rating || 0,
          totalChapters: '1',
          progressPercent: 0,
          status: 'reading',
          addedAt: timestamp,
          updatedAt: timestamp,
        };

        upsertLocalManga(mangaData);
        if (db && userId) {
          await setDoc(doc(db, 'users', userId, 'mangas', mangaId), mangaData, { merge: true });
        }

        setTargetUrl(`/manga/${mangaId}`);
      } else if (isAudioStory) {
        // Transfer to Audio Story Library
        const storyId = targetSlug;
        const storyData = {
          id: storyId,
          title: item.title,
          folderPath: path.trim(),
          thumbnailBase64: item.posterUrl || '',
          bannerImage: item.backdropUrl || '',
          logoUrl: item.logoUrl || '',
          description: item.overview || '',
          genres: item.genres || [],
          rating: item.rating || 0,
          trackCount: 1,
          progressPercent: 0,
          addedAt: timestamp,
          updatedAt: timestamp,
        };

        upsertLocalAudioStory(storyData);
        if (db && userId) {
          await setDoc(doc(db, 'users', userId, 'audioStories', storyId), storyData, { merge: true });
        }

        setTargetUrl(`/audio-story/${storyId}`);
      }

      // Remove from Watchlist
      deleteLocalWatchlist(item.id);
      if (db && userId) {
        try {
          await deleteDoc(doc(db, 'users', userId, 'watchlist', item.id));
        } catch (delErr) {
          console.warn('Watchlist delete warning:', delErr);
        }
      }

      setSuccess(true);
      if (onTransferred) onTransferred(item.id);
    } catch (err) {
      console.error('Transfer execution error:', err);
      setErrorMsg('Transfer failed: ' + err.message);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-[#0c101a] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <HardDrive size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                Transfer to Main Library
              </h3>
              <p className="text-[11px] text-gray-400">
                Link local media on your PC and move from Watchlist to Active Library
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {success ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h4 className="text-base font-black text-white">Transfer Completed!</h4>
                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                  <span className="text-white font-bold">{item.title}</span> has been transferred to your active library with slug <span className="text-purple-300 font-mono font-semibold">"{targetSlug}"</span> and removed from watchlist.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold transition"
                >
                  Close
                </button>
                {targetUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(targetUrl);
                    }}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold flex items-center gap-2 shadow-lg"
                  >
                    <span>Open in Library</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Media Preview Card */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="w-12 h-16 rounded-xl overflow-hidden bg-black/40 shrink-0 border border-white/10">
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <Film size={20} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.contentType}
                    </span>
                    {item.year && <span className="text-gray-400 text-[10px]">{item.year}</span>}
                  </div>
                  <h4 className="font-bold text-white text-xs sm:text-sm truncate">{item.title}</h4>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <p className="text-[10px] text-gray-400 truncate">
                      Target: <span className="text-gray-200 font-semibold">{isMovie ? 'Movies Library' : isSeries ? 'Web-series Library' : isAnime ? 'Anime Library' : isMangaFamily ? 'Manga Library' : 'Audio Story Library'}</span>
                    </p>
                    <span className="text-gray-600">•</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400 font-medium">Slug:</span>
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-[10px] font-semibold">
                        {targetSlug}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-cyan-300 text-[11px] leading-relaxed">
                {isMovie ? (
                  <span>Select the local movie video file on your PC (.mp4, .mkv, .webm, .avi).</span>
                ) : (
                  <span>Select the local media folder on your PC containing the episodes or chapters.</span>
                )}
              </div>

              {/* Path input & Browse button */}
              <div className="space-y-1.5">
                <label className="block text-gray-400 font-bold">
                  {isMovie ? 'Movie File Location' : 'Media Folder Location'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => {
                      setPath(e.target.value);
                      setVerified(null);
                    }}
                    placeholder={isMovie ? 'C:\\Movies\\Inception.mp4' : isSeries ? 'C:\\Webseries\\Breaking Bad' : 'C:\\Anime\\Attack on Titan'}
                    className="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                  />
                  <button
                    type="button"
                    onClick={handleBrowse}
                    disabled={browsing}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    {browsing ? <Loader2 size={14} className="animate-spin" /> : isMovie ? <FileVideo size={14} /> : <Folder size={14} />}
                    <span>Browse PC</span>
                  </button>
                </div>
              </div>

              {/* Scan / Verification Status */}
              {verifying && (
                <div className="text-amber-400 text-[11px] flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Scanning files in folder...</span>
                </div>
              )}

              {scannedItems.length > 0 && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>Found {scannedItems.length} video episode(s) ready to import!</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-center gap-2">
                  <AlertTriangle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-white/10 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={transferring || !path.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
                >
                  {transferring ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
                  <span>{transferring ? 'Transferring...' : 'Transfer & Link to Library'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
