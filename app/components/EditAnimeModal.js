"use client";

import React, { useState, useEffect } from 'react';
import {
  Tv, X, HardDrive, ImagePlus, CheckCircle2,
  AlertTriangle, Loader2, Image as ImageIcon, Sparkles,
  Trash2, Search, Check, Youtube, Play, Video, FolderTree
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ANIME_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mecha", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller"
];

export default function EditAnimeModal({
  isOpen,
  anime,
  onClose,
  onSaveAnime,
}) {
  const [title, setTitle] = useState('');
  const [romajiTitle, setRomajiTitle] = useState('');
  const [englishTitle, setEnglishTitle] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [namingPattern, setNamingPattern] = useState('auto');
  const [year, setYear] = useState('');
  const [rating, setRating] = useState('');
  const [overview, setOverview] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [status, setStatus] = useState('Ongoing');
  const [genres, setGenres] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Online Search & Refetch State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true);

  useEffect(() => {
    if (anime) {
      setTitle(anime.title || '');
      setRomajiTitle(anime.romajiTitle || '');
      setEnglishTitle(anime.englishTitle || '');
      setFolderPath(anime.folderPath || '');
      setNamingPattern(anime.namingPattern || 'auto');
      setYear(anime.year ? String(anime.year) : '');
      setRating(anime.rating ? String(anime.rating) : '');
      setOverview(anime.overview || anime.synopsis || '');
      setCoverUrl(anime.coverUrl || anime.posterUrl || '');
      setBannerUrl(anime.bannerUrl || anime.backdropUrl || '');
      setLogoUrl(anime.logoUrl || '');
      setStatus(anime.status || 'Ongoing');
      setGenres(Array.isArray(anime.genres) ? anime.genres : []);
    }
  }, [anime]);

  if (!isOpen || !anime) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter an anime title.');
      return;
    }

    setSubmitting(true);
    try {
      const updated = {
        title: title.trim(),
        romajiTitle: romajiTitle.trim() || null,
        englishTitle: englishTitle.trim() || null,
        folderPath: folderPath.trim() || null,
        namingPattern: namingPattern || 'auto',
        year: year ? String(year) : null,
        rating: rating ? parseFloat(rating) : 0,
        overview: overview.trim() || '',
        coverUrl: coverUrl.trim() || null,
        posterUrl: coverUrl.trim() || null,
        bannerUrl: bannerUrl.trim() || null,
        backdropUrl: bannerUrl.trim() || null,
        logoUrl: logoUrl.trim() || null,
        status,
        genres: genres.length > 0 ? genres : ['Anime'],
        updatedAt: new Date().toISOString(),
      };

      await onSaveAnime(updated);
      onClose();
    } catch (err) {
      console.error('[EditAnimeModal] Save error:', err);
      alert('Failed to update anime: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGenre = (genre) => {
    setGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
    );
  };

  const handleSearchOnline = async (e) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim() || title.trim();
    if (!q) {
      setSearchError('Please enter an anime title to search');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setSearchResults(data.results);
        if (data.results.length === 0) {
          setSearchError('No anime found matching your query.');
        }
      } else {
        setSearchError(data.error || 'Failed to search anime.');
      }
    } catch (err) {
      console.error('[EditAnimeModal] search error:', err);
      setSearchError('Error searching anime: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (item) => {
    if (!fillEmptyOnly || !title) setTitle(item.title || '');
    if (!fillEmptyOnly || !romajiTitle) setRomajiTitle(item.romajiTitle || item.title || '');
    if (!fillEmptyOnly || !englishTitle) setEnglishTitle(item.englishTitle || '');
    if (!fillEmptyOnly || !year) setYear(item.year ? String(item.year) : '');
    if (!fillEmptyOnly || !rating) setRating(item.rating ? String(item.rating) : '');
    if (!fillEmptyOnly || !overview) setOverview(item.overview || '');
    if (!fillEmptyOnly || !coverUrl) setCoverUrl(item.posterUrl || '');
    if (!fillEmptyOnly || !bannerUrl) setBannerUrl(item.backdropUrl || '');
    if (!fillEmptyOnly || genres.length === 0) {
      if (Array.isArray(item.genres) && item.genres.length > 0) {
        setGenres(item.genres);
      }
    }
    if (!fillEmptyOnly || !status) setStatus(item.status || 'Ongoing');
    setSearchResults([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-neonCyan">
              <Tv size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                Edit Anime Details
              </h2>
              <p className="text-[11px] text-gray-400">
                Update metadata, alternative titles, artwork, and local directory
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
          {/* Online Refetch & Search Bar */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-neonCyan" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Refetch / Auto-Fill from Online Database
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fillEmptyOnly}
                  onChange={(e) => setFillEmptyOnly(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-neonCyan focus:ring-0 h-3.5 w-3.5"
                />
                <span>Fill empty fields only</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                <input
                  type="text"
                  placeholder={`Search anime (e.g. ${title || 'Bleach'})...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchOnline();
                    }
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                />
              </div>
              <button
                type="button"
                onClick={handleSearchOnline}
                disabled={searching}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-neonCyan to-purple-600 hover:brightness-110 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0 shadow-lg"
              >
                {searching ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search size={13} />
                    <span>Search</span>
                  </>
                )}
              </button>
            </div>

            {searchError && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1">
                <AlertTriangle size={12} /> {searchError}
              </p>
            )}

            {/* Search Results Dropdown List */}
            {searchResults.length > 0 && (
              <div className="space-y-2 pt-1 max-h-56 overflow-y-auto custom-scrollbar border-t border-white/10">
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                  <span>Click an anime to set details in {fillEmptyOnly ? 'empty inputs' : 'all inputs'}:</span>
                  <button
                    type="button"
                    onClick={() => setSearchResults([])}
                    className="text-gray-400 hover:text-white text-[10px] cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {searchResults.map((resItem) => (
                    <div
                      key={resItem.id}
                      onClick={() => handleSelectSearchResult(resItem)}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-neonCyan/40 flex items-start gap-2.5 transition cursor-pointer group"
                    >
                      {resItem.posterUrl ? (
                        <img
                          src={resItem.posterUrl}
                          alt={resItem.title}
                          className="w-10 h-14 object-cover rounded-lg shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="w-10 h-14 rounded-lg bg-black/40 flex items-center justify-center shrink-0">
                          <Tv size={14} className="text-gray-500" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white group-hover:text-neonCyan transition truncate">
                          {resItem.title}
                        </h4>
                        <p className="text-[10px] text-gray-400 truncate">
                          {resItem.englishTitle || resItem.romajiTitle || ''}
                        </p>
                        <div className="flex items-center gap-2 pt-1 text-[10px] text-gray-400">
                          {resItem.year && <span>{resItem.year}</span>}
                          {resItem.episodes && <span>• {resItem.episodes} eps</span>}
                          {resItem.rating && <span className="text-amber-400 font-bold">★ {resItem.rating}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form id="edit-anime-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Anime Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Romaji / Alternative Title
                </label>
                <input
                  type="text"
                  value={romajiTitle}
                  onChange={(e) => setRomajiTitle(e.target.value)}
                  placeholder="e.g. Shingeki no Kyojin"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  English Title
                </label>
                <input
                  type="text"
                  value={englishTitle}
                  onChange={(e) => setEnglishTitle(e.target.value)}
                  placeholder="e.g. Attack on Titan"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Release Year & Rating
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="2023"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-1/2 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    placeholder="Rating (0-10)"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                    className="w-1/2 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                  />
                </div>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-1.5">
                Release Status
              </label>
              <div className="flex gap-2">
                {['Ongoing', 'Completed'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(st)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      status === st
                        ? 'bg-neonCyan/20 border-neonCyan text-neonCyan shadow'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Folder Path */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-1 flex items-center gap-1.5">
                <HardDrive size={13} className="text-neonPurple" />
                Local Folder Path
              </label>
              <input
                type="text"
                placeholder="e.g. C:\Anime\Solo Leveling"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-neonCyan"
              />
            </div>

            {/* Artwork URLs */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <span className="text-[11px] text-gray-300 font-bold uppercase tracking-wider block">
                Visual Artworks
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 block font-semibold mb-1">
                    Poster / Cover Image URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                  />
                  {coverUrl && (
                    <div className="mt-2 w-16 aspect-[2/3] rounded-lg overflow-hidden border border-white/10">
                      <img src={coverUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 block font-semibold mb-1">
                    Backdrop / Banner URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                  />
                  {bannerUrl && (
                    <div className="mt-2 w-28 aspect-video rounded-lg overflow-hidden border border-white/10">
                      <img src={bannerUrl} alt="Backdrop Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 block font-semibold mb-1">
                    Series Logo (ClearLogo) URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan"
                  />
                  {logoUrl && (
                    <div className="mt-2 w-28 h-10 p-1 bg-black/50 rounded-lg flex items-center justify-center border border-white/10">
                      <img src={logoUrl} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Overview */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-1">
                Storyline / Overview / Synopsis
              </label>
              <textarea
                rows={3}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                placeholder="Brief summary of the anime series..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-neonCyan custom-scrollbar"
              />
            </div>

            {/* Genres */}
            <div>
              <label className="text-[11px] text-gray-400 block font-semibold mb-2">
                Genres
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ANIME_GENRES.map((g) => {
                  const selected = genres.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGenre(g)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        selected
                          ? 'bg-[#7c5cff] text-white border border-[#a855f7]'
                          : 'bg-white/5 text-gray-400 border border-white/5 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-anime-form"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-neonCyan to-purple-600 hover:brightness-110 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
