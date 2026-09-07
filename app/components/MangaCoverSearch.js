"use client";

import React, { useState, useEffect } from 'react';
import { Search, Loader2, Download, Check, ExternalLink, X, BookOpen, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MangaCoverSearch({
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
      const res = await fetch(`/api/manga-covers?q=${encodeURIComponent(term)}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.results)) {
        setResults(data.results);
        if (data.results.length === 0) {
          setErrorMessage(`No manga covers found for "${term}". Try shortening or modifying the title.`);
        }
      } else {
        setErrorMessage(data.error || 'Failed to fetch covers. Please try again.');
      }
    } catch (err) {
      console.error('Manga cover search error:', err);
      setErrorMessage('Network error while searching manga covers.');
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
      const cleanTitle = (item.title || 'manga').replace(/[^a-zA-Z0-9_-]/g, '_');
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
          console.warn('ImgBB upload failed, falling back to direct URL:', uploadErr);
          finalUrl = item.imageUrl;
        }
      } else {
        finalUrl = item.imageUrl;
      }

      onSelectCover(finalUrl || item.imageUrl);
      onClose();
    } catch (err) {
      console.error('Error selecting cover:', err);
      onSelectCover(item.imageUrl);
      onClose();
    } finally {
      setUploadingId(null);
    }
  };

  const filteredResults = results.filter((item) => {
    if (selectedSource === 'ALL') return true;
    return item.source.toUpperCase() === selectedSource;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-4xl max-h-[90vh] glass-panel rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden bg-[#0d1117]/95"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-wide text-white flex items-center gap-2">
                Fetch Manga Cover Artwork
              </h2>
              <p className="text-xs text-gray-400">
                Official covers from AniList, MyAnimeList & Kitsu
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar & Provider Filters */}
        <div className="p-6 border-b border-white/10 space-y-3 bg-black/20">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search manga or comic title (e.g. Berserk, Solo Leveling, One Piece)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition shadow-lg cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span>Search</span>
            </button>
          </form>

          {/* Provider Pills */}
          {results.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-gray-400 font-medium">Provider:</span>
              {['ALL', 'ANILIST', 'JIKAN', 'KITSU'].map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSelectedSource(src)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                    selectedSource === src
                      ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300 shadow-sm'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {src}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-gray-500">
                {filteredResults.length} {filteredResults.length === 1 ? 'cover' : 'covers'} found
              </span>
            </div>
          )}
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 size={32} className="animate-spin text-purple-400" />
              <p className="text-xs font-medium">Searching verified manga databases...</p>
            </div>
          ) : errorMessage ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-xs text-amber-400/90 max-w-sm leading-relaxed">{errorMessage}</p>
            </div>
          ) : filteredResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredResults.map((item) => {
                const isUploading = uploadingId === item.id;
                const isDownloading = downloadingId === item.id;
                const isDownloaded = downloadSuccessId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectCover(item)}
                    className="group relative rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-purple-500/50 transition duration-200 cursor-pointer flex flex-col justify-between"
                  >
                    {/* Cover Image */}
                    <div className="relative aspect-[2/3] bg-black/40 overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />

                      {/* Source Badge */}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[9px] font-extrabold text-purple-300">
                        {item.source}
                      </div>

                      {/* Chapters / Format badge */}
                      {item.chapters && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-mono text-gray-300">
                          {item.chapters} Ch
                        </div>
                      )}

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 gap-2">
                        <button
                          type="button"
                          className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Applying...</span>
                            </>
                          ) : (
                            <>
                              <Check size={13} />
                              <span>Use This Cover</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleDownload(item, e)}
                            className="flex-1 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold flex items-center justify-center gap-1 backdrop-blur-md"
                            title="Save cover image to computer"
                          >
                            {isDownloading ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : isDownloaded ? (
                              <Check size={11} className="text-emerald-400" />
                            ) : (
                              <Download size={11} />
                            )}
                            <span>{isDownloaded ? 'Saved' : 'Save'}</span>
                          </button>

                          {item.siteUrl && (
                            <a
                              href={item.siteUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-gray-300 hover:text-white"
                              title="Open in database"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Footer */}
                    <div className="p-3 bg-black/40 border-t border-white/5 space-y-0.5">
                      <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-purple-300 transition">
                        {item.title}
                      </h4>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
                        <span>{item.format}</span>
                        <span>{item.year}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-500 text-center">
              <ImageIcon size={36} className="text-gray-600 mb-1" />
              <p className="text-xs font-medium">
                {hasSearched ? 'No results found. Try a different query.' : 'Search for a manga title to find official cover art.'}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
