"use client";

import React, { useState, useEffect } from 'react';
import {
  Tv, X, HardDrive, ImagePlus, CheckCircle2,
  AlertTriangle, Loader2, Image as ImageIcon, Sparkles,
  Trash2, Search, Check, Youtube, Play, Video, FolderTree
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { NAMING_PATTERNS } from '../utils/parser';

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
  onClose,
  onSaveWebseries,
}) {
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [namingPattern, setNamingPattern] = useState('auto');
  const [year, setYear] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [rating, setRating] = useState('');
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

  useEffect(() => {
    if (webseries) {
      setTitle(webseries.title || '');
      setOriginalTitle(webseries.originalTitle || '');
      setFolderPath(webseries.folderPath || '');
      setNamingPattern(webseries.namingPattern || 'auto');
      setYear(webseries.year || '');
      setReleaseDate(webseries.releaseDate || '');
      setRating(webseries.rating ? String(webseries.rating) : '');
      setOverview(webseries.overview || '');
      setPosterUrl(webseries.posterUrl || '');
      setBackdropUrl(webseries.backdropUrl || '');
      setLogoUrl(webseries.logoUrl || '');
      setWatchStatus(webseries.watchStatus || (webseries.completed ? 'Completed' : 'Plan to Watch'));
      setGenres(Array.isArray(webseries.genres) ? webseries.genres : []);
      setAvailableLogos(Array.isArray(webseries?.images?.logos) ? webseries.images.logos : []);

      const initVideos = Array.isArray(webseries?.videos) ? webseries.videos : [];
      setAvailableVideos(initVideos);

      const curYtKey = extractYoutubeId(
        webseries.playableYoutubeId ||
        webseries.youtubeId ||
        webseries.trailerKey ||
        webseries.trailerUrl
      );
      setSelectedVideoKey(curYtKey || '');
      setCustomYoutubeInput(
        curYtKey
          ? `https://www.youtube.com/watch?v=${curYtKey}`
          : (webseries.playableYoutubeUrl || webseries.trailerUrl || '')
      );
    }
  }, [webseries]);

  if (!isOpen || !webseries) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a title.');
      return;
    }

    setSubmitting(true);
    try {
      const parsedYtKey = extractYoutubeId(customYoutubeInput) || selectedVideoKey;

      const updated = {
        ...webseries,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        folderPath: folderPath.trim(),
        namingPattern: namingPattern || 'auto',
        year: year ? String(year) : '',
        releaseDate: releaseDate || '',
        rating: rating ? parseFloat(rating) : 0,
        overview: overview.trim(),
        posterUrl: posterUrl.trim(),
        backdropUrl: backdropUrl.trim(),
        logoUrl: logoUrl.trim(),
        watchStatus,
        completed: watchStatus === 'Completed',
        watched: watchStatus === 'Completed',
        genres: genres.length > 0 ? genres : ['Drama'],
        playableYoutubeId: parsedYtKey || null,
        playableYoutubeUrl: parsedYtKey ? `https://www.youtube.com/watch?v=${parsedYtKey}` : (customYoutubeInput.trim() || null),
        updatedAt: new Date().toISOString(),
      };

      await onSaveWebseries(updated);
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

            {/* Folder & Naming Pattern */}
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
