"use client";

import React, { useState, useEffect } from 'react';
import {
  Film, X, HardDrive, ImagePlus, CheckCircle2,
  AlertTriangle, Loader2, Image as ImageIcon, Sparkles,
  Trash2, Search, Check, Youtube
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GENRES_LIST = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Science Fiction", "Thriller", "TV Movie", "War", "Western"
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

export default function EditMovieModal({
  isOpen,
  movie,
  onClose,
  onSaveMovie,
}) {
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [isYouTube, setIsYouTube] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [year, setYear] = useState('');
  const [runtime, setRuntime] = useState('');
  const [rating, setRating] = useState('');
  const [overview, setOverview] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [availableLogos, setAvailableLogos] = useState([]);
  const [fetchingLogos, setFetchingLogos] = useState(false);
  const [logoFetchMsg, setLogoFetchMsg] = useState('');
  const [watchStatus, setWatchStatus] = useState('Not Started');
  const [genres, setGenres] = useState([]);
  const [verifyingFile, setVerifyingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (movie) {
      setTitle(movie.title || '');
      setOriginalTitle(movie.originalTitle || '');
      setIsYouTube(Boolean(movie.isYouTube || movie.youtubeUrl || movie.youtubeId || movie.localFilePath?.includes('youtube.com') || movie.localFilePath?.includes('youtu.be')));
      setFilePath(movie.youtubeUrl || movie.localFilePath || '');
      setFileName(movie.localFileName || '');
      setYear(movie.year || '');
      setRuntime(movie.runtime ? String(movie.runtime) : '');
      setRating(movie.rating ? String(movie.rating) : '');
      setOverview(movie.overview || '');
      setPosterUrl(movie.posterUrl || '');
      setBackdropUrl(movie.backdropUrl || '');
      setLogoUrl(movie.logoUrl || '');
      setWatchStatus(movie.watchStatus || (movie.watched ? 'Completed' : 'Not Started'));
      setGenres(Array.isArray(movie.genres) ? movie.genres : []);
      setAvailableLogos(Array.isArray(movie?.images?.logos) ? movie.images.logos : []);
      setLogoFetchMsg('');
    }
  }, [movie]);

  if (!isOpen || !movie) return null;

  const handleBrowseFile = async () => {
    setVerifyingFile(true);
    try {
      const res = await fetch('/api/movies/select-file');
      const data = await res.json();
      if (data.success && data.path) {
        setFilePath(data.path);
        setFileName(data.fileName || data.path.split(/[\\/]/).pop());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVerifyingFile(false);
    }
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setPosterUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleBackdropUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setBackdropUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setLogoUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFetchLogosFromTmdb = async () => {
    setFetchingLogos(true);
    setLogoFetchMsg('');
    try {
      let tmdbId = movie.tmdbId;
      if (!tmdbId && title.trim()) {
        const searchRes = await fetch(`/api/movies/search?query=${encodeURIComponent(title.trim())}`);
        const searchData = await searchRes.json();
        if (searchData.success && Array.isArray(searchData.movies) && searchData.movies.length > 0) {
          tmdbId = searchData.movies[0].id;
        }
      }
      if (!tmdbId) {
        setLogoFetchMsg('No matching TMDB movie found. Please verify the movie title.');
        return;
      }
      const detRes = await fetch(`/api/movies/details?id=${encodeURIComponent(tmdbId)}`);
      const detData = await detRes.json();
      if (detData.success && detData.movie?.images?.logos && detData.movie.images.logos.length > 0) {
        setAvailableLogos(detData.movie.images.logos);
        setLogoFetchMsg(`Found ${detData.movie.images.logos.length} logo${detData.movie.images.logos.length > 1 ? 's' : ''} from TMDB!`);
      } else {
        setLogoFetchMsg('No transparent logos available on TMDB for this movie.');
      }
    } catch (err) {
      console.error('Failed to fetch logos from TMDB:', err);
      setLogoFetchMsg('Error connecting to TMDB service.');
    } finally {
      setFetchingLogos(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const runtimeMinutes = runtime ? parseInt(runtime, 10) : (movie.runtime || 0);
      const isCompleted = watchStatus === 'Completed';

      const cleanPath = filePath.trim();
      const ytId = isYouTube ? extractYoutubeId(cleanPath) : '';

      const updated = {
        ...movie,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        isYouTube: Boolean(isYouTube),
        youtubeUrl: isYouTube ? cleanPath : '',
        youtubeId: isYouTube ? (ytId || cleanPath) : '',
        localFilePath: cleanPath,
        localFileName: isYouTube ? `YouTube: ${title.trim()}` : (fileName || cleanPath.split(/[\\/]/).pop() || movie.localFileName),
        year: year.trim(),
        runtime: runtimeMinutes,
        duration: runtimeMinutes * 60,
        rating: rating ? parseFloat(rating) : movie.rating,
        overview: overview.trim(),
        posterUrl: posterUrl || movie.posterUrl,
        backdropUrl: backdropUrl || movie.backdropUrl,
        logoUrl: logoUrl ? logoUrl.trim() : '',
        images: {
          ...(movie.images || {}),
          logos: availableLogos.length > 0 ? availableLogos : (movie.images?.logos || []),
        },
        watchStatus,
        watched: isCompleted,
        completed: isCompleted,
        watchProgress: isCompleted ? 100 : (watchStatus === 'Not Started' ? 0 : movie.watchProgress),
        genres,
        updatedAt: new Date().toISOString(),
      };

      await onSaveMovie(updated);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error updating movie: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
              <Film className="text-amber-400" size={20} />
              <span>Edit Movie Details</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title & Original Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Movie Title *
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Original Title
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={originalTitle}
                  onChange={(e) => setOriginalTitle(e.target.value)}
                />
              </div>
            </div>

            {/* Movie Video Source (Local File or YouTube Link) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1.5">
                  {isYouTube ? (
                    <>
                      <Youtube size={14} className="text-red-500" />
                      <span className="text-red-300">Enter Video Link</span>
                    </>
                  ) : (
                    <span>Local Movie Video File Path</span>
                  )}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white transition select-none bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-lg border border-white/10">
                  <input
                    type="checkbox"
                    checked={isYouTube}
                    onChange={(e) => setIsYouTube(e.target.checked)}
                    className="rounded bg-black/40 border-white/20 text-red-500 focus:ring-red-500 w-3.5 h-3.5 cursor-pointer accent-red-500"
                  />
                  <Youtube size={13} className="text-red-500" />
                  <span>YouTube Link</span>
                </label>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={isYouTube ? "Enter YouTube video link (e.g. https://www.youtube.com/watch?v=... or ID)" : "Local video file path..."}
                  className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                />
                {!isYouTube && (
                  <button
                    type="button"
                    onClick={handleBrowseFile}
                    disabled={verifyingFile}
                    className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                  >
                    {verifyingFile ? 'Locating...' : 'Browse PC'}
                  </button>
                )}
              </div>
            </div>

            {/* Year, Runtime, Watch Status */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Release Year
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Runtime (Min)
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Watch Status
                </label>
                <select
                  value={watchStatus}
                  onChange={(e) => setWatchStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white bg-[#181c24]"
                >
                  <option value="Not Started">Not Started</option>
                  <option value="Watching">Watching</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Overview */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                Overview / Synopsis
              </label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
              />
            </div>

            {/* Poster & Backdrop Artwork */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Poster Artwork */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                    Poster Artwork (2:3)
                  </label>
                  <label className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer">
                    <ImagePlus size={13} />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverUpload}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Poster image URL..."
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                />
                {posterUrl && (
                  <div className="relative w-16 h-24 rounded-xl overflow-hidden border border-white/20 shrink-0 mt-1">
                    <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Backdrop Artwork */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                    Backdrop Banner (16:9)
                  </label>
                  <label className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer">
                    <ImagePlus size={13} />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleBackdropUpload}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Backdrop banner image URL..."
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={backdropUrl}
                  onChange={(e) => setBackdropUrl(e.target.value)}
                />
                {backdropUrl && (
                  <div className="relative w-full h-20 rounded-xl overflow-hidden border border-white/20 shrink-0 mt-1">
                    <img src={backdropUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            {/* Custom Movie Logo */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-300 font-bold flex items-center gap-1.5">
                  <ImageIcon size={14} className="text-amber-400" />
                  Custom Movie Logo
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchLogosFromTmdb}
                    disabled={fetchingLogos}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-white font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    title="Fetch transparent logos from TMDB"
                  >
                    {fetchingLogos ? (
                      <Loader2 size={12} className="animate-spin text-amber-400" />
                    ) : (
                      <Sparkles size={12} className="text-amber-400" />
                    )}
                    <span>{fetchingLogos ? 'Fetching...' : 'Fetch from TMDB'}</span>
                  </button>

                  <label className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-bold flex items-center gap-1 cursor-pointer transition">
                    <ImagePlus size={12} className="text-gray-400" />
                    <span>Upload Local</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </label>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                When set, this logo replaces the plain text title in the home page scroll banner.
              </p>

              {logoFetchMsg && (
                <div className="text-[11px] p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 flex items-center justify-between gap-2">
                  <span>{logoFetchMsg}</span>
                  <button
                    type="button"
                    onClick={() => setLogoFetchMsg('')}
                    className="text-gray-400 hover:text-white text-xs cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* URL or direct link */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Paste transparent movie logo URL or select below..."
                  className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
              </div>

              {/* Active Logo Display & Delete Logo Button */}
              {logoUrl ? (
                <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 max-w-[160px] p-1.5 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center shrink-0">
                      <img src={logoUrl} alt="Active Logo" className="max-h-9 w-auto max-w-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check size={11} /> Active Logo Set
                      </span>
                      <span className="text-[10px] text-gray-400 truncate block max-w-xs">
                        Showing in home page scroll banner
                      </span>
                    </div>
                  </div>

                  {/* Prominent Delete Logo Button (Returns to Text Name) */}
                  <button
                    type="button"
                    onClick={() => setLogoUrl('')}
                    className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 hover:text-red-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    title="Delete logo and return to text title"
                  >
                    <Trash2 size={13} />
                    <span>Delete Logo (Use Text Name)</span>
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10 flex items-center gap-2 text-gray-400 text-[11px]">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  <span>No logo set. Movie displays standard text title in home page banners.</span>
                </div>
              )}

              {/* Fetched Logos Picker from TMDB */}
              {Array.isArray(availableLogos) && availableLogos.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <span>Available TMDB Logos ({availableLogos.length})</span>
                    <span className="text-gray-500 font-normal">Click logo to select</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-1.5 rounded-xl bg-black/40 border border-white/5">
                    {availableLogos.map((logo, idx) => {
                      const isSelected = logoUrl === logo.url;
                      return (
                        <div
                          key={`tmdb-logo-${idx}`}
                          onClick={() => setLogoUrl(logo.url)}
                          className={`relative h-16 rounded-xl border p-2 flex items-center justify-center cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500 shadow-md ring-1 ring-amber-500/50'
                              : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'
                          }`}
                        >
                          <img
                            src={logo.url}
                            alt={`TMDB Logo ${idx + 1}`}
                            className="max-h-12 w-auto max-w-full object-contain pointer-events-none"
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 p-0.5 rounded-full bg-amber-500 text-black shadow">
                              <Check size={10} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Genres */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                Genres
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar p-1">
                {GENRES_LIST.map((g) => {
                  const isSel = genres.some((item) => item.toLowerCase() === g.toLowerCase());
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        if (isSel) {
                          setGenres(genres.filter((item) => item.toLowerCase() !== g.toLowerCase()));
                        } else {
                          setGenres([...genres, g]);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                        isSel
                          ? 'bg-amber-600 border-amber-500 text-black'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-gray-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 disabled:opacity-40 text-black text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
