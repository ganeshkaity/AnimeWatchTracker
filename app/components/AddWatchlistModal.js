"use client";

import React, { useState, useEffect } from 'react';
import {
  Bookmark, X, Search, Loader2, Sparkles, CheckCircle2,
  ImagePlus, Star, Clock, AlertTriangle, ExternalLink,
  Users, Video, Layers, Check, Image as ImageIcon,
  Film, Tv, BookOpen, Headphones, BookMarked, Globe,
  Plus, Trash2, ChevronRight, Play, DollarSign, ShieldAlert,
  CreditCard, Eye, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { upsertLocalWatchlist, getUserId } from '../utils/localStore';
import { toFanartBigPreview, toFanartPreview } from '../lib/fanartUtils';

const CONTENT_TYPES = [
  { id: 'movie', label: 'Movie', icon: Film, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  { id: 'web-series', label: 'Web-Series', icon: Tv, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  { id: 'anime', label: 'Anime', icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  { id: 'manga', label: 'Manga', icon: BookOpen, color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/30' },
  { id: 'audio-stories', label: 'Audio-Stories', icon: Headphones, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  { id: 'manhwa', label: 'Manhwa', icon: BookMarked, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  { id: 'webtoon', label: 'Webtoon', icon: Layers, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
];

const POPULAR_STREAM_PROVIDERS = [
  { name: 'Netflix', defaultPlan: 'needPlan', color: 'bg-red-600' },
  { name: 'Amazon Prime', defaultPlan: 'needPlan', color: 'bg-blue-600' },
  { name: 'Crunchyroll', defaultPlan: 'needPlan', color: 'bg-orange-500' },
  { name: 'Disney+ Hotstar', defaultPlan: 'needPlan', color: 'bg-blue-800' },
  { name: 'Apple TV+', defaultPlan: 'needPlan', color: 'bg-gray-800' },
  { name: 'YouTube', defaultPlan: 'free', color: 'bg-red-500' },
  { name: 'Google Play', defaultPlan: 'rent', color: 'bg-emerald-600' },
];

const ALL_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Science Fiction", "Thriller", "War", "Supernatural", "Slice of Life"
];

export default function AddWatchlistModal({
  isOpen,
  onClose,
  onAddWatchlist,
}) {
  const { currentUser } = useAuth();
  const [contentType, setContentType] = useState('movie');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [year, setYear] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [rating, setRating] = useState('');
  const [overview, setOverview] = useState('');
  const [genres, setGenres] = useState([]);
  const [posterUrl, setPosterUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [enableLogo, setEnableLogo] = useState(false);

  // Cast, Images, Videos
  const [cast, setCast] = useState([]);
  const [images, setImages] = useState({ posters: [], backdrops: [], logos: [], artworks: [] });
  const [videos, setVideos] = useState([]);
  const [customVideoUrl, setCustomVideoUrl] = useState('');

  // Where to Stream (Categorized)
  const [streamProviders, setStreamProviders] = useState({
    needPlan: [], // [{ name, url, logoUrl }]
    rent: [],
    buy: [],
    free: [],
  });

  // Custom Provider inputs
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderPlan, setNewProviderPlan] = useState('needPlan');
  const [newProviderUrl, setNewProviderUrl] = useState('');

  // Seasons & Episodes (for Web-Series)
  const [seasonsCount, setSeasonsCount] = useState(0);
  const [episodesCount, setEpisodesCount] = useState(0);
  const [seasons, setSeasons] = useState([]);
  const [fetchingSeasons, setFetchingSeasons] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearching(false);
      setHasSearched(false);
      setSearchError('');
      setFetchingDetails(false);
      setSelectedItem(null);
      setTitle('');
      setOriginalTitle('');
      setYear('');
      setReleaseDate('');
      setRating('');
      setOverview('');
      setGenres([]);
      setPosterUrl('');
      setBackdropUrl('');
      setLogoUrl('');
      setEnableLogo(false);
      setCast([]);
      setImages({ posters: [], backdrops: [], logos: [], artworks: [] });
      setVideos([]);
      setCustomVideoUrl('');
      setStreamProviders({ needPlan: [], rent: [], buy: [], free: [] });
      setNewProviderName('');
      setNewProviderUrl('');
      setSeasonsCount(0);
      setEpisodesCount(0);
      setSeasons([]);
      setFetchingSeasons(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── 1. Search Media ────────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setSearchError('');
    setHasSearched(true);
    setSelectedItem(null);

    try {
      const res = await fetch(`/api/watchlist/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(contentType)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setSearchResults(data.results);
        if (data.results.length === 0) {
          setSearchError(`No ${contentType} found matching "${q}".`);
        }
      } else {
        setSearchError(data.error || 'Failed to search media.');
      }
    } catch (err) {
      console.error('[AddWatchlistModal] Search error:', err);
      setSearchError('Network error while searching media.');
    } finally {
      setSearching(false);
    }
  };

  // ── 2. Select Result & Auto-Fetch Complete Details ─────────────────────────
  const handleSelectMedia = async (item) => {
    setSelectedItem(item);
    setFetchingDetails(true);
    setSearchError('');

    try {
      const params = new URLSearchParams({
        id: item.id || '',
        type: contentType,
        q: item.title || '',
        tmdbId: item.tmdbId ? String(item.tmdbId) : '',
        anilistId: item.anilistId ? String(item.anilistId) : '',
      });

      const res = await fetch(`/api/watchlist/details?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.details) {
        const d = data.details;
        setTitle(d.title || item.title || '');
        setOriginalTitle(d.originalTitle || item.originalTitle || '');
        setYear(d.year || item.year || '');
        setReleaseDate(d.releaseDate || item.releaseDate || '');
        setRating(d.rating ? String(d.rating) : (item.rating ? String(item.rating) : ''));
        setOverview(d.overview || item.overview || '');
        setGenres(Array.isArray(d.genres) ? d.genres : []);
        setPosterUrl(d.posterUrl || item.posterUrl || '');
        setBackdropUrl(d.backdropUrl || item.backdropUrl || '');
        setLogoUrl(d.logoUrl || '');
        setEnableLogo(Boolean(d.logoUrl));
        setCast(Array.isArray(d.cast) ? d.cast : []);
        setImages(d.images || { posters: [], backdrops: [], logos: [], artworks: [] });
        setVideos(Array.isArray(d.videos) ? d.videos : []);
        setSeasonsCount(d.seasonsCount || (Array.isArray(d.seasons) ? d.seasons.length : 0));
        setEpisodesCount(d.episodesCount || 0);
        setSeasons(Array.isArray(d.seasons) ? d.seasons : []);

        // Watch Providers
        if (d.watchProviders) {
          setStreamProviders({
            needPlan: Array.isArray(d.watchProviders.needPlan) ? d.watchProviders.needPlan : [],
            rent: Array.isArray(d.watchProviders.rent) ? d.watchProviders.rent : [],
            buy: Array.isArray(d.watchProviders.buy) ? d.watchProviders.buy : [],
            free: Array.isArray(d.watchProviders.free) ? d.watchProviders.free : [],
          });
        }
      } else {
        // Fallback to basic search item
        setTitle(item.title || '');
        setOriginalTitle(item.originalTitle || '');
        setYear(item.year || '');
        setRating(item.rating ? String(item.rating) : '');
        setOverview(item.overview || '');
        setPosterUrl(item.posterUrl || '');
        setBackdropUrl(item.backdropUrl || '');
      }
    } catch (err) {
      console.error('[AddWatchlistModal] Fetch details error:', err);
      setTitle(item.title || '');
      setPosterUrl(item.posterUrl || '');
    } finally {
      setFetchingDetails(false);
    }
  };

  // Fetch / Refresh Seasons & Episodes
  const handleFetchSeasons = async () => {
    const tmdbId = selectedItem?.tmdbId || '';
    const q = title.trim() || selectedItem?.title || searchQuery.trim();
    if (!tmdbId && !q) {
      alert('Please enter or select a title first.');
      return;
    }

    setFetchingSeasons(true);
    try {
      const params = new URLSearchParams();
      if (tmdbId) params.set('tmdbId', String(tmdbId));
      if (q) params.set('q', q);

      const res = await fetch(`/api/watchlist/seasons?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSeasonsCount(data.seasonsCount || (Array.isArray(data.seasons) ? data.seasons.length : 0));
        setEpisodesCount(data.episodesCount || 0);
        setSeasons(Array.isArray(data.seasons) ? data.seasons : []);
      } else {
        alert(data.error || 'Failed to fetch seasons & episodes.');
      }
    } catch (err) {
      console.error('[AddWatchlistModal] Error fetching seasons:', err);
      alert('Error fetching seasons: ' + err.message);
    } finally {
      setFetchingSeasons(false);
    }
  };

  // Add custom video / trailer
  const handleAddVideo = () => {
    if (!customVideoUrl.trim()) return;
    const url = customVideoUrl.trim();
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    const key = ytMatch ? ytMatch[1] : '';

    setVideos(prev => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: 'Custom Trailer / Video',
        key: key || url,
        site: ytMatch ? 'YouTube' : 'Custom',
        type: 'Trailer',
        url: url,
      }
    ]);
    setCustomVideoUrl('');
  };

  // Add Stream Provider to selected plan category
  const handleAddStreamProvider = () => {
    if (!newProviderName.trim()) return;
    const item = {
      id: `prov-${Date.now()}`,
      name: newProviderName.trim(),
      url: newProviderUrl.trim(),
    };
    setStreamProviders(prev => ({
      ...prev,
      [newProviderPlan]: [...(prev[newProviderPlan] || []), item],
    }));
    setNewProviderName('');
    setNewProviderUrl('');
  };

  // Quick toggle popular provider
  const handleTogglePopularProvider = (prov) => {
    const plan = prov.defaultPlan || 'needPlan';
    const exists = streamProviders[plan]?.some(p => p.name.toLowerCase() === prov.name.toLowerCase());
    if (exists) {
      setStreamProviders(prev => ({
        ...prev,
        [plan]: prev[plan].filter(p => p.name.toLowerCase() !== prov.name.toLowerCase()),
      }));
    } else {
      setStreamProviders(prev => ({
        ...prev,
        [plan]: [...(prev[plan] || []), { id: `pop-${Date.now()}`, name: prov.name, url: '' }],
      }));
    }
  };

  const handleRemoveProvider = (planKey, idx) => {
    setStreamProviders(prev => ({
      ...prev,
      [planKey]: prev[planKey].filter((_, i) => i !== idx),
    }));
  };

  // ── 3. Submit Watchlist Item ──────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a title for this media.');
      return;
    }

    setSubmitting(true);
    try {
      const watchlistItem = {
        id: `wl-${Date.now()}`,
        tmdbId: selectedItem?.tmdbId || null,
        anilistId: selectedItem?.anilistId || null,
        contentType,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        year: year.trim(),
        releaseDate: releaseDate.trim(),
        rating: rating ? Number(rating) : 0,
        overview: overview.trim(),
        genres,
        posterUrl: posterUrl.trim(),
        backdropUrl: backdropUrl.trim(),
        logoUrl: enableLogo ? logoUrl.trim() : '',
        cast,
        images,
        videos,
        seasonsCount: (contentType === 'web-series' || contentType === 'anime') ? (seasonsCount || seasons.length || 0) : 0,
        episodesCount: (contentType === 'web-series' || contentType === 'anime') ? (episodesCount || seasons.reduce((acc, s) => acc + (s.episodes?.length || s.episodeCount || 0), 0)) : 0,
        seasons: (contentType === 'web-series' || contentType === 'anime') ? seasons : [],
        streamProviders,
        status: 'Plan to Watch', // Plan to Watch | Watching | Completed
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onAddWatchlist(watchlistItem);

      // Persist to localStore immediately
      upsertLocalWatchlist(watchlistItem);

      // Persist to Firestore
      if (db) {
        const uid = currentUser?.uid || getUserId();
        if (uid) {
          try {
            await setDoc(doc(db, 'users', uid, 'watchlist', watchlistItem.id), watchlistItem, { merge: true });
          } catch (dbErr) {
            console.error('[AddWatchlistModal] Firestore save error:', dbErr);
          }
        }
      }

      onClose();
    } catch (err) {
      console.error('[AddWatchlistModal] Submit error:', err);
      alert('Failed to save watchlist item: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-4xl bg-[#0b0f19] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Bookmark size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                Add to Watchlist
              </h2>
              <p className="text-xs text-gray-400">
                Track movies, anime, series, manga, audio stories & webtoons
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar">
          
          {/* 1. Content Type Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Step 1: Select Content Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {CONTENT_TYPES.map((t) => {
                const Icon = t.icon;
                const isSelected = contentType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setContentType(t.id);
                      setSearchResults([]);
                      setHasSearched(false);
                      setSelectedItem(null);
                    }}
                    className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl border transition cursor-pointer text-center ${
                      isSelected
                        ? `${t.bg} ring-2 ring-amber-500/50 shadow-lg text-white font-bold`
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.08] text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon size={18} className={isSelected ? t.color : 'text-gray-400'} />
                    <span className="text-[11px] truncate w-full">{t.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5">
              {contentType === 'movie' || contentType === 'web-series'
                ? '⚡ Fetches directly from TMDB'
                : '✨ Fetches comprehensive data from TMDB + AniList + Jikan/Kitsu + Fanart.tv logos'}
            </p>
          </div>

          {/* 2. Media Search Bar */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              Step 2: Search Title to Auto-Fill
            </label>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder={`Search ${contentType} title... (e.g., Inception, Solo Leveling, Bleach)`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 transition"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 disabled:opacity-50 text-black font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-lg"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                <span>{searching ? 'Searching...' : 'Search'}</span>
              </button>
            </form>

            {/* Search Results Grid */}
            {searching && (
              <div className="py-8 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
                <Loader2 size={24} className="text-amber-400 animate-spin" />
                <span>Fetching results from {contentType === 'movie' || contentType === 'web-series' ? 'TMDB' : 'TMDB, AniList & Fanart'}...</span>
              </div>
            )}

            {searchError && !searching && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
                {searchError}
              </p>
            )}

            {searchResults.length > 0 && !searching && (
              <div className="pt-2">
                <span className="text-[11px] text-gray-400 font-semibold block mb-2">
                  Select match below to auto-populate metadata:
                </span>
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar p-1">
                  {searchResults.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectMedia(item)}
                        className={`group flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 shadow-lg ring-1 ring-amber-500/30'
                            : 'bg-[#0e131f] hover:bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {/* Small Poster Thumbnail */}
                        <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-black/50 border border-white/10 relative">
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">
                              <Film size={16} />
                            </div>
                          )}
                        </div>

                        {/* Title, Year, Source & Rating */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors" title={item.title}>
                              {item.title}
                            </h4>
                            {isSelected && (
                              <span className="shrink-0 px-1.5 py-0.2 rounded bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider">
                                Selected
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                            <span className="font-medium text-gray-300">{item.year || 'Unknown Year'}</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.2 rounded bg-white/10 text-gray-300 font-mono text-[9px]">
                              {item.source || 'Online'}
                            </span>
                            {item.rating > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-amber-400 flex items-center gap-0.5 font-bold">
                                  <Star size={10} className="fill-amber-400" />
                                  {item.rating}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Radio Checkmark */}
                        <div className="shrink-0 pr-1">
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-amber-500 border-amber-400 text-black'
                              : 'border-white/20 group-hover:border-amber-400/50 text-transparent'
                          }`}>
                            <Check size={12} strokeWidth={3} className={isSelected ? 'text-black' : 'opacity-0'} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {fetchingDetails && (
            <div className="py-6 text-center text-xs text-amber-400 flex items-center justify-center gap-2 bg-amber-500/5 rounded-2xl border border-amber-500/20">
              <Loader2 size={18} className="animate-spin" />
              <span>Auto-enriching posters, logos, cast, trailer & stream providers...</span>
            </div>
          )}

          {/* 3. Media Information Form */}
          <div className="space-y-4 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                Step 3: Review & Edit Media Metadata
              </label>
            </div>

            {/* Title & Original Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-400 font-semibold mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Inception"
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 font-semibold mb-1">Original / Native Title</label>
                <input
                  type="text"
                  value={originalTitle}
                  onChange={(e) => setOriginalTitle(e.target.value)}
                  placeholder="e.g., インセプション"
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Year & Rating */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-gray-400 font-semibold mb-1">Release Year</label>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="e.g., 2024"
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 font-semibold mb-1">Rating (out of 10)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  placeholder="e.g., 8.8"
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] text-gray-400 font-semibold mb-1">Release Date</label>
                <input
                  type="text"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Overview */}
            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Description / Storyline</label>
              <textarea
                rows={3}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                placeholder="Storyline synopsis or summary..."
                className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 custom-scrollbar"
              />
            </div>

            {/* Web-Series & Anime Seasons & Episodes Section */}
            {(contentType === 'web-series' || contentType === 'anime') && (
              <div className="p-4 rounded-2xl bg-indigo-500/[0.07] border border-indigo-500/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Tv size={16} className="text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Seasons & Episodes Breakdown
                    </span>
                    {seasons.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                        {seasonsCount || seasons.length} Seasons · {episodesCount || 0} Episodes
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleFetchSeasons}
                    disabled={fetchingSeasons}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={fetchingSeasons ? "animate-spin" : ""} />
                    <span>{fetchingSeasons ? "Fetching Details..." : (seasons.length > 0 ? "Refresh Seasons & Episodes" : "Fetch Seasons & Episode Details")}</span>
                  </button>
                </div>

                {seasons.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1 max-h-48 overflow-y-auto custom-scrollbar">
                    {seasons.map((s, idx) => (
                      <div
                        key={s.id || idx}
                        className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between"
                      >
                        <span className="text-xs font-bold text-white truncate">{s.name || `Season ${s.seasonNumber}`}</span>
                        <span className="text-[11px] text-indigo-300 font-medium">
                          {s.episodes?.length || s.episodeCount || 0} episodes
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    Click "Fetch Seasons & Episode Details" to automatically query TMDB for all season numbers and episode breakdowns for this series.
                  </p>
                )}
              </div>
            )}

            {/* Poster & Backdrop Picker / URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Poster */}
              <div className="space-y-2">
                <label className="block text-[11px] text-gray-400 font-semibold">Poster Image URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 font-mono"
                  />
                  {posterUrl && (
                    <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10">
                      <img src={posterUrl} alt="Poster preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                {/* Available Poster Thumbnails */}
                {images.posters?.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {images.posters.slice(0, 10).map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPosterUrl(p.url)}
                        className={`w-9 h-12 rounded-lg overflow-hidden border shrink-0 transition ${
                          posterUrl === p.url ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={p.previewUrl || p.url} alt="Option" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Backdrop */}
              <div className="space-y-2">
                <label className="block text-[11px] text-gray-400 font-semibold">Background Banner URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={backdropUrl}
                    onChange={(e) => setBackdropUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 font-mono"
                  />
                  {backdropUrl && (
                    <div className="w-16 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10">
                      <img src={backdropUrl} alt="Backdrop preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                {/* Available Backdrop Thumbnails */}
                {images.backdrops?.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {images.backdrops.slice(0, 8).map((b, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setBackdropUrl(b.url)}
                        className={`w-16 h-10 rounded-lg overflow-hidden border shrink-0 transition ${
                          backdropUrl === b.url ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={b.previewUrl || b.url} alt="Option" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Title Art / Logo (Fanart + TMDB) */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-2">
                  <ImageIcon size={14} className="text-purple-400" />
                  Title Art / Logo (from Fanart.tv & TMDB)
                </label>
                <input
                  type="checkbox"
                  checked={enableLogo}
                  onChange={(e) => setEnableLogo(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-0 cursor-pointer"
                />
              </div>

              {enableLogo && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="Logo PNG URL (transparent title art)"
                    className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 font-mono"
                  />
                  {/* Logos Picker */}
                  {images.logos?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                      {images.logos.map((l, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setLogoUrl(l.url)}
                          className={`h-12 px-3 rounded-xl bg-black/50 border shrink-0 flex items-center justify-center transition ${
                            logoUrl === l.url ? 'border-purple-500 ring-2 ring-purple-500/50' : 'border-white/10 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={l.previewUrl || toFanartBigPreview(l.url)} alt="Logo" className="max-h-8 max-w-[100px] object-contain" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. Where to Stream Section (Need Plan, Rent, Buy, Free to Watch) */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                    <Globe size={15} className="text-cyan-400" />
                    Where to Stream & Watch
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Categorized by Need Plan (Subscription), Rent, Buy, or Free to Watch
                  </p>
                </div>
                {/* Popular Quick-Add Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {POPULAR_STREAM_PROVIDERS.map((prov) => {
                    const plan = prov.defaultPlan;
                    const isAdded = streamProviders[plan]?.some(p => p.name.toLowerCase() === prov.name.toLowerCase());
                    return (
                      <button
                        key={prov.name}
                        type="button"
                        onClick={() => handleTogglePopularProvider(prov)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                          isAdded
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {isAdded && <Check size={10} />}
                        <span>{prov.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Categorized Stream Lists */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* 1. Need Plan / Subscription */}
                <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2">
                  <span className="text-[11px] font-extrabold text-purple-300 flex items-center gap-1">
                    <CreditCard size={12} /> Need Plan (Sub)
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {streamProviders.needPlan?.length === 0 ? (
                      <span className="text-[10px] text-gray-500 block italic">None added</span>
                    ) : (
                      streamProviders.needPlan.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-1 p-1.5 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-[11px] font-semibold text-white truncate">{p.name}</span>
                          <button type="button" onClick={() => handleRemoveProvider('needPlan', idx)} className="text-gray-500 hover:text-red-400">
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2. Rent */}
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                  <span className="text-[11px] font-extrabold text-amber-300 flex items-center gap-1">
                    <DollarSign size={12} /> Rent
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {streamProviders.rent?.length === 0 ? (
                      <span className="text-[10px] text-gray-500 block italic">None added</span>
                    ) : (
                      streamProviders.rent.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-1 p-1.5 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-[11px] font-semibold text-white truncate">{p.name}</span>
                          <button type="button" onClick={() => handleRemoveProvider('rent', idx)} className="text-gray-500 hover:text-red-400">
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Buy */}
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
                  <span className="text-[11px] font-extrabold text-blue-300 flex items-center gap-1">
                    <DollarSign size={12} /> Buy
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {streamProviders.buy?.length === 0 ? (
                      <span className="text-[10px] text-gray-500 block italic">None added</span>
                    ) : (
                      streamProviders.buy.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-1 p-1.5 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-[11px] font-semibold text-white truncate">{p.name}</span>
                          <button type="button" onClick={() => handleRemoveProvider('buy', idx)} className="text-gray-500 hover:text-red-400">
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 4. Free to Watch */}
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <span className="text-[11px] font-extrabold text-emerald-300 flex items-center gap-1">
                    <Eye size={12} /> Free to Watch
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {streamProviders.free?.length === 0 ? (
                      <span className="text-[10px] text-gray-500 block italic">None added</span>
                    ) : (
                      streamProviders.free.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-1 p-1.5 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-[11px] font-semibold text-white truncate">{p.name}</span>
                          <button type="button" onClick={() => handleRemoveProvider('free', idx)} className="text-gray-500 hover:text-red-400">
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Add Custom Provider */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/5">
                <input
                  type="text"
                  placeholder="Provider name (e.g., Netflix, Hotstar, JioCinema)"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none flex-1"
                />
                <select
                  value={newProviderPlan}
                  onChange={(e) => setNewProviderPlan(e.target.value)}
                  className="px-3 py-1.5 bg-[#151a28] border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="needPlan">Need Plan (Subscription)</option>
                  <option value="rent">Rent</option>
                  <option value="buy">Buy</option>
                  <option value="free">Free to Watch</option>
                </select>
                <input
                  type="text"
                  placeholder="Direct watch URL (optional)"
                  value={newProviderUrl}
                  onChange={(e) => setNewProviderUrl(e.target.value)}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none flex-1 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddStreamProvider}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* 5. Videos & Trailers */}
            <div className="space-y-2">
              <label className="block text-[11px] text-gray-400 font-semibold">Trailers & Videos (TMDB & YouTube)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste YouTube Trailer Link or Key..."
                  value={customVideoUrl}
                  onChange={(e) => setCustomVideoUrl(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddVideo}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Add Video
                </button>
              </div>

              {videos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                  {videos.map((vid, idx) => (
                    <div
                      key={vid.id || idx}
                      className="px-3 py-1.5 rounded-xl bg-red-600/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2 shrink-0"
                    >
                      <Video size={13} />
                      <span className="truncate max-w-[150px]">{vid.name || vid.key}</span>
                      <button
                        type="button"
                        onClick={() => setVideos(videos.filter((_, i) => i !== idx))}
                        className="text-gray-400 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 6. Cast Preview */}
            {cast.length > 0 && (
              <div className="space-y-2">
                <label className="block text-[11px] text-gray-400 font-semibold">
                  Cast & Actors ({cast.length} loaded with photos)
                </label>
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
                  {cast.slice(0, 10).map((c, idx) => (
                    <div key={c.id || idx} className="w-16 shrink-0 text-center">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-white/5 mx-auto border border-white/10">
                        {c.profileUrl ? (
                          <img src={c.profileUrl} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">
                            <Users size={16} />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-300 font-semibold block truncate mt-1">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-xl disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Bookmark size={16} />}
            <span>{submitting ? 'Saving...' : 'Add to Watchlist'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
