"use client";

import React, { useState, useEffect } from 'react';
import {
  Tv, X, Search, Loader2, Sparkles, CheckCircle2,
  HardDrive, ImagePlus, Star, Clock, AlertTriangle, ExternalLink,
  Users, Video, Layers, Check, Image as ImageIcon, Youtube,
  FolderTree, RefreshCw, FolderPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { NAMING_PATTERNS, processScannedFiles, sortEpisodes, getSubfolder } from '../utils/parser';

const GENRES_LIST = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Sci-Fi & Fantasy", "Science Fiction", "Soap", "Talk", "Thriller", "War & Politics", "Western"
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

function extractSeasonNumber(filePath = '', fileName = '') {
  const combined = `${filePath} ${fileName}`;
  const sMatch = combined.match(/[Ss](\d{1,2})[Ee]\d+/);
  if (sMatch) return parseInt(sMatch[1], 10);
  const seasonFolderMatch = combined.match(/(?:Season|Series|S)\s*[-._]?\s*(\d{1,2})/i);
  if (seasonFolderMatch) return parseInt(seasonFolderMatch[1], 10);
  return 1;
}

export default function AddWebseriesModal({
  isOpen,
  onClose,
  onAddWebseries,
  existingWebseries = [],
}) {
  // TMDB Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [selectedTmdbSeries, setSelectedTmdbSeries] = useState(null);

  // Folder & Pattern State
  const [folderPath, setFolderPath] = useState('');
  const [namingPattern, setNamingPattern] = useState('auto');
  const [scanning, setScanning] = useState(false);
  const [scannedFiles, setScannedFiles] = useState([]);
  const [scanMessage, setScanMessage] = useState('');

  // Series Form Fields
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [year, setYear] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [rating, setRating] = useState('');
  const [voteCount, setVoteCount] = useState(0);
  const [overview, setOverview] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [productionCountries, setProductionCountries] = useState([]);
  const [genres, setGenres] = useState([]);

  // Logo & Artwork
  const [logoUrl, setLogoUrl] = useState('');
  const [cast, setCast] = useState([]);
  const [crew, setCrew] = useState([]);
  const [images, setImages] = useState({ posters: [], backdrops: [], logos: [] });
  const [videos, setVideos] = useState([]);
  const [seasons, setSeasons] = useState([]);

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // Reset fields on modal open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearching(false);
      setHasSearched(false);
      setSearchError('');
      setSelectedTmdbSeries(null);
      setFolderPath('');
      setNamingPattern('auto');
      setScanning(false);
      setScannedFiles([]);
      setScanMessage('');
      setTitle('');
      setOriginalTitle('');
      setYear('');
      setReleaseDate('');
      setRating('');
      setVoteCount(0);
      setOverview('');
      setPosterUrl('');
      setBackdropUrl('');
      setLogoUrl('');
      setLanguage('en');
      setProductionCountries([]);
      setGenres([]);
      setCast([]);
      setCrew([]);
      setImages({ posters: [], backdrops: [], logos: [] });
      setVideos([]);
      setSeasons([]);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── 1. Search TMDB Web-Series ───────────────────────────────────────────────
  const handleSearchTMDB = async (e) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setSearchError('');
    setHasSearched(true);

    try {
      const res = await fetch(`/api/watchlist/search?type=web-series&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setSearchResults(data.results);
        if (data.results.length === 0) {
          setSearchError(`No web-series found matching "${q}".`);
        }
      } else {
        setSearchError(data.error || 'Failed to search web-series from TMDB.');
      }
    } catch (err) {
      console.error('[AddWebseriesModal] Search error:', err);
      setSearchError('Network error while searching TMDB.');
    } finally {
      setSearching(false);
    }
  };

  // ── 2. Select Series & Auto-Fetch Complete Details ──────────────────────────
  const handleSelectSeries = async (item) => {
    setSelectedTmdbSeries(item);
    setFetchingDetails(true);
    setSearchError('');

    try {
      const res = await fetch(`/api/watchlist/details?type=web-series&id=${encodeURIComponent(item.tmdbId || item.id)}`);
      const data = await res.json();

      if (data.success && data.details) {
        const d = data.details;
        setTitle(d.title || item.title || '');
        setOriginalTitle(d.originalTitle || item.originalTitle || '');
        setOverview(d.overview || item.overview || '');
        setYear(d.year || item.year || '');
        setReleaseDate(d.releaseDate || item.releaseDate || '');
        setRating(d.rating ? String(d.rating) : (item.rating ? String(item.rating) : ''));
        setVoteCount(d.voteCount || item.voteCount || 0);
        setPosterUrl(d.posterUrl || item.posterUrl || '');
        setBackdropUrl(d.backdropUrl || item.backdropUrl || '');
        setLanguage(d.language || item.language || 'en');
        setProductionCountries(d.productionCountries || []);
        setCast(Array.isArray(d.cast) ? d.cast : []);
        setCrew(Array.isArray(d.crew) ? d.crew : []);
        setImages(d.images || { posters: [], backdrops: [], logos: [] });
        if (d.images?.logos?.length > 0 && !logoUrl) {
          setLogoUrl(d.images.logos[0].url);
        } else if (d.logoUrl) {
          setLogoUrl(d.logoUrl);
        }
        setVideos(Array.isArray(d.videos) ? d.videos : []);
        setGenres(Array.isArray(d.genres) ? d.genres : []);
        setSeasons(Array.isArray(d.seasons) ? d.seasons : []);
      } else {
        // Fallback
        setTitle(item.title || '');
        setOriginalTitle(item.originalTitle || '');
        setOverview(item.overview || '');
        setYear(item.year || '');
        setReleaseDate(item.releaseDate || '');
        setRating(item.rating ? String(item.rating) : '');
        setPosterUrl(item.posterUrl || '');
        setBackdropUrl(item.backdropUrl || '');
      }
    } catch (err) {
      console.error('[AddWebseriesModal] Fetch details error:', err);
      setTitle(item.title || '');
      setOverview(item.overview || '');
      setYear(item.year || '');
      setPosterUrl(item.posterUrl || '');
    } finally {
      setFetchingDetails(false);
    }
  };

  // ── 3. Browse Folder from PC ────────────────────────────────────────────────
  const handleBrowseFolder = async () => {
    setScanning(true);
    setScanMessage('');
    try {
      const res = await fetch('/api/select-folder');
      const data = await res.json();

      if (data.success && data.path) {
        setFolderPath(data.path);
        if (!title.trim()) {
          const folderName = data.path.split(/[\\/]/).pop();
          setTitle(folderName || '');
        }
        await performScan(data.path, namingPattern);
      }
    } catch (err) {
      console.error('Folder selection error:', err);
      setScanMessage('Failed to select folder. You can paste the directory path manually.');
    } finally {
      setScanning(false);
    }
  };

  // ── 4. Scan Folder ──────────────────────────────────────────────────────────
  const performScan = async (targetPath, pattern) => {
    const p = (targetPath || folderPath).trim();
    if (!p) return;
    setScanning(true);
    setScanMessage('');

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: p })
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.episodes)) {
        setScannedFiles(data.episodes);
        setScanMessage(`Discovered ${data.episodes.length} video episode files.`);
      } else {
        setScanMessage(data.error || 'No video files discovered in folder.');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanMessage('Error scanning directory.');
    } finally {
      setScanning(false);
    }
  };

  // ── 5. Build Final Episodes List ────────────────────────────────────────────
  const buildFinalEpisodes = (seriesId) => {
    const processed = processScannedFiles(scannedFiles, folderPath, namingPattern);
    const sorted = sortEpisodes(processed);

    return sorted.map((ep, idx) => {
      const sNum = extractSeasonNumber(ep.filePath, ep.fileName);
      const epNum = ep.episodeNumber || (idx + 1);

      // Find matching TMDB episode details if available
      let matchedTmdbEp = null;
      if (Array.isArray(seasons)) {
        const targetSeason = seasons.find(s => s.seasonNumber === sNum) || seasons[0];
        if (targetSeason?.episodes) {
          matchedTmdbEp = targetSeason.episodes.find(e => e.episodeNumber === epNum);
        }
      }

      return {
        id: ep.docId || `ep_${idx + 1}_${Date.now()}`,
        episodeNumber: epNum,
        seasonNumber: sNum,
        title: matchedTmdbEp?.name || ep.fileName?.replace(/\.[^/.]+$/, '') || `Episode ${epNum}`,
        name: matchedTmdbEp?.name || ep.fileName?.replace(/\.[^/.]+$/, '') || `Episode ${epNum}`,
        fileName: ep.fileName,
        filePath: ep.filePath,
        folderPath: folderPath,
        overview: matchedTmdbEp?.overview || '',
        airDate: matchedTmdbEp?.airDate || '',
        runtime: matchedTmdbEp?.runtime || 0,
        voteAverage: matchedTmdbEp?.voteAverage || 0,
        stillUrl: matchedTmdbEp?.stillUrl || backdropUrl || posterUrl || '',
        durationSeconds: matchedTmdbEp?.runtime ? matchedTmdbEp.runtime * 60 : 0,
        lastPositionSeconds: 0,
        watchedSeconds: 0,
        isWatched: false,
        isOffPattern: !!ep.isOffPattern,
        createdAt: new Date().toISOString(),
      };
    });
  };

  // ── 6. Submit Webseries ────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a series title.');
      return;
    }

    setSubmitting(true);

    try {
      const generatedId = slugify(title) || `webseries-${Date.now()}`;
      const baseId = existingWebseries.some(s => s.id === generatedId)
        ? `${generatedId}-${Date.now().toString().slice(-4)}`
        : generatedId;

      const finalEpisodes = buildFinalEpisodes(baseId);

      const seriesDoc = {
        id: baseId,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        contentType: 'web-series',
        type: 'webseries',
        isWebseries: true,
        tmdbId: selectedTmdbSeries?.tmdbId || selectedTmdbSeries?.id || null,
        year: year ? String(year) : '',
        releaseDate: releaseDate || '',
        rating: rating ? parseFloat(rating) : 0,
        voteCount: voteCount || 0,
        overview: overview.trim(),
        posterUrl: posterUrl.trim(),
        backdropUrl: backdropUrl.trim(),
        logoUrl: logoUrl.trim(),
        language: language || 'en',
        genres: genres.length > 0 ? genres : ['Drama'],
        productionCountries: productionCountries || [],
        cast: cast.slice(0, 30),
        crew: crew.slice(0, 15),
        images,
        videos,
        seasons,
        folderPath: folderPath.trim(),
        namingPattern: namingPattern || 'auto',
        episodeCount: finalEpisodes.length,
        progressPercent: 0,
        watchStatus: 'Plan to Watch',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onAddWebseries(seriesDoc, finalEpisodes);
      onClose();
    } catch (err) {
      console.error('[AddWebseriesModal] Save error:', err);
      alert('Failed to save webseries: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Tv size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                Add New Web-series
              </h2>
              <p className="text-[11px] text-gray-400">
                Fetch show details from TMDB and scan your local episodes folder
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

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1 custom-scrollbar">
          {/* ── SECTION 1: TMDB Search ── */}
          <div className="space-y-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <label className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Sparkles size={14} /> 1. Search TMDB for Series Details
            </label>
            <form onSubmit={handleSearchTMDB} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Enter webseries name (e.g. Breaking Bad, Stranger Things, Mirzapur)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 transition"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                <span>Search</span>
              </button>
            </form>

            {/* Search Results Drawer */}
            {hasSearched && (
              <div className="pt-2">
                {searching ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-gray-400 text-xs">
                    <Loader2 size={16} className="animate-spin text-amber-400" />
                    <span>Searching TMDB...</span>
                  </div>
                ) : searchError ? (
                  <p className="text-xs text-rose-400 py-2">{searchError}</p>
                ) : searchResults.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-56 overflow-y-auto p-1 custom-scrollbar">
                    {searchResults.map((item) => {
                      const isSelected = selectedTmdbSeries?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectSeries(item)}
                          className={`relative rounded-xl overflow-hidden border cursor-pointer transition p-1.5 flex flex-col text-left group ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 shadow-lg ring-1 ring-amber-400'
                              : 'bg-black/30 border-white/10 hover:border-amber-400/50 hover:bg-white/5'
                          }`}
                        >
                          <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-black/60 relative mb-1.5">
                            {item.posterUrl ? (
                              <img
                                src={item.posterUrl}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-600">
                                <Tv size={24} />
                              </div>
                            )}
                            {item.rating > 0 && (
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                                ★ {item.rating}
                              </div>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-amber-300">
                            {item.title}
                          </h4>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {item.year || 'Series'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {fetchingDetails && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                <span>Fetching season lists, artwork, trailers & episodes from TMDB...</span>
              </div>
            )}
          </div>

          {/* ── SECTION 2: Folder Location & Naming Pattern ── */}
          <div className="space-y-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <label className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <FolderTree size={14} /> 2. Local Media Folder & Naming Pattern
            </label>

            <div className="space-y-2">
              <label className="text-[11px] text-gray-400 block font-semibold">
                Episodes Folder Path:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. C:\Media\Webseries\Stranger Things"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={scanning}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <FolderPlus size={15} />
                  <span>Browse Folder</span>
                </button>
                {folderPath && (
                  <button
                    type="button"
                    onClick={() => performScan(folderPath, namingPattern)}
                    disabled={scanning}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
                    <span>Scan</span>
                  </button>
                )}
              </div>
            </div>

            {/* Naming Pattern Buttons (Matching anime modal) */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400 block font-semibold">
                Episode Naming Pattern:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {NAMING_PATTERNS.map((pat) => (
                  <button
                    key={pat.id}
                    type="button"
                    onClick={() => {
                      setNamingPattern(pat.id);
                      if (folderPath && scannedFiles.length > 0) {
                        performScan(folderPath, pat.id);
                      }
                    }}
                    className={`px-3 py-2 rounded-xl text-left border transition cursor-pointer ${
                      namingPattern === pat.id
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow'
                        : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span className="font-bold text-xs block">{pat.label}</span>
                    <span className="text-[10px] opacity-60 block truncate">{pat.example}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Status Feedback */}
            {scanMessage && (
              <div className={`p-3 rounded-xl text-xs flex items-center justify-between ${
                scannedFiles.length > 0
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 size={16} />
                  <span>{scanMessage}</span>
                </div>
                {scannedFiles.length > 0 && (
                  <span className="text-[10px] font-mono opacity-80">
                    Ready to track
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 3: Series Details & Metadata ── */}
          <form id="add-webseries-form" onSubmit={handleSubmit} className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Layers size={14} /> 3. Series Metadata & Artwork
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Series Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Series Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Original Title
                </label>
                <input
                  type="text"
                  placeholder="Original Title (Optional)"
                  value={originalTitle}
                  onChange={(e) => setOriginalTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Release Year & Air Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Year (e.g. 2024)"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-1/3 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                  />
                  <input
                    type="text"
                    placeholder="Release Date (YYYY-MM-DD)"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
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
                  placeholder="8.5"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>

            {/* Overview */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                Overview & Storyline
              </label>
              <textarea
                rows={3}
                placeholder="Series storyline synopsis..."
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400 resize-none"
              />
            </div>

            {/* Genres Selector */}
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

            {/* Artwork Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Poster URL
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Backdrop URL
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={backdropUrl}
                  onChange={(e) => setBackdropUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Logo Art URL
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>

            {/* Logo Picker if multiple logos found */}
            {images.logos && images.logos.length > 1 && (
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] text-gray-400 block font-semibold">
                  Select Logo Artwork:
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {images.logos.slice(0, 8).map((logo, idx) => {
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
          </form>
        </div>

        {/* Footer Actions */}
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
            form="add-webseries-form"
            disabled={submitting || !title.trim()}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Saving Series...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Add Web-series</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
