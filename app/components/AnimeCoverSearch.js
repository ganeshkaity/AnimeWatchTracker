"use client";

import React, { useState, useEffect } from 'react';
import { Search, Loader2, Download, Check, ExternalLink, X, Sparkles, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AnimeCoverSearch({
  initialQuery = '',
  onSelectCover,
  onClose,
  uploadToImgBB,
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [uploadingId, setUploadingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadSuccessId, setDownloadSuccessId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-search once on mount if initialQuery is provided
  useEffect(() => {
    if (initialQuery && initialQuery.trim().length > 1) {
      performSearch(initialQuery.trim());
    }
  }, []);

  const performSearch = async (searchTerm) => {
    const term = (searchTerm || query).trim();
    if (!term) return;

    setLoading(true);
    setErrorMessage('');
    setHasSearched(true);

    try {
      const res = await fetch(`/api/anime-covers?q=${encodeURIComponent(term)}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.results)) {
        setResults(data.results);
        if (data.results.length === 0) {
          setErrorMessage(`No covers found for "${term}". Try shortening or modifying the title.`);
        }
      } else {
        setErrorMessage(data.error || 'Failed to fetch covers. Please try again.');
      }
    } catch (err) {
      console.error('Anime cover search error:', err);
      setErrorMessage('Network error while searching anime covers.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    performSearch(query);
  };

  const handleDownload = async (item, e) => {
    e.stopPropagation();
    e.preventDefault();

    setDownloadingId(item.id);
    try {
      const cleanTitle = (item.title || 'anime').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanTitle}_cover.jpg`;
      const downloadUrl = `/api/download-image?url=${encodeURIComponent(item.imageUrl)}&filename=${encodeURIComponent(filename)}`;

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadSuccessId(item.id);
      setTimeout(() => {
        setDownloadSuccessId((prev) => (prev === item.id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSelectCover = async (item) => {
    if (uploadingId) return;

    setUploadingId(item.id);
    try {
      let finalUrl = '';
      if (uploadToImgBB) {
        try {
          finalUrl = await uploadToImgBB(item.imageUrl);
        } catch (uploadErr) {
          console.warn('[AnimeCoverSearch] ImgBB upload fallback to direct URL:', uploadErr);
          finalUrl = item.imageUrl;
        }
      } else {
        finalUrl = item.imageUrl;
      }

      if (!finalUrl) {
        finalUrl = item.imageUrl;
      }

      if (onSelectCover) {
        onSelectCover(finalUrl);
      }
    } catch (err) {
      console.warn('[AnimeCoverSearch] Error selecting cover, applying direct URL:', err);
      if (onSelectCover && item.imageUrl) {
        onSelectCover(item.imageUrl);
      }
    } finally {
      setUploadingId(null);
    }
  };

  // Filter results by source if selected
  const filteredResults = results.filter((r) => {
    if (selectedSource === 'ALL') return true;
    return r.source.toLowerCase().includes(selectedSource.toLowerCase());
  });

  return (
    <div className="rounded-2xl p-3 sm:p-4 border border-purple-500/20 bg-[#0b1021]/80 backdrop-blur-md space-y-3 shadow-inner">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-sm">
            <Sparkles size={14} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              Online Anime Cover Search
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-normal">
                AniList & Jikan
              </span>
            </h4>
            <p className="text-[10px] text-gray-400">Search & pick official anime covers, or download locally</p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close Search"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-grow">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type anime title (e.g. Bleach, Naruto, Solo Leveling)..."
            className="w-full px-3 py-2 pl-9 rounded-xl glass-input text-xs text-white placeholder-gray-500 focus:border-[#7c5cff]"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-300"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-xl btn-accent text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
        >
          {loading ? (
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
      </form>

      {/* Filter Tabs (when results exist) */}
      {results.length > 0 && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
          <div className="flex gap-1.5">
            {['ALL', 'AniList', 'Jikan'].map((src) => {
              const count =
                src === 'ALL'
                  ? results.length
                  : results.filter((r) => r.source.toLowerCase().includes(src.toLowerCase())).length;
              if (count === 0 && src !== 'ALL') return null;

              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSelectedSource(src)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                    selectedSource === src
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {src === 'ALL' ? 'All' : src} ({count})
                </button>
              );
            })}
          </div>

          <span className="text-[10px] text-gray-400 italic">Click image to set as cover</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse flex flex-col justify-end p-2 border border-white/5"
            >
              <div className="h-3 bg-white/10 rounded w-3/4 mb-1"></div>
              <div className="h-2 bg-white/10 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      )}

      {/* Error / Empty Message */}
      {!loading && errorMessage && (
        <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/30 text-center">
          <p className="text-xs text-purple-200">{errorMessage}</p>
        </div>
      )}

      {/* Results Grid */}
      {!loading && filteredResults.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1 pr-1.5 rounded-xl border border-white/5 bg-black/20">
          {filteredResults.map((item) => {
            const isUploading = uploadingId === item.id;
            const isDownloading = downloadingId === item.id;
            const isDownloaded = downloadSuccessId === item.id;
            const isAniList = item.source.toLowerCase() === 'anilist';

            return (
              <div
                key={item.id}
                onClick={() => handleSelectCover(item)}
                className="group relative aspect-[2/3] rounded-xl overflow-hidden border border-white/10 hover:border-purple-400/80 bg-black/40 shadow-md hover:shadow-purple-500/20 transition-all duration-200 cursor-pointer select-none"
                title={`Click to set "${item.title}" as cover`}
              >
                {/* Poster Image */}
                <img
                  src={item.thumbnailUrl || item.imageUrl}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Source Badge (Top Left) */}
                <div className="absolute top-1.5 left-1.5 z-10">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-md shadow-sm uppercase tracking-wider ${
                      isAniList
                        ? 'bg-sky-600/85 text-white'
                        : 'bg-purple-600/85 text-white'
                    }`}
                  >
                    {item.source}
                  </span>
                </div>

                {/* Download Button (Top Right) */}
                <button
                  type="button"
                  onClick={(e) => handleDownload(item, e)}
                  disabled={isDownloading}
                  className={`absolute top-1.5 right-1.5 z-10 p-1.5 rounded-lg backdrop-blur-md transition shadow-md cursor-pointer ${
                    isDownloaded
                      ? 'bg-emerald-600 text-white'
                      : 'bg-black/60 hover:bg-black/90 text-white hover:text-purple-300'
                  }`}
                  title="Download image locally to PC"
                >
                  {isDownloading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : isDownloaded ? (
                    <Check size={12} />
                  ) : (
                    <Download size={12} />
                  )}
                </button>

                {/* Hover / Bottom Overlay with Title & Action */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-6 flex flex-col justify-end">
                  <p className="text-[11px] font-bold text-white line-clamp-1 leading-tight drop-shadow-sm">
                    {item.title}
                  </p>
                  <div className="flex items-center justify-between text-[9px] text-gray-300 mt-0.5">
                    <span>{item.year || item.format || 'Anime'}</span>
                    <span className="text-purple-300 group-hover:underline font-semibold">Select</span>
                  </div>
                </div>

                {/* Loading / Uploading to ImgBB Overlay */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-2 text-center">
                    <Loader2 size={22} className="animate-spin text-[#7c5cff] mb-1.5" />
                    <span className="text-[10px] font-bold text-white">Uploading to ImgBB...</span>
                    <span className="text-[9px] text-gray-400">Saving as cover</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
