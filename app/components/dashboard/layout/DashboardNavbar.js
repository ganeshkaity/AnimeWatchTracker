import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Wifi, WifiOff, Plus, ChevronDown, Settings,
  SlidersHorizontal, Menu, Bookmark, Tv, Film, Headphones, BookOpen,
  FolderPlus, Layers, Trophy, Keyboard
} from 'lucide-react';
import CachedImage from '../../../utils/imageCache';
import { toFanartBigPreview, toFanartPreview, toSearchThumbnail } from '../../../lib/fanartUtils';
import { getInitials } from '../utils/dashboardHelpers';

export default function DashboardNavbar({
  isScrolled,
  search,
  setSearch,
  autocompleteMatches = [],
  autocompleteMangaMatches = [],
  autocompleteAudioStoryMatches = [],
  autocompleteMovieMatches = [],
  autocompleteWebseriesMatches = [],
  autocompleteWatchlistMatches = [],
  isOffline,
  isManualOffline,
  setManualOffline,
  showActionModal,
  setShowActionModal,
  quickActionsOpen,
  setQuickActionsOpen,
  mobileMenuOpen,
  setMobileMenuOpen,
  onSelectAnime,
  setShowAddModal,
  setShowAddMangaModal,
  setShowAddAudioStoryModal,
  setShowAddMovieModal,
  setShowAddWebseriesModal,
  setShowAddWatchlistModal,
  setShowSettings,
  onOpenAchievements,
  onOpenShortcuts,
}) {
  const router = useRouter();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const actionModalTimerRef = useRef(null);
  const actionModalRef = useRef(null);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 px-4 md:px-8 py-3.5 flex items-center justify-between transition-all duration-500 ease-out ${isScrolled
        ? 'bg-[#07090f]/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/30'
        : 'bg-transparent backdrop-blur-none border-b border-transparent shadow-none'
        }`}
    >
      {/* Left Brand */}
      <div className={`flex items-center gap-6 ${mobileSearchOpen ? 'hidden' : 'flex'}`}>
        <Link href="/" className="flex items-center gap-2.5 group">
          <img
            src="/logo.png"
            alt="AnimeWatch Logo"
            className="h-10 w-auto group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_10px_rgba(124,92,255,0.5)]"
          />
          <div>
            <span className="text-xl font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-100 to-gray-400">
              GANESH<span className="text-[#7c5cff]">SPACE</span>
            </span>
          </div>
        </Link>
      </div>

      {/* Mobile Opened Search Bar (Logo + Full Search Bar + Close button) */}
      {mobileSearchOpen && (
        <div className="flex md:hidden items-center gap-2.5 w-full">
          <Link href="/" className="shrink-0">
            <img
              src="/logo.png"
              alt="AnimeWatch Logo"
              className="h-9 w-auto"
            />
          </Link>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/80 pointer-events-none z-10" size={15} />
            <input
              type="text"
              autoFocus
              placeholder="Search titles or names..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-full bg-[#111827] border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-[#7c5cff]"
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-white/10 text-gray-300 hover:text-white"
              >
                <X size={12} />
              </button>
            )}

            {/* Mobile Search Results Dropdown */}
            {search.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#111827] border border-white/15 rounded-2xl shadow-2xl z-50 max-h-[75vh] overflow-y-auto no-scrollbar">
                {autocompleteMatches.length === 0 && autocompleteMangaMatches.length === 0 && autocompleteAudioStoryMatches.length === 0 && autocompleteMovieMatches.length === 0 && autocompleteWebseriesMatches.length === 0 && autocompleteWatchlistMatches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No anime, manga, audio story, movie, webseries, or watchlist matches found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {autocompleteWatchlistMatches.slice(0, 4).map((item) => {
                      const coverImg = toSearchThumbnail(item.posterUrl || (item.images?.posters?.[0]?.url || item.backdropUrl || null));
                      return (
                        <div
                          key={`m-search-watchlist-${item.id}`}
                          onClick={() => {
                            router.push(`/watchlist/${item.id}`);
                            setSearch('');
                            setMobileSearchOpen(false);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                            {coverImg ? (
                              <img src={coverImg} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <Bookmark size={16} className="text-amber-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-[8px] font-extrabold text-black uppercase flex items-center gap-0.5 shadow-sm">
                                <Bookmark size={8} /> Watchlist
                              </span>
                              {item.contentType && (
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[8px] font-bold text-gray-300 uppercase">
                                  {item.contentType}
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-xs text-white truncate" title={item.title}>{item.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate">
                              {item.year ? `${item.year} • ` : ''}{item.status || 'Plan to Watch'}{item.rating ? ` • ★ ${parseFloat(item.rating).toFixed(1)}` : ''}{item.episodesCount ? ` • ${item.episodesCount} Ep` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {autocompleteWebseriesMatches.slice(0, 3).map((ws) => {
                      const coverImg = toSearchThumbnail(ws.posterUrl || ws.posterPath);
                      return (
                        <div
                          key={`m-search-webseries-${ws.id}`}
                          onClick={() => {
                            router.push(`/webseries/${ws.id}`);
                            setSearch('');
                            setMobileSearchOpen(false);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                            {coverImg ? (
                              <img src={coverImg} alt={ws.title} className="w-full h-full object-cover" />
                            ) : (
                              <Tv size={16} className="text-cyan-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-500 to-blue-600 text-[8px] font-bold text-white uppercase">Series</span>
                            </div>
                            <h4 className="font-bold text-xs text-white truncate" title={ws.title}>{ws.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate">
                              {ws.year ? `${ws.year} • ` : ''}{ws.episodeCount ? `${ws.episodeCount} Ep` : 'Web-series'}{ws.rating ? ` • ★ ${parseFloat(ws.rating).toFixed(1)}` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {autocompleteMovieMatches.slice(0, 3).map((mov) => {
                      const coverImg = toSearchThumbnail(mov.posterUrl || mov.posterPath);
                      return (
                        <div
                          key={`m-search-movie-${mov.id}`}
                          onClick={() => {
                            router.push(`/movies/${mov.id}`);
                            setSearch('');
                            setMobileSearchOpen(false);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                            {coverImg ? (
                              <img src={coverImg} alt={mov.title} className="w-full h-full object-cover" />
                            ) : (
                              <Film size={16} className="text-amber-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-rose-600 text-[8px] font-bold text-black uppercase">Movie</span>
                            </div>
                            <h4 className="font-bold text-xs text-white truncate" title={mov.title}>{mov.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate">
                              {mov.year ? `${mov.year} • ` : ''}{mov.runtime ? `${Math.floor(mov.runtime / 60)}h ${mov.runtime % 60}m` : 'Feature Film'}{mov.rating ? ` • ★ ${parseFloat(mov.rating).toFixed(1)}` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {autocompleteAudioStoryMatches.slice(0, 3).map((a) => {
                      const coverImg = toSearchThumbnail(a.thumbnailBase64 || (a.thumbnailPath ? `/api/image?path=${encodeURIComponent(a.thumbnailPath)}` : null));
                      return (
                        <div
                          key={`m-search-audio-${a.id}`}
                          onClick={() => {
                            router.push(`/audio-story/${a.id}`);
                            setSearch('');
                            setMobileSearchOpen(false);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                            {coverImg ? (
                              <img src={coverImg} alt={a.title} className="w-full h-full object-cover" />
                            ) : (
                              <Headphones size={16} className="text-cyan-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-600 to-blue-600 text-[8px] font-bold text-white uppercase">Audio</span>
                            </div>
                            <h4 className="font-bold text-xs text-white truncate" title={a.title}>{a.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate">
                              {a.trackCount || a.totalTracks || 0} Tracks • Audio Story
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {autocompleteMangaMatches.slice(0, 3).map((m) => {
                      const coverImg = toSearchThumbnail(m.thumbnailBase64 || m.coverUrl);
                      return (
                        <div
                          key={`m-search-manga-${m.id}`}
                          onClick={() => {
                            router.push(`/manga/${m.id}`);
                            setSearch('');
                            setMobileSearchOpen(false);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-purple-950/40 border border-purple-500/20 transition cursor-pointer"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-purple-950/60 flex-shrink-0 relative flex items-center justify-center">
                            {coverImg ? (
                              <img src={coverImg} alt={m.title} className="w-full h-full object-cover" />
                            ) : (
                              <BookOpen size={16} className="text-purple-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-purple-600 text-[8px] font-bold text-white uppercase">Manga</span>
                            </div>
                            <h4 className="font-bold text-xs text-white truncate" title={m.title}>{m.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate">
                              {m.chapterCount || m.totalChapters || 0} Chapters • Local PDF
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {autocompleteMatches.slice(0, 4).map((anime) => {
                      const rawCover = anime.posterUrl || anime.coverUrl || (anime.thumbnailBase64 && (anime.thumbnailBase64.startsWith('http') || anime.thumbnailBase64.startsWith('data:')) ? anime.thumbnailBase64 : (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath || '')}` : null));
                      const coverImg = toSearchThumbnail(rawCover);
                      return (
                        <div
                          key={`m-search-anime-${anime.id}`}
                          onClick={() => {
                            onSelectAnime(anime.id);
                            setSearch('');
                            setMobileSearchOpen(false);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 relative">
                            {coverImg ? (
                              <CachedImage
                                src={coverImg}
                                alt={anime.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className={`w-full h-full bg-gradient-to-tr ${anime.coverGradient || 'from-violet-600 to-indigo-700'} flex items-center justify-center font-bold text-[8px] text-white/50`}>
                                {getInitials(anime.title)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-[#7c5cff] text-[8px] font-bold text-white uppercase">Anime</span>
                            </div>
                            <h4 className="font-bold text-xs text-white truncate" title={anime.title}>{anime.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate">
                              {anime.totalSeasons ? `S${anime.totalSeasons} • ` : ''}
                              {anime.totalEpisodes || anime.episodeCount} Episodes
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen(false);
              setSearch('');
            }}
            className="p-2 rounded-lg bg-white/10 text-gray-300 hover:text-white shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Right Actions & Search */}
      <div className={`items-center gap-3 ${mobileSearchOpen ? 'hidden md:flex' : 'flex'}`}>
        {/* Quick Search Input with Liquid-Glass Effect */}
        <div className="relative hidden md:block w-56 lg:w-72 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/80 group-hover:text-white group-focus-within:text-cyan-400 pointer-events-none z-10 transition-colors drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" size={16} />
          <input
            type="text"
            placeholder="Search titles or names..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2 text-xs rounded-full liquid-glass-search placeholder-gray-400/80 focus:w-80 transition-all duration-300"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition cursor-pointer z-10"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
          {/* Search Recommendations Dropdown */}
          {search.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#111827]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-50 max-h-96 overflow-y-auto no-scrollbar">
              {autocompleteMatches.length === 0 && autocompleteMangaMatches.length === 0 && autocompleteAudioStoryMatches.length === 0 && autocompleteMovieMatches.length === 0 && autocompleteWebseriesMatches.length === 0 && autocompleteWatchlistMatches.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  No anime, manga, audio story, movie, webseries, or watchlist matches found
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {autocompleteWatchlistMatches.slice(0, 4).map((item) => {
                    const coverImg = toSearchThumbnail(item.posterUrl || (item.images?.posters?.[0]?.url || item.backdropUrl || null));
                    return (
                      <div
                        key={`search-watchlist-${item.id}`}
                        onClick={() => {
                          router.push(`/watchlist/${item.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                      >
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {coverImg ? (
                            <img src={coverImg} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <Bookmark size={16} className="text-amber-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-[8px] font-extrabold text-black uppercase flex items-center gap-0.5 shadow-sm">
                              <Bookmark size={8} /> Watchlist
                            </span>
                            {item.contentType && (
                              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[8px] font-bold text-gray-300 uppercase">
                                {item.contentType}
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate" title={item.title}>{item.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">
                            {item.year ? `${item.year} • ` : ''}
                            {item.status || 'Plan to Watch'}
                            {item.rating ? ` • ★ ${parseFloat(item.rating).toFixed(1)}` : ''}
                            {item.episodesCount ? ` • ${item.episodesCount} Ep` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {autocompleteWebseriesMatches.slice(0, 3).map((ws) => {
                    const coverImg = toSearchThumbnail(ws.posterUrl || ws.posterPath);
                    return (
                      <div
                        key={`search-webseries-${ws.id}`}
                        onClick={() => {
                          router.push(`/webseries/${ws.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                      >
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {coverImg ? (
                            <img src={coverImg} alt={ws.title} className="w-full h-full object-cover" />
                          ) : (
                            <Tv size={16} className="text-cyan-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-500 to-blue-600 text-[8px] font-bold text-white uppercase">Series</span>
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate" title={ws.title}>{ws.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">
                            {ws.year ? `${ws.year} • ` : ''}{ws.episodeCount ? `${ws.episodeCount} Ep` : 'Web-series'}{ws.rating ? ` • ★ ${parseFloat(ws.rating).toFixed(1)}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {autocompleteMovieMatches.slice(0, 3).map((mov) => {
                    const coverImg = toSearchThumbnail(mov.posterUrl || mov.posterPath);
                    return (
                      <div
                        key={`search-movie-${mov.id}`}
                        onClick={() => {
                          router.push(`/movies/${mov.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                      >
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {coverImg ? (
                            <img src={coverImg} alt={mov.title} className="w-full h-full object-cover" />
                          ) : (
                            <Film size={16} className="text-amber-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-rose-600 text-[8px] font-bold text-black uppercase">Movie</span>
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate" title={mov.title}>{mov.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">
                            {mov.year ? `${mov.year} • ` : ''}{mov.runtime ? `${Math.floor(mov.runtime / 60)}h ${mov.runtime % 60}m` : 'Feature Film'}{mov.rating ? ` • ★ ${mov.rating}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {autocompleteAudioStoryMatches.slice(0, 3).map((a) => {
                    const coverImg = toSearchThumbnail(a.thumbnailBase64 || (a.thumbnailPath ? `/api/image?path=${encodeURIComponent(a.thumbnailPath)}` : null));
                    return (
                      <div
                        key={`search-audio-${a.id}`}
                        onClick={() => {
                          router.push(`/audio-story/${a.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                      >
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {coverImg ? (
                            <img src={coverImg} alt={a.title} className="w-full h-full object-cover" />
                          ) : (
                            <Headphones size={16} className="text-cyan-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-600 to-blue-600 text-[8px] font-bold text-white uppercase">Audio</span>
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate" title={a.title}>{a.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">
                            {a.trackCount || a.totalTracks || 0} Tracks • Audio Story
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {autocompleteMangaMatches.slice(0, 3).map((m) => {
                    const coverImg = toSearchThumbnail(m.thumbnailBase64 || m.coverUrl);
                    return (
                      <div
                        key={`search-manga-${m.id}`}
                        onClick={() => {
                          router.push(`/manga/${m.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-purple-950/40 border border-purple-500/20 transition cursor-pointer"
                      >
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-purple-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {coverImg ? (
                            <img src={coverImg} alt={m.title} className="w-full h-full object-cover" />
                          ) : (
                            <BookOpen size={16} className="text-purple-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-purple-600 text-[8px] font-bold text-white uppercase">Manga</span>
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate" title={m.title}>{m.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">
                            {m.chapterCount || m.totalChapters || 0} Chapters • Local PDF
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {autocompleteMatches.slice(0, 4).map((anime) => {
                    const rawCover = anime.posterUrl || anime.coverUrl || (anime.thumbnailBase64 && (anime.thumbnailBase64.startsWith('http') || anime.thumbnailBase64.startsWith('data:')) ? anime.thumbnailBase64 : (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath || '')}` : null));
                    const coverImg = toSearchThumbnail(rawCover);
                    return (
                      <div
                        key={anime.id}
                        onClick={() => {
                          onSelectAnime(anime.id);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
                      >
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 relative">
                          {coverImg ? (
                            <CachedImage
                              src={coverImg}
                              alt={anime.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-tr ${anime.coverGradient || 'from-violet-600 to-indigo-700'} flex items-center justify-center font-bold text-[8px] text-white/50`}>
                              {getInitials(anime.title)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-[#7c5cff] text-[8px] font-bold text-white uppercase">Anime</span>
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate" title={anime.title}>{anime.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">
                            {anime.totalSeasons ? `S${anime.totalSeasons} • ` : ''}
                            {anime.totalEpisodes ? (
                              anime.episodeCount && anime.episodeCount !== Number(anime.totalEpisodes)
                                ? `${anime.episodeCount}/${anime.totalEpisodes} Ep`
                                : `${anime.totalEpisodes} Episodes`
                            ) : `${anime.episodeCount} Episodes`} • {Math.round(anime.progressPercent || 0)}% completed
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Unified Media Actions Trigger (Hover or Click Modal) */}
        <div
          ref={actionModalRef}
          className="relative hidden sm:block"
          onMouseEnter={() => {
            if (actionModalTimerRef.current) clearTimeout(actionModalTimerRef.current);
            setShowActionModal(true);
          }}
          onMouseLeave={() => {
            actionModalTimerRef.current = setTimeout(() => {
              setShowActionModal(false);
            }, 220);
          }}
        >
          <button
            type="button"
            onClick={() => setShowActionModal(prev => !prev)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer shadow-lg ${showActionModal
              ? 'bg-gradient-to-r from-[#7c5cff] via-purple-600 to-cyan-500 text-white shadow-purple-500/30 ring-2 ring-[#7c5cff]/40'
              : 'bg-white/10 hover:bg-white/15 text-white border border-white/15 hover:border-white/30'
              }`}
            title="Add Media & Stream"
          >
            <Plus size={15} className={`transition-transform duration-300 ${showActionModal ? 'rotate-45 text-cyan-300' : 'text-[#7c5cff]'}`} />
            <span>Add / Stream</span>
            <ChevronDown size={13} className={`text-gray-300 transition-transform duration-300 ${showActionModal ? 'rotate-180' : ''}`} />
          </button>

          {/* Small Floating Modal on Hover/Click */}
          <AnimatePresence>
            {showActionModal && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute top-full right-0 mt-2.5 w-72 max-h-[85vh] overflow-y-auto no-scrollbar bg-[#0d111b]/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl shadow-black/80 z-50 space-y-1"
                onMouseEnter={() => {
                  if (actionModalTimerRef.current) clearTimeout(actionModalTimerRef.current);
                  setShowActionModal(true);
                }}
                onMouseLeave={() => {
                  actionModalTimerRef.current = setTimeout(() => {
                    setShowActionModal(false);
                  }, 220);
                }}
              >
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-white/10 mb-1">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-gray-400">Media Actions</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">Fast Track</span>
                </div>

                {/* Connection Mode Toggle (Offline / Online) */}
                <button
                  type="button"
                  onClick={() => setManualOffline(!isManualOffline)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer mb-1.5 ${isOffline
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                  }`}
                  title={isOffline ? "Switch to Online Mode" : "Switch to Offline Mode"}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOffline ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {isOffline ? <WifiOff size={16} /> : <Wifi size={16} />}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white text-xs font-bold">Connection</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase ${isOffline ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                          {isOffline ? 'Offline' : 'Online'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400">Switch {isOffline ? 'to Online' : 'to Offline'}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-extrabold px-2 py-1 rounded-lg ${isOffline ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black'}`}>
                    Switch
                  </span>
                </button>

                {/* 1. Add Anime */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    if (!isOffline) setShowAddModal(true);
                  }}
                  disabled={isOffline}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-purple-950/40 border border-transparent hover:border-purple-500/30 cursor-pointer'
                    }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#7c5cff]/20 text-[#a855f7] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Film size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">Add Anime</h4>
                      <span className="text-[9px] font-bold text-gray-400">Video</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Track local anime folder</p>
                  </div>
                </button>

                {/* 2. Add Manga */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    if (!isOffline) setShowAddMangaModal(true);
                  }}
                  disabled={isOffline}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-pink-950/40 border border-transparent hover:border-pink-500/30 cursor-pointer'
                    }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <BookOpen size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-pink-300 transition-colors">Add Manga</h4>
                      <span className="text-[9px] font-bold text-gray-400">PDF</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Track manga & webtoon folder</p>
                  </div>
                </button>

                {/* 3. Add Audio */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    if (!isOffline) setShowAddAudioStoryModal(true);
                  }}
                  disabled={isOffline}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-cyan-950/40 border border-transparent hover:border-cyan-500/30 cursor-pointer'
                    }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Headphones size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">Add Audio Story</h4>
                      <span className="text-[9px] font-bold text-gray-400">Audio/Video</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Track audio story folder</p>
                  </div>
                </button>

                {/* 4. Add Movie */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    if (!isOffline) setShowAddMovieModal(true);
                  }}
                  disabled={isOffline}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-amber-950/40 border border-transparent hover:border-amber-500/30 cursor-pointer'
                    }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Film size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">Add Movie</h4>
                      <span className="text-[9px] font-bold text-amber-400">TMDB</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Track local movie with TMDB</p>
                  </div>
                </button>

                {/* 5. Add Web-series */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    if (!isOffline) setShowAddWebseriesModal(true);
                  }}
                  disabled={isOffline}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-cyan-950/40 border border-transparent hover:border-cyan-500/30 cursor-pointer'
                    }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Tv size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">Add Web-series</h4>
                      <span className="text-[9px] font-bold text-cyan-400">TMDB</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Track local web-series with TMDB</p>
                  </div>
                </button>

                {/* 6. Add to Watchlist */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    setShowAddWatchlistModal(true);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group hover:bg-amber-950/40 border border-transparent hover:border-amber-500/30 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Bookmark size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">Add Watchlist</h4>
                      <span className="text-[9px] font-bold text-amber-400">Save</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Track movies, series & anime</p>
                  </div>
                </button>

                {/* 7. Stream Link */}
                <Link
                  href="/stream"
                  onClick={() => setShowActionModal(false)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group hover:bg-emerald-950/40 border border-transparent hover:border-emerald-500/30 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Wifi size={16} className="text-cyan-300 animate-pulse" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">Local Stream</h4>
                      <span className="text-[9px] font-bold text-cyan-400 uppercase">Live</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Hotspot wireless stream page</p>
                  </div>
                </Link>

                {/* 8. Create Movie Group */}
                <Link
                  href="/create-group"
                  onClick={() => setShowActionModal(false)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group hover:bg-purple-950/40 border border-transparent hover:border-purple-500/30 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FolderPlus size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">Create Group</h4>
                      <span className="text-[9px] font-bold text-purple-400 uppercase">New</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Sequential movie collections</p>
                  </div>
                </Link>

                {/* 9. All Movie Groups */}
                <Link
                  href="/group"
                  onClick={() => setShowActionModal(false)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group hover:bg-amber-950/40 border border-transparent hover:border-amber-500/30 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Layers size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">Movie Groups</h4>
                      <span className="text-[9px] font-bold text-amber-400 uppercase">View All</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Browse &amp; watch franchise sets</p>
                  </div>
                </Link>

                {/* 10. Achievements & Badges */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    if (onOpenAchievements) onOpenAchievements();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group hover:bg-amber-950/40 border border-transparent hover:border-amber-500/30 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Trophy size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-yellow-300 transition-colors">Achievements</h4>
                      <span className="text-[9px] font-bold text-yellow-400 uppercase">Ranks</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Milestones &amp; unlockable badges</p>
                  </div>
                </button>

                {/* 11. Keyboard Shortcuts */}
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    if (onOpenShortcuts) onOpenShortcuts();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group hover:bg-purple-950/40 border border-transparent hover:border-purple-500/30 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Keyboard size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">Shortcuts</h4>
                      <span className="text-[9px] font-mono font-bold text-purple-300">Ctrl+H</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">Quick hotkeys cheatsheet</p>
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings Trigger */}
        <button
          onClick={() => setShowSettings(true)}
          className="hidden md:flex p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
          title="Settings"
        >
          <Settings size={18} />
        </button>

        {/* Mobile Search Button */}
        <button
          onClick={() => {
            setMobileSearchOpen(true);
            if (quickActionsOpen) setQuickActionsOpen(false);
            if (mobileMenuOpen) setMobileMenuOpen(false);
          }}
          className="p-2 rounded-lg bg-white/5 text-gray-300 hover:text-white transition cursor-pointer md:hidden"
          title="Search"
        >
          <Search size={20} />
        </button>

        {/* Quick Actions Dropdown Trigger for Mobile */}
        <button
          onClick={() => {
            setQuickActionsOpen(!quickActionsOpen);
            if (mobileMenuOpen) setMobileMenuOpen(false);
            if (mobileSearchOpen) setMobileSearchOpen(false);
          }}
          className={`p-2 rounded-lg bg-white/5 text-gray-300 hover:text-white transition cursor-pointer md:hidden relative ${quickActionsOpen ? 'text-[#7c5cff] bg-[#7c5cff]/10 border border-[#7c5cff]/30' : ''
            }`}
          title="Quick Actions"
        >
          {quickActionsOpen ? <X size={20} /> : <SlidersHorizontal size={20} />}
        </button>

        {/* Hamburger Menu Trigger */}
        <button
          onClick={() => {
            setMobileMenuOpen(!mobileMenuOpen);
            if (quickActionsOpen) setQuickActionsOpen(false);
            if (mobileSearchOpen) setMobileSearchOpen(false);
          }}
          className="p-2 rounded-lg bg-white/5 text-gray-300 hover:text-white transition cursor-pointer"
          title="Menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Quick Actions Dropdown */}
      <AnimatePresence>
        {quickActionsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 right-4 z-50 w-56 bg-[#0c101b] rounded-2xl p-4 shadow-2xl border border-white/15 flex flex-col gap-2.5 md:hidden"
          >
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Quick Actions</span>

            {/* 1. Connection Toggle */}
            <button
              onClick={() => {
                setManualOffline(!isManualOffline);
                setQuickActionsOpen(false);
              }}
              className={`flex items-center justify-between w-full px-3 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition ${isOffline
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                }`}
            >
              <span className="flex items-center gap-1.5">
                {isOffline ? <WifiOff size={14} /> : <Wifi size={14} />}
                {isOffline ? 'Offline' : 'Online'}
              </span>
              <span className="text-[9px] opacity-60">Toggle</span>
            </button>

            {/* 2. Add Anime for Mobile */}
            <button
              onClick={() => {
                setShowAddModal(true);
                setQuickActionsOpen(false);
              }}
              disabled={isOffline}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                : 'bg-purple-600/20 text-purple-300 hover:text-white border border-purple-500/30 cursor-pointer'
                }`}
            >
              <Plus size={14} />
              <span>Add Anime</span>
            </button>

            {/* 3. Add Manga for Mobile */}
            <button
              onClick={() => {
                setShowAddMangaModal(true);
                setQuickActionsOpen(false);
              }}
              disabled={isOffline}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                : 'bg-pink-600/20 text-pink-300 hover:text-white border border-pink-500/30 cursor-pointer'
                }`}
            >
              <BookOpen size={14} />
              <span>Add Manga</span>
            </button>

            {/* 4. Add Audio Stories for Mobile */}
            <button
              onClick={() => {
                setShowAddAudioStoryModal(true);
                setQuickActionsOpen(false);
              }}
              disabled={isOffline}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                : 'bg-cyan-600/20 text-cyan-300 hover:text-white border border-cyan-500/30 cursor-pointer'
                }`}
            >
              <Headphones size={14} />
              <span>Add Audio</span>
            </button>

            {/* 5. Add Movie for Mobile */}
            <button
              onClick={() => {
                setShowAddMovieModal(true);
                setQuickActionsOpen(false);
              }}
              disabled={isOffline}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                : 'bg-amber-600/20 text-amber-300 hover:text-white border border-amber-500/30 cursor-pointer'
                }`}
            >
              <Film size={14} />
              <span>Add Movie</span>
            </button>

            {/* Add Web-series for Mobile */}
            <button
              onClick={() => {
                setShowAddWebseriesModal(true);
                setQuickActionsOpen(false);
              }}
              disabled={isOffline}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                : 'bg-cyan-600/20 text-cyan-300 hover:text-white border border-cyan-500/30 cursor-pointer'
                }`}
            >
              <Tv size={14} />
              <span>Add Web-series</span>
            </button>

            {/* Add Watchlist for Mobile */}
            <button
              onClick={() => {
                setShowAddWatchlistModal(true);
                setQuickActionsOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition bg-amber-600/20 text-amber-300 hover:text-white border border-amber-500/30 cursor-pointer"
            >
              <Bookmark size={14} />
              <span>Add Watchlist</span>
            </button>

            {/* 6. Stream Page Link */}
            <Link
              href="/stream"
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600/80 to-indigo-600/80 hover:from-purple-600 hover:to-indigo-600 text-white border border-purple-500/30 transition shadow-md cursor-pointer"
            >
              <Wifi size={14} className="text-cyan-300 animate-pulse" />
              <span>Local Stream</span>
            </Link>

            {/* Achievements & Badges for Mobile */}
            <button
              onClick={() => {
                if (onOpenAchievements) onOpenAchievements();
                setQuickActionsOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 transition cursor-pointer text-xs font-bold"
            >
              <Trophy size={14} />
              <span>Achievements &amp; Badges</span>
            </button>

            {/* 7. Settings Trigger */}
            <button
              onClick={() => {
                setShowSettings(true);
                setQuickActionsOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer text-xs font-bold"
            >
              <Settings size={14} />
              <span>Settings</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
