import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, X, Bookmark, Tv, Film, Headphones,
  BookOpen, Sparkles, Play, StickyNote,
  Compass, Settings, Plus, WifiOff, Wifi, RefreshCw,
  FolderPlus, Layers
} from 'lucide-react';
import { GENRES_LIST } from '../utils/dashboardHelpers';
import { getLocalMovieGroups } from '../../../utils/localStore';

export default function DashboardMobileMenu({
  mobileMenuOpen,
  setMobileMenuOpen,
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
  const [movieGroups, setMovieGroups] = useState(() => (typeof window !== 'undefined' ? getLocalMovieGroups() || [] : []));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMovieGroups(getLocalMovieGroups() || []);
    }
    const handleGroupsUpdate = () => {
      setMovieGroups(getLocalMovieGroups() || []);
    };
    window.addEventListener('movie_groups_updated', handleGroupsUpdate);
    return () => {
      window.removeEventListener('movie_groups_updated', handleGroupsUpdate);
    };
  }, [mobileMenuOpen]);

  return (
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          {/* Backdrop Dim overlay */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          {/* Right-Hand Side Drawer Panel with fast simple slide animation */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm sm:max-w-md bg-[#090d16] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0d121f]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/30">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white tracking-wide">Quick Controls</h3>
                  <p className="text-[10px] text-gray-400">Jump to sections, explore genres & actions</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content inside Side Panel */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6">

              {/* 1. Genre Filter Section: clicking opens Results page with ?genre= */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#a855f7] flex items-center gap-1.5">
                  <Compass size={14} /> Genre Filter
                </span>
                <p className="text-[10px] text-gray-400">Select any genre to view all matching library content:</p>

                <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto no-scrollbar p-1 bg-black/30 rounded-2xl border border-white/5 p-2">
                  {GENRES_LIST.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (genre === 'All') {
                          router.push('/genres');
                        } else {
                          router.push(`/results?genre=${encodeURIComponent(genre)}`);
                        }
                      }}
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/5 hover:bg-[#7c5cff] text-gray-300 hover:text-white border border-white/5 hover:border-transparent transition cursor-pointer"
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Quick Jump Navigation */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Play size={14} /> Quick Jump & Sections
                </span>
                <nav className="flex flex-col gap-1 text-xs font-semibold text-gray-300">
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSectionJump('hero'); }}
                    className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full"
                  >
                    <Sparkles size={15} className="text-[#a855f7]" /> Spotlight Hero
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSectionJump('continue-watching'); }}
                    className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full"
                  >
                    <Play size={15} className="text-[#7c5cff]" /> Continue Watching
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSectionJump('movies'); }}
                    className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition text-left cursor-pointer w-full"
                  >
                    <span className="flex items-center gap-2"><Film size={15} className="text-amber-400" /> Movies Section</span>
                  </button>
                  <Link
                    href="/movies"
                    onClick={() => setMobileMenuOpen(false)}
                    className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-2"><Sparkles size={15} className="text-amber-400" /> All Movies (Library)</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>

                  {/* Movie Groups Subsection */}
                  <div className="my-1.5 p-2 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Layers size={13} className="text-amber-400" /> Movie Groups
                      </span>
                      <Link
                        href="/create-group"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-[10px] font-bold text-purple-300 hover:text-white flex items-center gap-1 bg-purple-500/20 hover:bg-purple-500/30 px-2 py-0.5 rounded-full border border-purple-500/30 transition cursor-pointer"
                        title="Create new group"
                      >
                        <Plus size={11} /> Add Group
                      </Link>
                    </div>

                    {/* All Groups (Overview) */}
                    <Link
                      href="/group"
                      onClick={() => setMobileMenuOpen(false)}
                      className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition"
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles size={14} className="text-amber-400" /> All Groups
                      </span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                        {movieGroups.length} {movieGroups.length === 1 ? 'Group' : 'Groups'}
                      </span>
                    </Link>

                    {/* Links to every individual created group */}
                    {movieGroups.length > 0 ? (
                      <div className="pl-2.5 space-y-0.5 border-l-2 border-amber-500/30 ml-2 pt-0.5">
                        {movieGroups.map((group) => {
                          const groupSlug = group.slug || group.id;
                          const count = Array.isArray(group.movies) ? group.movies.length : (group.movieCount || 0);

                          return (
                            <Link
                              key={group.id}
                              href={`/group/${encodeURIComponent(groupSlug)}`}
                              onClick={() => setMobileMenuOpen(false)}
                              className="p-1.5 rounded-lg hover:bg-white/5 hover:text-white text-gray-300 flex items-center justify-between transition group text-[11px]"
                            >
                              <span className="truncate flex items-center gap-1.5">
                                <FolderPlus size={12} className="text-amber-400/80 group-hover:text-amber-400 shrink-0" />
                                <span className="truncate">{group.name}</span>
                              </span>
                              <span className="text-[9px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded font-mono shrink-0 ml-1">
                                {count}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-2 py-1 text-[11px] text-gray-500 italic">
                        No groups yet — click "+ Add Group" to create one.
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSectionJump('webseries'); }}
                    className="hover:text-cyan-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition text-left cursor-pointer w-full"
                  >
                    <span className="flex items-center gap-2"><Tv size={15} className="text-cyan-400" /> Web-series Section</span>
                  </button>
                  <Link
                    href="/webseries"
                    onClick={() => setMobileMenuOpen(false)}
                    className="hover:text-cyan-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-2"><Sparkles size={15} className="text-cyan-400" /> All Web-series (Library)</span>
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSectionJump('anime'); }}
                    className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full"
                  >
                    <Tv size={15} className="text-cyan-400" /> Anime Catalog
                  </button>
                  <Link
                    href="/animes"
                    onClick={() => setMobileMenuOpen(false)}
                    className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-2"><Sparkles size={15} className="text-[#a855f7]" /> All Anime (Library)</span>
                    <span className="text-[10px] bg-[#7c5cff]/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSectionJump('manga'); }}
                    className="hover:text-pink-400 p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full"
                  >
                    <BookOpen size={15} className="text-pink-400" /> Manga / Webtoons
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); handleSectionJump('audios'); }}
                    className="hover:text-cyan-400 p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full"
                  >
                    <Headphones size={15} className="text-cyan-400" /> Audio Stories
                  </button>
                  <Link
                    href="/watchlist"
                    onClick={() => setMobileMenuOpen(false)}
                    className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-2"><Bookmark size={15} className="text-amber-400" /> All Watchlist</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                  </Link>
                  <Link
                    href="/notes"
                    onClick={() => setMobileMenuOpen(false)}
                    className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition"
                  >
                    <StickyNote size={15} className="text-emerald-400" /> Personal Notes
                  </Link>
                </nav>
              </div>

              {/* 3. Fast Media Actions */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Settings size={14} /> Quick Track & Actions
                </span>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowAddModal(true); }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold btn-accent flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus size={15} /> Track Anime Folder
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowAddMovieModal(true); }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-rose-600 text-black flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Film size={15} /> Track Movie File
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowAddWebseriesModal(true); }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Tv size={15} /> Track Web-series Folder
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowAddMangaModal(true); }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <BookOpen size={15} /> Track Manga Folder
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowAddAudioStoryModal(true); }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Headphones size={15} /> Track Audio Folder
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); router.push('/create-group'); }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <FolderPlus size={15} /> Create Movie Group
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); setShowSettings(true); }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Settings size={15} /> Settings & Player
                  </button>
                </div>
              </div>

              {/* 4. Network Status Card */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1.5">
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
