"use client";

import React, { useState, useEffect } from 'react';
import {
  Film, X, Search, Loader2, Sparkles, CheckCircle2,
  HardDrive, ImagePlus, Star, Clock, AlertTriangle, ExternalLink,
  Users, Video, Layers, Check, Image as ImageIcon, Youtube
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GENRES_LIST = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Science Fiction", "Thriller", "TV Movie", "War", "Western"
];

const GRADIENTS = [
  "from-amber-500 to-rose-600",
  "from-violet-600 to-indigo-700",
  "from-purple-600 to-pink-600",
  "from-emerald-500 to-teal-700",
  "from-cyan-600 to-blue-700",
];

export const extractYoutubeId = (urlOrId) => {
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

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

export default function AddMovieModal({
  isOpen,
  onClose,
  onAddMovie,
  existingMovies = [],
}) {
  // TMDB Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [selectedTmdbMovie, setSelectedTmdbMovie] = useState(null);

  // YouTube Link State
  const [isYouTube, setIsYouTube] = useState(false);

  // Local File State
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [verifyingFile, setVerifyingFile] = useState(false);
  const [fileVerified, setFileVerified] = useState(null);
  const [fileWarning, setFileWarning] = useState('');

  // Movie Form Fields
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [year, setYear] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [runtime, setRuntime] = useState('');
  const [rating, setRating] = useState('');
  const [voteCount, setVoteCount] = useState(0);
  const [overview, setOverview] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [productionCountries, setProductionCountries] = useState([]);
  const [genres, setGenres] = useState([]);

  // Custom Movie Logo
  const [enableCustomLogo, setEnableCustomLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  // TMDB Extended Extras (Credits, Images, Videos) via append_to_response
  const [cast, setCast] = useState([]);
  const [crew, setCrew] = useState([]);
  const [images, setImages] = useState({ posters: [], backdrops: [], logos: [] });
  const [videos, setVideos] = useState([]);

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearching(false);
      setHasSearched(false);
      setSearchError('');
      setFetchingDetails(false);
      setSelectedTmdbMovie(null);
      setIsYouTube(false);
      setFilePath('');
      setFileName('');
      setFileVerified(null);
      setFileWarning('');
      setTitle('');
      setOriginalTitle('');
      setYear('');
      setReleaseDate('');
      setRuntime('');
      setRating('');
      setVoteCount(0);
      setOverview('');
      setPosterUrl('');
      setBackdropUrl('');
      setEnableCustomLogo(false);
      setLogoUrl('');
      setLanguage('en');
      setProductionCountries([]);
      setGenres([]);
      setCast([]);
      setCrew([]);
      setImages({ posters: [], backdrops: [], logos: [] });
      setVideos([]);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── 1. Search TMDB Movies ──────────────────────────────────────────────────
  const handleSearchTMDB = async (e) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setSearchError('');
    setHasSearched(true);

    try {
      const res = await fetch(`/api/movies/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setSearchResults(data.results);
        if (data.results.length === 0) {
          setSearchError(`No movies found matching "${q}".`);
        }
      } else {
        setSearchError(data.error || 'Failed to search movies from TMDB.');
      }
    } catch (err) {
      console.error('[AddMovieModal] Search error:', err);
      setSearchError('Network error while searching TMDB.');
    } finally {
      setSearching(false);
    }
  };

  // ── 2. Select Movie & Auto-Fetch Complete Details ───────────────────────────
  const handleSelectMovie = async (item) => {
    setSelectedTmdbMovie(item);
    setFetchingDetails(true);
    setSearchError('');

    try {
      const res = await fetch(`/api/movies/details?id=${encodeURIComponent(item.id)}`);
      const data = await res.json();

      if (data.success && data.movie) {
        const m = data.movie;
        setTitle(m.title || item.title || '');
        setOriginalTitle(m.originalTitle || item.originalTitle || '');
        setOverview(m.overview || item.overview || '');
        setYear(m.year || item.year || '');
        setReleaseDate(m.releaseDate || item.releaseDate || '');
        setRuntime(m.runtime ? String(m.runtime) : '');
        setRating(m.rating ? String(m.rating) : (item.rating ? String(item.rating) : ''));
        setVoteCount(m.voteCount || item.voteCount || 0);
        setPosterUrl(m.posterUrl || item.posterUrl || '');
        setBackdropUrl(m.backdropUrl || item.backdropUrl || '');
        setLanguage(m.language || item.language || 'en');
        setProductionCountries(m.productionCountries || []);
        setCast(Array.isArray(m.cast) ? m.cast : []);
        setCrew(Array.isArray(m.crew) ? m.crew : []);
        setImages(m.images || { posters: [], backdrops: [], logos: [] });
        if (m.images?.logos?.length > 0 && !logoUrl) {
          setLogoUrl(m.images.logos[0].url);
        }
        setVideos(Array.isArray(m.videos) ? m.videos : []);

        if (Array.isArray(m.genres) && m.genres.length > 0) {
          setGenres(m.genres);
        }
      } else {
        // Fallback to basic search result data
        setTitle(item.title || '');
        setOriginalTitle(item.originalTitle || '');
        setOverview(item.overview || '');
        setYear(item.year || '');
        setReleaseDate(item.releaseDate || '');
        setRating(item.rating ? String(item.rating) : '');
        setPosterUrl(item.posterUrl || '');
        setBackdropUrl(item.backdropUrl || '');
        setCast([]);
        setCrew([]);
        setImages({ posters: [], backdrops: [], logos: [] });
        setVideos([]);
      }
    } catch (err) {
      console.error('[AddMovieModal] Fetch details error:', err);
      // Fallback to search result data
      setTitle(item.title || '');
      setOverview(item.overview || '');
      setYear(item.year || '');
      setPosterUrl(item.posterUrl || '');
    } finally {
      setFetchingDetails(false);
    }
  };

  // ── 3. Browse PC for Video File ─────────────────────────────────────────────
  const handleBrowseFile = async () => {
    setVerifyingFile(true);
    setFileWarning('');

    try {
      const res = await fetch('/api/movies/select-file');
      const data = await res.json();

      if (data.success && data.path) {
        setFilePath(data.path);
        setFileName(data.fileName || data.path.split(/[\\/]/).pop());
        setFileVerified(true);

        // If title is not set yet, guess from filename
        if (!title.trim() && data.fileName) {
          const guessedTitle = data.fileName
            .replace(/\.(mp4|mkv|webm|mov|avi|m4v)$/i, '')
            .replace(/[._]/g, ' ')
            .replace(/\b(1080p|720p|2160p|4k|bluray|web-dl|x264|x265|aac)\b/gi, '')
            .trim();
          setTitle(guessedTitle);
          setSearchQuery(guessedTitle);
        }
      }
    } catch (err) {
      console.error('[AddMovieModal] Browse file error:', err);
    } finally {
      setVerifyingFile(false);
    }
  };

  const handleManualPathChange = async (val) => {
    setFilePath(val);
    if (!val.trim()) {
      setFileVerified(null);
      setFileWarning('');
      return;
    }

    try {
      const res = await fetch('/api/movies/verify-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: val.trim() }),
      });
      const data = await res.json();
      setFileVerified(data.exists);
      if (data.exists) {
        setFileName(data.fileName);
        setFileWarning('');
      } else {
        setFileWarning('This movie file is no longer available locally.');
      }
    } catch {
      setFileVerified(null);
    }
  };

  // Local File Upload / Selector Fallback
  const handleHtmlFileInput = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // In desktop or Electron, file.path may be available
    const nativePath = file.path || file.name;
    setFilePath(nativePath);
    setFileName(file.name);
    setFileVerified(true);
    setFileWarning('');

    if (!title.trim()) {
      const guessed = file.name
        .replace(/\.(mp4|mkv|webm|mov|avi|m4v)$/i, '')
        .replace(/[._]/g, ' ')
        .trim();
      setTitle(guessed);
      setSearchQuery(guessed);
    }
  };

  // Custom Cover Upload
  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setPosterUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Custom Backdrop Upload
  const handleBackdropUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setBackdropUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Custom Logo Upload
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setLogoUrl(uploadEvent.target.result);
      setEnableCustomLogo(true);
    };
    reader.readAsDataURL(file);
  };

  // ── 4. Submit Add Movie ─────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPath = filePath.trim();
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      alert('Please enter a movie title or select one from TMDB search.');
      return;
    }

    if (!cleanPath) {
      alert(isYouTube ? 'Please enter the YouTube video link or video ID.' : 'Please select or specify the local movie video file path.');
      return;
    }

    setSubmitting(true);

    try {
      let movieId = slugify(cleanTitle);
      if (!movieId) {
        movieId = `movie_${Date.now()}`;
      } else {
        const isDuplicate = existingMovies.some((m) => m.id === movieId);
        if (isDuplicate) {
          movieId = `${movieId}-${Math.floor(Math.random() * 1000)}`;
        }
      }

      const randomGradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
      const runtimeMinutes = runtime ? parseInt(runtime, 10) : 0;
      const parsedRating = rating ? parseFloat(rating) : null;
      const ytId = isYouTube ? extractYoutubeId(cleanPath) : '';

      const movieData = {
        id: movieId,
        tmdbId: selectedTmdbMovie?.id || selectedTmdbMovie?.tmdbId || null,
        title: cleanTitle,
        originalTitle: originalTitle.trim() || cleanTitle,
        overview: overview.trim(),
        releaseDate: releaseDate || '',
        year: year || (releaseDate ? releaseDate.split('-')[0] : new Date().getFullYear().toString()),
        runtime: runtimeMinutes,
        duration: runtimeMinutes * 60,
        genres,
        rating: parsedRating,
        voteCount: voteCount || 0,
        posterPath: selectedTmdbMovie?.posterPath || '',
        posterUrl: posterUrl || '',
        backdropPath: selectedTmdbMovie?.backdropPath || '',
        backdropUrl: backdropUrl || '',
        logoUrl: enableCustomLogo && logoUrl ? logoUrl.trim() : '',
        language: language || 'en',
        productionCountries: productionCountries || [],
        cast: Array.isArray(cast) ? cast : [],
        crew: Array.isArray(crew) ? crew : [],
        images: images || { posters: [], backdrops: [], logos: [] },
        videos: Array.isArray(videos) ? videos : [],
        isYouTube: Boolean(isYouTube),
        youtubeUrl: isYouTube ? cleanPath : '',
        youtubeId: isYouTube ? (ytId || cleanPath) : '',
        localFileName: isYouTube ? `YouTube: ${cleanTitle}` : (fileName || cleanPath.split(/[\\/]/).pop() || cleanTitle),
        localFilePath: cleanPath,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        watchStatus: 'Not Started',
        watched: false,
        completed: false,
        watchProgress: 0,
        progressPercentage: 0,
        currentTime: 0,
        lastWatchedAt: null,
        coverGradient: randomGradient,
        type: 'movie',
      };

      await onAddMovie(movieData);
      onClose();
    } catch (err) {
      console.error('[AddMovieModal] Submit error:', err);
      alert('Error adding movie: ' + err.message);
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
              <span>Track Local Movie</span>
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
            {/* ── 1. TMDB Movie Search ─────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                  1. Search Movie (TMDB)
                </label>
                <span className="text-[10px] text-amber-400 font-mono">
                  Online Metadata
                </span>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    placeholder="Search movie title (e.g. Inception, Spirited Away, Avatar)..."
                    className="w-full px-3 py-2 pl-8 rounded-xl glass-input text-xs text-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchTMDB();
                      }
                    }}
                  />
                  <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                </div>
                <button
                  type="button"
                  onClick={handleSearchTMDB}
                  disabled={searching || !searchQuery.trim()}
                  className="px-3.5 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {searching ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      <span>Search TMDB</span>
                    </>
                  )}
                </button>
              </div>

              {/* Searching status text */}
              {searching && (
                <p className="text-[11px] text-amber-400 font-medium mt-1 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Searching movies...</span>
                </p>
              )}

              {/* Fetching Details status text */}
              {fetchingDetails && (
                <p className="text-[11px] text-amber-400 font-medium mt-1 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Fetching movie details...</span>
                </p>
              )}

              {/* Search Error / Empty Results */}
              {searchError && (
                <p className="text-[11px] text-amber-300 font-medium mt-1">
                  {searchError}
                </p>
              )}

              {/* Compact Selectable Results List */}
              {searchResults.length > 0 && (
                <div className="mt-2 p-2 rounded-2xl bg-white/[0.02] border border-white/10 max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-0.5">
                    Select a match to auto-populate metadata:
                  </div>
                  {searchResults.map((item) => {
                    const isSelected = selectedTmdbMovie?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectMovie(item)}
                        className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${
                          isSelected
                            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200'
                            : 'hover:bg-white/5 border border-transparent text-gray-300 hover:text-white'
                        }`}
                      >
                        <div className="w-9 h-12 rounded-lg bg-black/60 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                          {item.posterUrl ? (
                            <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Film size={14} className="text-gray-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold truncate text-white">
                              {item.title}
                            </h4>
                            {item.rating && (
                              <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5 shrink-0">
                                <Star size={10} className="fill-amber-400" /> {item.rating}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 flex items-center gap-2 mt-0.5">
                            {item.year && <span>{item.year}</span>}
                            {item.originalTitle && item.originalTitle !== item.title && (
                              <span className="italic truncate max-w-[140px]">
                                {item.originalTitle}
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Movie Banner Preview */}
              {selectedTmdbMovie && !fetchingDetails && (
                <div className="mt-2 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 size={15} className="text-emerald-400" />
                    <span className="truncate max-w-xs">
                      Selected: {title} {year ? `(${year})` : ''}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">
                    TMDB ID: #{selectedTmdbMovie.id}
                  </span>
                </div>
              )}
            </div>

            {/* ── 2. Movie Video Source (Local File or YouTube Link) ──────── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1.5">
                  {isYouTube ? (
                    <>
                      <Youtube size={14} className="text-red-500" />
                      <span className="text-red-300">2. Enter Video Link *</span>
                    </>
                  ) : (
                    <span>2. Select Local Movie Video File *</span>
                  )}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white transition select-none bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-xl border border-white/10">
                  <input
                    type="checkbox"
                    checked={isYouTube}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsYouTube(checked);
                      if (checked) {
                        setFileVerified(null);
                        setFileWarning('');
                      }
                    }}
                    className="rounded bg-black/40 border-white/20 text-red-500 focus:ring-red-500 w-3.5 h-3.5 cursor-pointer accent-red-500"
                  />
                  <Youtube size={13} className="text-red-500" />
                  <span>YouTube Link</span>
                </label>
              </div>

              {isYouTube ? (
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter video link (e.g. https://www.youtube.com/watch?v=... or youtu.be/... or Video ID)"
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white focus:border-red-500/60"
                      value={filePath}
                      onChange={(e) => {
                        setFilePath(e.target.value);
                        setFileWarning('');
                      }}
                    />
                  </div>

                  {/* YouTube link preview / verification badge */}
                  {filePath.trim() && (
                    <div className="mt-1.5 p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold">
                        <Youtube size={14} className="text-red-400" />
                        <span className="truncate max-w-sm">
                          {extractYoutubeId(filePath)
                            ? `YouTube Video ID: ${extractYoutubeId(filePath)}`
                            : 'YouTube Video Link ready'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">Embed Player Ready</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Browse your PC or paste local video file path (MP4, MKV, WEBM, MOV, AVI)..."
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={filePath}
                      onChange={(e) => handleManualPathChange(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseFile}
                      disabled={verifyingFile}
                      className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      {verifyingFile ? 'Locating...' : 'Browse PC File'}
                    </button>
                    <label className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1">
                      <span>File</span>
                      <input
                        type="file"
                        accept="video/mp4,video/x-matroska,video/webm,video/quicktime,video/x-msvideo,.mp4,.mkv,.webm,.mov,.avi,.m4v"
                        className="hidden"
                        onChange={handleHtmlFileInput}
                      />
                    </label>
                  </div>

                  {/* Local File Verification Badge */}
                  {filePath && fileVerified === true && (
                    <div className="mt-1.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold">
                        <CheckCircle2 size={14} className="text-emerald-400" />
                        <span className="truncate max-w-sm">
                          Found local video file: {fileName || filePath.split(/[\\/]/).pop()}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">Ready to track</span>
                    </div>
                  )}

                  {/* Invalid local file state */}
                  {fileWarning && (
                    <div className="mt-1.5 p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                      <AlertTriangle size={14} className="text-red-400 shrink-0" />
                      <span>{fileWarning}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── 3. Movie Title & Original Title ─────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Movie Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Inception, Spirited Away..."
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Original Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 千と千尋の神隠し"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={originalTitle}
                  onChange={(e) => setOriginalTitle(e.target.value)}
                />
              </div>
            </div>

            {/* ── 4. Year & Runtime ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Release Year
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2010"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Runtime (Minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 148"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value)}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Rating (0 - 10)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 8.8"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                />
              </div>
            </div>

            {/* ── 5. Description / Synopsis ────────────────────────────────── */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                Overview / Synopsis
              </label>
              <textarea
                rows={3}
                placeholder="Enter movie synopsis or auto-fetch from TMDB above..."
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
              />
            </div>

            {/* ── 6. Poster & Backdrop Artwork Inputs ──────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
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
                  placeholder="Paste poster image URL or upload..."
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                />
                {posterUrl && (
                  <div className="relative w-20 h-28 rounded-xl overflow-hidden border border-white/20 shadow-lg mt-1 group">
                    <img
                      src={posterUrl}
                      alt="Poster Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPosterUrl('')}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/75 text-white hover:bg-red-500 transition cursor-pointer"
                      title="Clear poster"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>

              {/* Backdrop Banner Artwork */}
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
                  placeholder="Paste backdrop widescreen image URL..."
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={backdropUrl}
                  onChange={(e) => setBackdropUrl(e.target.value)}
                />
                {backdropUrl && (
                  <div className="relative w-full h-20 rounded-xl overflow-hidden border border-white/20 shadow-lg mt-1 group">
                    <img
                      src={backdropUrl}
                      alt="Backdrop Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setBackdropUrl('')}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/75 text-white hover:bg-red-500 transition cursor-pointer"
                      title="Clear backdrop"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Custom Movie Logo Checkbox & Selector ──────────────────────── */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableCustomLogo}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEnableCustomLogo(checked);
                      if (checked && !logoUrl && images?.logos?.length > 0) {
                        setLogoUrl(images.logos[0].url);
                      }
                    }}
                    className="h-4 w-4 rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ImageIcon size={14} className="text-amber-400" />
                    Custom Movie Logo
                  </span>
                </label>
                {enableCustomLogo && (
                  <label className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer">
                    <ImagePlus size={13} />
                    <span>Upload Local Logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </label>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Displays the movie's official transparent logo in the home page scroll banner instead of simple text title.
              </p>

              {enableCustomLogo && (
                <div className="space-y-3 pt-1">
                  {/* URL or Selected Logo input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Select below, upload, or paste transparent logo URL..."
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                    />
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer text-xs"
                        title="Clear logo"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Current Selected Logo Preview */}
                  {logoUrl && (
                    <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-3">
                      <div className="max-h-14 max-w-[200px] flex items-center justify-center p-1 bg-white/5 rounded-lg border border-white/5">
                        <img
                          src={logoUrl}
                          alt="Selected Logo"
                          className="max-h-12 w-auto max-w-full object-contain"
                        />
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check size={12} /> Active Logo
                      </span>
                    </div>
                  )}

                  {/* Fetched Logos Picker from TMDB */}
                  {Array.isArray(images?.logos) && images.logos.length > 0 ? (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Fetched Movie Logos ({images.logos.length} available from TMDB)
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-44 overflow-y-auto p-1 rounded-xl bg-black/40 border border-white/5">
                        {images.logos.map((logo, idx) => {
                          const isSelected = logoUrl === logo.url;
                          return (
                            <div
                              key={logo.url || idx}
                              onClick={() => setLogoUrl(logo.url)}
                              className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                                  : 'bg-white/[0.04] border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                              }`}
                            >
                              <div className="w-full h-12 flex items-center justify-center overflow-hidden">
                                <img
                                  src={logo.url}
                                  alt="Logo"
                                  className="max-h-10 w-auto max-w-full object-contain"
                                />
                              </div>
                              <span className="text-[9px] font-mono text-gray-400 truncate">
                                {logo.width && logo.height ? `${logo.width}×${logo.height}` : `Logo ${idx + 1}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-500 italic">
                      No online logos found for this movie. You can upload a local PNG logo image above.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── 7. Fetched Extras Info Badge (Cast, Crew, Videos, Images) ─── */}
            {(cast.length > 0 || videos.length > 0 || (images?.posters?.length || 0) > 0 || (images?.backdrops?.length || 0) > 0) && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-400" />
                    Fetched Media & Online Extras (Single Request)
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-extrabold font-mono">
                    append_to_response
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {cast.length > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-white text-[10px] font-bold flex items-center gap-1">
                      <Users size={11} className="text-amber-400" />
                      {cast.length} Cast / Actors
                    </span>
                  )}
                  {crew.length > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-white text-[10px] font-bold flex items-center gap-1">
                      <Film size={11} className="text-amber-400" />
                      {crew.length} Crew Members
                    </span>
                  )}
                  {videos.length > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-white text-[10px] font-bold flex items-center gap-1">
                      <Video size={11} className="text-rose-400" />
                      {videos.length} Videos & Trailers
                    </span>
                  )}
                  {((images?.posters?.length || 0) + (images?.backdrops?.length || 0) + (images?.logos?.length || 0)) > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-white text-[10px] font-bold flex items-center gap-1">
                      <Layers size={11} className="text-cyan-400" />
                      {(images?.posters?.length || 0) + (images?.backdrops?.length || 0) + (images?.logos?.length || 0)} More Images
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── 7. Genres ────────────────────────────────────────────────── */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                Select Genres
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

            {/* ── 8. TMDB Attribution ───────────────────────────────────────── */}
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 text-gray-400 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-[#01b4e4] text-[#0d253f] font-black text-[10px]">
                  TMDB
                </span>
                <span className="text-[10px]">
                  Movie metadata sourced from TMDB API. Not endorsed or certified by TMDB.
                </span>
              </div>
            </div>

            {/* ── 9. Submit / Cancel Buttons ────────────────────────────────── */}
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
                disabled={submitting || !filePath.trim() || !title.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 disabled:opacity-40 text-black text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Adding Movie...</span>
                  </>
                ) : (
                  <span>Track Movie</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
