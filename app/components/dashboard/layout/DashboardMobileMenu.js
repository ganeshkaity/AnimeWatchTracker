import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, X, Search, Bookmark, Tv, Film, Headphones,
  BookOpen, Sparkles, Play, StickyNote, Filter, CheckCircle2,
  Compass, Settings, Plus, WifiOff, Wifi, RefreshCw
} from 'lucide-react';
import CachedImage from '../../../utils/imageCache';
import { toFanartBigPreview } from '../../../lib/fanartUtils';
import { getInitials, GENRES_LIST } from '../utils/dashboardHelpers';

export default function DashboardMobileMenu({
  mobileMenuOpen,
  setMobileMenuOpen,
  search,
  setSearch,
  autocompleteMatches = [],
  autocompleteMangaMatches = [],
  autocompleteAudioStoryMatches = [],
  autocompleteMovieMatches = [],
  autocompleteWebseriesMatches = [],
  autocompleteWatchlistMatches = [],
  onSelectAnime,
  sortBy,
  setSortBy,
  filterBy,
  setFilterBy,
  selectedGenre,
  setSelectedGenre,
  handleSectionJump,
  setShowAddModal,
  setShowAddMangaModal,
  setShowAddAudioStoryModal,
  setShowAddMovieModal,
  setShowAddWebseriesModal,
  setShowSettings,
  isOffline,
  isSyncing,
}) {
  const router = useRouter();

  return (
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          {/* Backdrop Dim overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />

          {/* Floating Top Panel */}
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-20 inset-x-4 md:inset-x-8 max-w-6xl mx-auto z-50 glass-panel rounded-3xl p-6 md:p-8 shadow-2xl border border-white/15 backdrop-blur-2xl max-h-[85vh] overflow-y-auto no-scrollbar"
          >
            {/* Header inside floating modal */}
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/30">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-extrabold text-white tracking-wide">Quick Controls & Filters</h3>
                  <p className="text-[11px] text-gray-400">Search, filter catalog, and jump to sections</p>
                </div>
              </div>

              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer border border-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {/* Multi-Column Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* COLUMN 1: Search & Navigation */}
              <div className="space-y-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-pink-400 flex items-center gap-1.5">
                  <Search size={14} /> Catalog Search
                </span>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300/80 group-hover:text-white group-focus-within:text-cyan-400 z-10 pointer-events-none transition-colors drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" size={16} />
                  <input
                    type="text"
                    placeholder="Search title..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl liquid-glass-search placeholder-gray-400/80"
                  />
                  {/* Live Autocomplete Matches */}
                  {search.trim().length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#0f172a]/95 border border-white/15 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto no-scrollbar">
                      {autocompleteMatches.length === 0 && autocompleteMangaMatches.length === 0 && autocompleteAudioStoryMatches.length === 0 && autocompleteMovieMatches.length === 0 && autocompleteWebseriesMatches.length === 0 && autocompleteWatchlistMatches.length === 0 ? (
                        <div className="p-3 text-center text-xs text-gray-400">No matches found</div>
                      ) : (
                        <div className="p-1 space-y-1">
                          {autocompleteWatchlistMatches.slice(0, 3).map((item) => {
                            const coverImg = item.posterUrl || (item.images?.posters?.[0]?.url || item.backdropUrl || null);
                            return (
                              <div
                                key={`side-search-watchlist-${item.id}`}
                                onClick={() => {
                                  router.push(`/watchlist/${item.id}`);
                                  setSearch('');
                                  setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                              >
                                <div className="w-8 h-10 rounded overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                                  {coverImg ? (
                                    <img src={coverImg} alt={item.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <Bookmark size={14} className="text-amber-400" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-[7px] font-black text-black uppercase flex items-center gap-0.5">
                                      <Bookmark size={7} /> WL
                                    </span>
                                    {item.contentType && (
                                      <span className="px-1 py-0.2 rounded bg-white/10 text-[7px] font-bold text-gray-300 uppercase">
                                        {item.contentType}
                                      </span>
                                    )}
                                    <h4 className="font-bold text-xs text-white truncate">{item.title}</h4>
                                  </div>
                                  <p className="text-[9px] text-gray-400 truncate mt-0.5">
                                    {item.year ? `${item.year} • ` : ''}
                                    {item.status || 'Watchlist'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          {autocompleteWebseriesMatches.slice(0, 3).map((ws) => (
                            <div
                              key={`side-search-webseries-${ws.id}`}
                              onClick={() => {
                                router.push(`/webseries/${ws.id}`);
                                setSearch('');
                                setMobileMenuOpen(false);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                            >
                              <div className="w-8 h-10 rounded overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                                {ws.posterUrl || ws.posterPath ? (
                                  <img src={ws.posterUrl || ws.posterPath} alt={ws.title} className="w-full h-full object-cover" />
                                ) : (
                                  <Tv size={14} className="text-cyan-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="px-1 py-0.2 rounded bg-gradient-to-r from-cyan-500 to-blue-600 text-[7px] font-bold text-white uppercase">Series</span>
                                  <h4 className="font-bold text-xs text-white truncate">{ws.title}</h4>
                                </div>
                              </div>
                            </div>
                          ))}
                          {autocompleteMovieMatches.slice(0, 3).map((mov) => (
                            <div
                              key={`side-search-movie-${mov.id}`}
                              onClick={() => {
                                router.push(`/movies/${mov.id}`);
                                setSearch('');
                                setMobileMenuOpen(false);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                            >
                              <div className="w-8 h-10 rounded overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                                {mov.posterUrl || mov.posterPath ? (
                                  <img src={mov.posterUrl || mov.posterPath} alt={mov.title} className="w-full h-full object-cover" />
                                ) : (
                                  <Film size={14} className="text-amber-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-500 to-rose-600 text-[7px] font-bold text-black uppercase">Movie</span>
                                  <h4 className="font-bold text-xs text-white truncate">{mov.title}</h4>
                                </div>
                              </div>
                            </div>
                          ))}
                          {autocompleteAudioStoryMatches.slice(0, 3).map((a) => (
                            <div
                              key={`side-search-audio-${a.id}`}
                              onClick={() => {
                                router.push(`/audio-story/${a.id}`);
                                setSearch('');
                                setMobileMenuOpen(false);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                            >
                              <div className="w-8 h-10 rounded overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                                {a.thumbnailBase64 ? (
                                  <img src={a.thumbnailBase64} alt={a.title} className="w-full h-full object-cover" />
                                ) : a.thumbnailPath ? (
                                  <img src={`/api/image?path=${encodeURIComponent(a.thumbnailPath)}`} alt={a.title} className="w-full h-full object-cover" />
                                ) : (
                                  <Headphones size={14} className="text-cyan-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="px-1 py-0.2 rounded bg-gradient-to-r from-cyan-600 to-blue-600 text-[7px] font-bold text-white uppercase">Audio</span>
                                  <h4 className="font-bold text-xs text-white truncate">{a.title}</h4>
                                </div>
                              </div>
                            </div>
                          ))}
                          {autocompleteMangaMatches.slice(0, 3).map((m) => (
                            <div
                              key={`side-search-manga-${m.id}`}
                              onClick={() => {
                                router.push(`/manga/${m.id}`);
                                setSearch('');
                                setMobileMenuOpen(false);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-purple-950/40 border border-purple-500/20 transition cursor-pointer"
                            >
                              <div className="w-8 h-10 rounded overflow-hidden bg-purple-950/60 flex-shrink-0 relative flex items-center justify-center">
                                {m.thumbnailBase64 ? (
                                  <img src={toFanartBigPreview(m.thumbnailBase64)} alt={m.title} className="w-full h-full object-cover" />
                                ) : (
                                  <BookOpen size={14} className="text-purple-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="px-1 py-0.2 rounded bg-purple-600 text-[7px] font-bold text-white uppercase">Manga</span>
                                  <h4 className="font-bold text-xs text-white truncate">{m.title}</h4>
                                </div>
                              </div>
                            </div>
                          ))}
                          {autocompleteMatches.slice(0, 4).map((anime) => (
                            <div
                              key={anime.id}
                              onClick={() => {
                                onSelectAnime(anime.id);
                                setSearch('');
                                setMobileMenuOpen(false);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition cursor-pointer"
                            >
                              <div className="w-8 h-10 rounded overflow-hidden bg-white/5 flex-shrink-0 relative">
                                {anime.thumbnailBase64 || anime.thumbnailPath ? (
                                  <CachedImage
                                    src={anime.thumbnailBase64 && (anime.thumbnailBase64.startsWith('http') || anime.thumbnailBase64.startsWith('data:')) ? anime.thumbnailBase64 : `/api/image?path=${encodeURIComponent(anime.thumbnailPath || '')}`}
                                    alt={anime.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className={`w-full h-full bg-gradient-to-tr ${anime.coverGradient || 'from-violet-600 to-indigo-700'} flex items-center justify-center font-bold text-[7px] text-white/50`}>
                                    {getInitials(anime.title)}
                                  </div>
                                )}
                              </div>
                              <h4 className="font-bold text-xs text-white truncate">{anime.title}</h4>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 block pt-2">
                  Quick Jump
                </span>
                <nav className="flex flex-col gap-1 text-xs font-semibold text-gray-300">
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('hero'); }} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                    <Sparkles size={15} className="text-[#a855f7]" /> Spotlight Hero
                  </button>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('continue-watching'); }} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                    <Play size={15} className="text-[#7c5cff]" /> Continue Watching
                  </button>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('manga'); }} className="hover:text-purple-400 p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                    <BookOpen size={15} className="text-purple-400" /> Manga / Webtoons
                  </button>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('audios'); }} className="hover:text-cyan-400 p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                    <Headphones size={15} className="text-cyan-400" /> Audio Stories
                  </button>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('watchlist'); }} className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition text-left cursor-pointer w-full">
                    <span className="flex items-center gap-2"><Bookmark size={15} className="text-amber-400" /> Watchlist Section</span>
                  </button>
                  <Link href="/watchlist" onClick={() => setMobileMenuOpen(false)} className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition">
                    <span className="flex items-center gap-2"><Sparkles size={15} className="text-amber-400" /> All Watchlist (Library)</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('movies'); }} className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition text-left cursor-pointer w-full">
                    <span className="flex items-center gap-2"><Film size={15} className="text-amber-400" /> Movies Section</span>
                  </button>
                  <Link href="/movies" onClick={() => setMobileMenuOpen(false)} className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition">
                    <span className="flex items-center gap-2"><Sparkles size={15} className="text-amber-400" /> All Movies (Library)</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('webseries'); }} className="hover:text-cyan-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition text-left cursor-pointer w-full">
                    <span className="flex items-center gap-2"><Tv size={15} className="text-cyan-400" /> Web-series Section</span>
                  </button>
                  <Link href="/webseries" onClick={() => setMobileMenuOpen(false)} className="hover:text-cyan-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition">
                    <span className="flex items-center gap-2"><Sparkles size={15} className="text-cyan-400" /> All Web-series (Library)</span>
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('anime'); }} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                    <Tv size={15} className="text-cyan-400" /> Anime Catalog
                  </button>
                  <Link href="/animes" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition">
                    <span className="flex items-center gap-2"><Sparkles size={15} className="text-[#a855f7]" /> All Anime (Library)</span>
                    <span className="text-[10px] bg-[#7c5cff]/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>
                  <Link href="/notes" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                    <StickyNote size={15} className="text-emerald-400" /> Personal Notes
                  </Link>
                </nav>
              </div>

              {/* COLUMN 2: Catalog Filter Options */}
              <div className="space-y-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Filter size={14} /> Sort & Filter
                </span>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Sort Catalog By</label>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { id: 'recent', label: 'Recently Updated' },
                      { id: 'alpha', label: 'Alphabetical (A-Z)' },
                      { id: 'progress', label: 'Watch Progress' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setSortBy(opt.id)}
                        className={`w-full p-2.5 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between cursor-pointer ${sortBy === opt.id ? 'bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/40' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.id && <CheckCircle2 size={14} className="text-[#7c5cff]" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Show Status</label>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { id: 'all', label: 'All Catalog Shows' },
                      { id: 'active', label: 'Currently Watching' },
                      { id: 'completed', label: 'Completed Series' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setFilterBy(opt.id)}
                        className={`w-full p-2.5 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between cursor-pointer ${filterBy === opt.id ? 'bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/40' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                      >
                        <span>{opt.label}</span>
                        {filterBy === opt.id && <CheckCircle2 size={14} className="text-[#7c5cff]" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* COLUMN 3: Category & Genre Filters */}
              <div className="space-y-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#a855f7] flex items-center gap-1.5">
                  <Compass size={14} /> Genre Filter
                </span>

                <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto no-scrollbar p-1">
                  {GENRES_LIST.map((genre) => (
                    <button
                      key={genre}
                      onClick={() => {
                        setSelectedGenre(genre);
                      }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${selectedGenre === genre ? 'bg-[#7c5cff] text-white shadow-md' : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'}`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>

              {/* COLUMN 4: Actions & Account */}
              <div className="space-y-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Settings size={14} /> Quick Actions
                </span>

                <div className="space-y-2.5">
                  <button
                    onClick={() => { setMobileMenuOpen(false); setShowAddModal(true); }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold btn-accent flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus size={16} /> Track Anime Folder
                  </button>

                  <button
                    onClick={() => { setMobileMenuOpen(false); setShowAddMangaModal(true); }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <BookOpen size={16} /> Track Manga Folder
                  </button>

                  <button
                    onClick={() => { setMobileMenuOpen(false); setShowAddAudioStoryModal(true); }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Headphones size={16} /> Track Audio Folder
                  </button>

                  <button
                    onClick={() => { setMobileMenuOpen(false); setShowAddMovieModal(true); }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-rose-600 text-black flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Film size={16} /> Track Movie File
                  </button>

                  <button
                    onClick={() => { setMobileMenuOpen(false); setShowAddWebseriesModal(true); }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Tv size={16} /> Track Web-series Folder
                  </button>

                  <button
                    onClick={() => { setMobileMenuOpen(false); setShowSettings(true); }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Settings size={16} /> Settings & Player
                  </button>
                </div>

                {/* Sync / Network status card */}
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2 mt-4">
                  <div className="flex justify-between items-center text-gray-400 text-[11px]">
                    <span>Network Status:</span>
                    <span className={`font-bold flex items-center gap-1 ${isOffline ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {isOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
                      {isOffline ? 'Offline' : 'Online'}
                    </span>
                  </div>
                  {isSyncing && (
                    <div className="flex items-center gap-1.5 text-cyan-400 text-[10px]">
                      <RefreshCw size={12} className="animate-spin" /> Syncing with cloud...
                    </div>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
