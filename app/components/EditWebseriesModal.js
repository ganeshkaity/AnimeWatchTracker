"use client";

import React, { useState, useEffect } from 'react';
import {
  Tv, X, HardDrive, ImagePlus, CheckCircle2,
  AlertTriangle, Loader2, Image as ImageIcon, Sparkles,
  Trash2, Search, Check, Youtube, Play, Video, FolderTree
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { NAMING_PATTERNS } from '../utils/parser';
import OmdbRefetchSection from './OmdbRefetchSection';
import RatingSourceSelector from './RatingSourceSelector';
import { mapUsToIndianRating, normalizeIndianRating } from '../utils/ageRatingUtils';

const GENRES_LIST = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Sci-Fi & Fantasy", "Science Fiction", "Soap", "Talk", "Thriller", "War & Politics", "Western"
];

const extractYoutubeId = (urlOrId) => {
  if (!urlOrId) return '';
  const str = String(urlOrId).trim();
  if (str.startsWith('youtube://')) return str.replace('youtube://', '');
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([\w-]{11})/);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[\w-]{11}$/.test(str)) {
    return str;
  }
  return '';
};

export default function EditWebseriesModal({
  isOpen,
  webseries,
  series,
  onClose,
  onSaveWebseries,
}) {
  const currentSeries = webseries || series;

  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [namingPattern, setNamingPattern] = useState('auto');

  // YouTube Playlist State
  const [isYouTube, setIsYouTube] = useState(false);
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState('');
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState('');
  const [newPlaylistEpisodes, setNewPlaylistEpisodes] = useState(null);

  const [year, setYear] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [rating, setRating] = useState('');
  const [tmdbRating, setTmdbRating] = useState('');
  const [imdbRating, setImdbRating] = useState('');
  const [ratingSource, setRatingSource] = useState('tmdb');
  const [ageRating, setAgeRating] = useState('');
  const [tmdbAgeRating, setTmdbAgeRating] = useState('');
  const [omdbAgeRating, setOmdbAgeRating] = useState('');
  const [ageRatingSource, setAgeRatingSource] = useState('tmdb');
  const [overview, setOverview] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [availableLogos, setAvailableLogos] = useState([]);
  const [availableVideos, setAvailableVideos] = useState([]);
  const [selectedVideoKey, setSelectedVideoKey] = useState('');
  const [customYoutubeInput, setCustomYoutubeInput] = useState('');
  const [watchStatus, setWatchStatus] = useState('Plan to Watch');
  const [genres, setGenres] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [omdb, setOmdb] = useState(null);
  const [imdbId, setImdbId] = useState('');

  useEffect(() => {
    if (currentSeries) {
      setTitle(currentSeries.title || '');
      setOriginalTitle(currentSeries.originalTitle || '');
      setFolderPath(currentSeries.folderPath || '');
      setNamingPattern(currentSeries.namingPattern || 'auto');

      const hasYtPlaylist = Boolean(
        currentSeries.isYouTube ||
        currentSeries.youtubePlaylistUrl ||
        (currentSeries.folderPath && (
          currentSeries.folderPath.includes('youtube.com') ||
          currentSeries.folderPath.includes('youtu.be') ||
          currentSeries.folderPath.startsWith('http')
        ))
      );
      setIsYouTube(hasYtPlaylist);
      setYoutubePlaylistUrl(
        currentSeries.youtubePlaylistUrl ||
        (hasYtPlaylist ? currentSeries.folderPath : '') ||
        ''
      );
      setNewPlaylistEpisodes(null);
      setPlaylistError('');

      setYear(currentSeries.year || '');
      setReleaseDate(currentSeries.releaseDate || '');
      setRating(currentSeries.rating ? String(currentSeries.rating) : '');
      setTmdbRating(currentSeries.tmdbRating ? String(currentSeries.tmdbRating) : (currentSeries.rating ? String(currentSeries.rating) : ''));
      setImdbRating(currentSeries.imdbRating ? String(currentSeries.imdbRating) : (currentSeries.omdb?.imdbRating ? String(currentSeries.omdb.imdbRating) : ''));
      setRatingSource(currentSeries.ratingSource || (currentSeries.imdbRating ? 'omdb' : 'tmdb'));
      setAgeRating(currentSeries.ageRating || '');
      setTmdbAgeRating(currentSeries.tmdbAgeRating || currentSeries.ageRating || '');
      setOmdbAgeRating(currentSeries.omdbAgeRating || '');
      setAgeRatingSource(currentSeries.ageRatingSource || 'tmdb');
      setOverview(currentSeries.overview || '');
      setPosterUrl(currentSeries.posterUrl || '');
      setBackdropUrl(currentSeries.backdropUrl || '');
      setLogoUrl(currentSeries.logoUrl || '');
      setWatchStatus(currentSeries.watchStatus || (currentSeries.completed ? 'Completed' : 'Plan to Watch'));
      setGenres(Array.isArray(currentSeries.genres) ? currentSeries.genres : []);
      setAvailableLogos(Array.isArray(currentSeries?.images?.logos) ? currentSeries.images.logos : []);
      setOmdb(currentSeries.omdb || null);
      setImdbId(currentSeries.imdbId || currentSeries.omdb?.imdbId || '');

      const initVideos = Array.isArray(currentSeries?.videos) ? currentSeries.videos : [];
      setAvailableVideos(initVideos);

      const curYtKey = extractYoutubeId(
        currentSeries.playableYoutubeId ||
        currentSeries.youtubeId ||
        currentSeries.trailerKey ||
        currentSeries.trailerUrl
      );
      setSelectedVideoKey(curYtKey || '');
      setCustomYoutubeInput(
        curYtKey
          ? `https://www.youtube.com/watch?v=${curYtKey}`
          : (currentSeries.playableYoutubeUrl || currentSeries.trailerUrl || '')
      );
    }
  }, [currentSeries]);

  if (!isOpen || !currentSeries) return null;

  // ── Fetch YouTube Playlist via yt-dlp ─────────────────────────────────────────
  const handleFetchPlaylist = async () => {
    const url = youtubePlaylistUrl.trim();
    if (!url) {
      setPlaylistError('Please enter a YouTube playlist URL');
      return;
    }
    setFetchingPlaylist(true);
    setPlaylistError('');
    try {
      const res = await fetch('/api/youtube/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success && data.playlist && Array.isArray(data.playlist.videos)) {
        const mapped = data.playlist.videos.map((v, idx) => ({
          id: `yt_${v.id || (idx + 1)}`,
          episodeNumber: v.index || (idx + 1),
          seasonNumber: 1,
          title: v.title || `Episode ${idx + 1}`,
          name: v.title || `Episode ${idx + 1}`,
          fileName: v.title || `Episode ${idx + 1}`,
          filePath: `youtube://${v.id}`,
          youtubeId: v.id,
          youtubeUrl: v.url || `https://www.youtube.com/watch?v=${v.id}`,
          folderPath: url,
          overview: '',
          stillUrl: v.thumbnail || backdropUrl || posterUrl || '',
          thumbnailUrl: v.thumbnail || '',
          durationSeconds: v.durationSeconds || 0,
          durationFormatted: v.durationFormatted || '',
          isYouTube: true,
          lastPositionSeconds: 0,
          watchedSeconds: 0,
          isWatched: false,
          createdAt: new Date().toISOString(),
        }));
        setNewPlaylistEpisodes(mapped);
        if (!title.trim() && data.playlist.title) {
          setTitle(data.playlist.title);
        }
        if (!posterUrl.trim() && data.playlist.thumbnail) {
          setPosterUrl(data.playlist.thumbnail);
        }
        if (!backdropUrl.trim() && data.playlist.thumbnail) {
          setBackdropUrl(data.playlist.thumbnail);
        }
      } else {
        setPlaylistError(data.error || 'Failed to fetch playlist episodes via yt-dlp');
      }
    } catch (err) {
      console.error('[EditWebseriesModal] Fetch playlist error:', err);
      setPlaylistError('Network error while extracting playlist via yt-dlp');
    } finally {
      setFetchingPlaylist(false);
    }
  };

  const handleOmdbUpdated = (data) => {
    if (data?.omdb) {
      setOmdb(data.omdb);
      if (data.imdbId) setImdbId(data.imdbId);
      if (data.imdbRating) {
        setImdbRating(String(data.imdbRating));
        if (ratingSource === 'omdb') {
          setRating(String(data.imdbRating));
        }
      }
      if (data.omdb.rated && data.omdb.rated !== 'N/A') {
        const converted = mapUsToIndianRating(data.omdb.rated) || normalizeIndianRating(data.omdb.rated) || data.omdb.rated;
        setOmdbAgeRating(converted);
        if (ageRatingSource === 'omdb' || !ageRating) {
          setAgeRating(converted);
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a title.');
      return;
    }

    if (isYouTube && !youtubePlaylistUrl.trim()) {
      alert('Please enter a YouTube playlist URL.');
      return;
    }

    setSubmitting(true);
    try {
      const parsedYtKey = extractYoutubeId(customYoutubeInput) || selectedVideoKey;

      const effectiveRating = ratingSource === 'omdb'
        ? (imdbRating ? parseFloat(imdbRating) : (rating ? parseFloat(rating) : 0))
        : (tmdbRating ? parseFloat(tmdbRating) : (rating ? parseFloat(rating) : 0));

      const updated = {
        ...currentSeries,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        folderPath: isYouTube ? youtubePlaylistUrl.trim() : folderPath.trim(),
        namingPattern: isYouTube ? 'youtube' : (namingPattern || 'auto'),
        isYouTube: Boolean(isYouTube),
        youtubePlaylistUrl: isYouTube ? youtubePlaylistUrl.trim() : null,
        episodeCount: (isYouTube && newPlaylistEpisodes?.length) ? newPlaylistEpisodes.length : (currentSeries.episodeCount || 0),
        year: year ? String(year) : '',
        releaseDate: releaseDate || '',
        rating: effectiveRating,
        tmdbRating: tmdbRating ? parseFloat(tmdbRating) : (currentSeries.tmdbRating || null),
        imdbRating: imdbRating ? parseFloat(imdbRating) : (omdb?.imdbRating || currentSeries.imdbRating || currentSeries.omdb?.imdbRating || null),
        ratingSource: ratingSource || 'tmdb',
        ageRating: ageRating ? ageRating.trim() : null,
        tmdbAgeRating: tmdbAgeRating ? tmdbAgeRating.trim() : null,
        omdbAgeRating: omdbAgeRating ? omdbAgeRating.trim() : null,
        ageRatingSource: ageRatingSource || 'tmdb',
        userRating: rating ? parseFloat(rating) : (currentSeries.userRating || null),
        isManualRating: false,
        overview: overview.trim(),
        posterUrl: posterUrl.trim(),
        backdropUrl: backdropUrl.trim(),
        logoUrl: logoUrl.trim(),
        watchStatus,
        completed: watchStatus === 'Completed',
        watched: watchStatus === 'Completed',
        genres: genres.length > 0 ? genres : ['Drama'],
        omdb: omdb || currentSeries.omdb || null,
        imdbId: imdbId || omdb?.imdbId || currentSeries.imdbId || currentSeries.omdb?.imdbId || null,
        imdbRating: omdb?.imdbRating || currentSeries.imdbRating || currentSeries.omdb?.imdbRating || null,
        imdbVotes: omdb?.imdbVotes || currentSeries.imdbVotes || currentSeries.omdb?.imdbVotes || null,
        rottenTomatoes: omdb?.rottenTomatoes || currentSeries.rottenTomatoes || currentSeries.omdb?.rottenTomatoes || null,
        metacritic: omdb?.metacritic || currentSeries.metacritic || currentSeries.omdb?.metacritic || null,
        awards: omdb?.awards || currentSeries.awards || currentSeries.omdb?.awards || null,
        boxOffice: omdb?.boxOffice || currentSeries.boxOffice || currentSeries.omdb?.boxOffice || null,
        playableYoutubeId: parsedYtKey || null,
        playableYoutubeUrl: parsedYtKey ? `https://www.youtube.com/watch?v=${parsedYtKey}` : (customYoutubeInput.trim() || null),
        updatedAt: new Date().toISOString(),
      };

      await onSaveWebseries(updated, isYouTube && newPlaylistEpisodes ? newPlaylistEpisodes : null);
      onClose();
    } catch (err) {
      console.error('[EditWebseriesModal] Save error:', err);
      alert('Failed to update webseries: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Tv size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                Edit Web-series Details
              </h2>
              <p className="text-[11px] text-gray-400">
                Update metadata, artwork, playable teaser video, and folder settings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="overflow-y-auto p-6 space-y-5 flex-1 custom-scrollbar">
          <form id="edit-webseries-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Series Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Original Title
                </label>
                <input
                  type="text"
                  value={originalTitle}
                  onChange={(e) => setOriginalTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Year & Release Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="2024"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-1/3 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Rating (0 - 10)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Watch Status */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-1.5">
                Watch Status:
              </label>
              <div className="flex gap-2">
                {['Plan to Watch', 'Currently Watching', 'Completed'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setWatchStatus(st)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      watchStatus === st
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Media Source: Local Folder vs YouTube Playlist ── */}
            <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  {isYouTube ? (
                    <>
                      <Youtube size={15} className="text-red-400" />
                      <span className="text-red-300">YouTube Playlist Link (yt-dlp Extraction)</span>
                    </>
                  ) : (
                    <>
                      <FolderTree size={14} />
                      <span>Local Folder & Naming Pattern</span>
                    </>
                  )}
                </label>

                {/* Source Switcher */}
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsYouTube(false)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      !isYouTube
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                        : 'text-gray-400 hover:text-white border border-transparent'
                    }`}
                  >
                    <FolderTree size={12} />
                    <span>Local Folder</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsYouTube(true)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      isYouTube
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow'
                        : 'text-gray-400 hover:text-white border border-transparent'
                    }`}
                  >
                    <Youtube size={13} className="text-red-400" />
                    <span>YouTube Playlist</span>
                  </button>
                </div>
              </div>

              {isYouTube ? (
                /* YouTube Playlist Mode */
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                      YouTube Playlist URL:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="https://www.youtube.com/playlist?list=..."
                        value={youtubePlaylistUrl}
                        onChange={(e) => {
                          setYoutubePlaylistUrl(e.target.value);
                          setPlaylistError('');
                        }}
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-400"
                      />
                      <button
                        type="button"
                        onClick={handleFetchPlaylist}
                        disabled={fetchingPlaylist || !youtubePlaylistUrl.trim()}
                        className="px-4 py-2.5 rounded-xl bg-red-600/25 hover:bg-red-600/35 border border-red-500/50 text-red-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        {fetchingPlaylist ? (
                          <>
                            <Loader2 size={14} className="animate-spin text-red-400" />
                            <span>Fetching...</span>
                          </>
                        ) : (
                          <>
                            <Youtube size={15} className="text-red-400" />
                            <span>Fetch / Rescan Playlist (yt-dlp)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {playlistError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle size={15} className="shrink-0" />
                      <span>{playlistError}</span>
                    </div>
                  )}

                  {newPlaylistEpisodes && newPlaylistEpisodes.length > 0 && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold">
                          <CheckCircle2 size={16} />
                          <span>Extracted {newPlaylistEpisodes.length} episodes via yt-dlp</span>
                        </div>
                        <span className="text-[10px] font-mono opacity-80">
                          Will update Firestore on save
                        </span>
                      </div>

                      {/* Episode preview */}
                      <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-black/40 border border-white/10 custom-scrollbar">
                        {newPlaylistEpisodes.map((ep, idx) => (
                          <div
                            key={ep.id || idx}
                            className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/5 text-xs text-white"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-mono font-bold text-gray-300 shrink-0">
                                {ep.episodeNumber || idx + 1}
                              </span>
                              {ep.stillUrl || ep.thumbnailUrl ? (
                                <img
                                  src={ep.stillUrl || ep.thumbnailUrl}
                                  alt=""
                                  className="w-12 h-7 rounded object-cover shrink-0 bg-black/60"
                                />
                              ) : null}
                              <span className="truncate font-medium">{ep.title || ep.name}</span>
                            </div>
                            {ep.durationFormatted && (
                              <span className="text-[10px] font-mono text-gray-400 shrink-0">
                                {ep.durationFormatted}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Local Folder Mode */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                      Local Folder Path
                    </label>
                    <input
                      type="text"
                      value={folderPath}
                      onChange={(e) => setFolderPath(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                      Naming Pattern
                    </label>
                    <select
                      value={namingPattern}
                      onChange={(e) => setNamingPattern(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                    >
                      <option value="auto">Auto-Detect Pattern (Recommended)</option>
                      <option value="sxxexx">Season / Episode (S01E01, S1E1)</option>
                      <option value="episode">Episode Tag (Episode 01, Ep 01)</option>
                      <option value="bare">Prefix / Pure Numeric (01 - Title, 1)</option>
                      <option value="anything">Anything (All video files)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Overview */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                Overview & Storyline
              </label>
              <textarea
                rows={3}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>

            {/* Genres */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-1.5">
                Genres:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {GENRES_LIST.map((g) => {
                  const isChecked = genres.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setGenres(prev =>
                          isChecked ? prev.filter(x => x !== g) : [...prev, g]
                        );
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border cursor-pointer ${
                        isChecked
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Playable YouTube Video / Teaser Selection ── */}
            <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/10">
              <label className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <Youtube size={15} /> Playable YouTube Video / Teaser
              </label>

              {/* Enter custom URL */}
              <div>
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=... or YouTube Video ID"
                  value={customYoutubeInput}
                  onChange={(e) => {
                    setCustomYoutubeInput(e.target.value);
                    const id = extractYoutubeId(e.target.value);
                    if (id) setSelectedVideoKey(id);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-rose-400"
                />
              </div>

              {/* Fetched Videos List */}
              {availableVideos.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                    Or select from fetched trailers/teasers:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                    {availableVideos.map((v) => {
                      const isSelected = selectedVideoKey === v.key;
                      return (
                        <div
                          key={v.id || v.key}
                          onClick={() => {
                            setSelectedVideoKey(v.key);
                            setCustomYoutubeInput(`https://www.youtube.com/watch?v=${v.key}`);
                          }}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                            isSelected
                              ? 'bg-rose-500/20 border-rose-400 text-white'
                              : 'bg-black/30 border-white/10 text-gray-300 hover:border-white/30'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-xs block truncate">{v.name}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{v.type || 'Trailer'}</span>
                          </div>
                          {isSelected && <Check size={14} className="text-rose-400 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Artwork URLs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Poster URL
                </label>
                <input
                  type="text"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Backdrop URL
                </label>
                <input
                  type="text"
                  value={backdropUrl}
                  onChange={(e) => setBackdropUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Logo Art URL
                </label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Logo Picker */}
            {availableLogos.length > 1 && (
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] text-gray-400 block font-semibold">
                  Pick from Fetched Logos:
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {availableLogos.slice(0, 8).map((logo, idx) => {
                    const isSelected = logoUrl === logo.url;
                    return (
                      <div
                        key={idx}
                        onClick={() => setLogoUrl(logo.url)}
                        className={`h-12 w-28 px-2 rounded-xl bg-black/50 border flex items-center justify-center shrink-0 cursor-pointer transition ${
                          isSelected ? 'border-amber-400 bg-amber-500/10' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img src={logo.url} alt="Logo" className="max-h-9 max-w-full object-contain" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* OMDB Refetch & Metadata Section */}
            <OmdbRefetchSection
              title={title}
              year={year}
              imdbId={imdbId}
              type="series"
              currentOmdb={omdb}
              onOmdbUpdated={handleOmdbUpdated}
            />

            {/* Rating Display & Source (TMDB & OMDB / IMDb Indian Age Rating) */}
            <RatingSourceSelector
              title={title}
              year={year}
              imdbId={imdbId}
              tmdbId={webseries.tmdbId}
              type="series"
              ageRating={ageRating}
              setAgeRating={setAgeRating}
              tmdbAgeRating={tmdbAgeRating}
              setTmdbAgeRating={setTmdbAgeRating}
              omdbAgeRating={omdbAgeRating}
              setOmdbAgeRating={setOmdbAgeRating}
              ageRatingSource={ageRatingSource}
              setAgeRatingSource={setAgeRatingSource}
              currentOmdb={omdb}
              onAgeRatingChanged={(newAge) => setAgeRating(newAge)}
            />
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs uppercase tracking-wider transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            form="edit-webseries-form"
            disabled={submitting || !title.trim()}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
