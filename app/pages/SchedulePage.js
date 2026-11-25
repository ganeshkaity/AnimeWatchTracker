"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  CalendarDays, Clock, Plus, Trash2, Edit3, Search, X, ArrowLeft,
  Moon, Sunrise, Sun, SunMedium, Sunset, Sparkles, MoonStar,
  Tv, Film, Bookmark, BookOpen, Headphones, Check, Layers, Cloud
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getUpcoming7Days,
  TIME_SLOTS,
  getWeeklySchedule,
  subscribeSchedule,
  addScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  clearScheduleSlot,
  clearScheduleDay,
  getSlotEstimatedMinutes,
  getDayEstimatedMinutes,
  getUpcoming7DaysEstimatedMinutes,
  formatDurationMinutes,
  getTodayDayId,
  estimateMediaUnitMinutes,
} from '../utils/scheduleStore';
import {
  getLocalAnimes,
  getLocalEpisodes,
  getLocalMovies,
  getLocalWebseries,
  getLocalWatchlist,
  getLocalMangas,
  getLocalAudioStories,
  isItemInVault,
} from '../utils/localStore';
import { toFanartPreview } from '../lib/fanartUtils';

const SLOT_ICONS = {
  midnight: Moon,
  early_morning: Sunrise,
  morning: Sun,
  day: SunMedium,
  noon: Clock,
  afternoon: Sunset,
  evening: Sparkles,
  night: MoonStar,
};

const MEDIA_TYPE_META = {
  anime: { label: 'Anime', color: 'bg-[#7c5cff]/20 text-purple-300 border-[#7c5cff]/40', icon: Tv },
  movie: { label: 'Movie', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: Film },
  webseries: { label: 'Web Series', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', icon: Tv },
  watchlist: { label: 'Watchlist', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: Bookmark },
  manga: { label: 'Manga', color: 'bg-pink-500/20 text-pink-300 border-pink-500/40', icon: BookOpen },
  audiostory: { label: 'Audio', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40', icon: Headphones },
};

function isLibraryItemWatched(raw, mediaType) {
  if (!raw) return false;
  if (raw.watched || raw.completed || raw.watchStatus === 'Completed') return true;
  if (typeof raw.progressPercent === 'number' && raw.progressPercent >= 100) return true;
  if (mediaType === 'movie' && typeof raw.watchProgress === 'number' && raw.watchProgress >= 95) return true;
  if (mediaType === 'anime') {
    const eps = getLocalEpisodes(raw.id);
    if (Array.isArray(eps) && eps.length > 0 && eps.every((e) => !!e.isWatched)) return true;
  }
  return false;
}

function getMediaHref(mediaType, mediaId) {
  if (!mediaId) return '#';
  switch (mediaType) {
    case 'movie': return `/movies/${mediaId}`;
    case 'webseries': return `/webseries/${mediaId}`;
    case 'watchlist': return `/watchlist/${mediaId}`;
    case 'manga': return `/manga/${mediaId}`;
    case 'audiostory': return `/audio-story/${mediaId}`;
    case 'anime':
    default: return `/${mediaId}`;
  }
}

export default function SchedulePage() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const upcomingDays = useMemo(() => getUpcoming7Days(), []);
  const todayId = getTodayDayId();

  const initialDay = useMemo(() => {
    const paramDay = searchParams?.get('day');
    if (paramDay && upcomingDays.some((d) => d.id === paramDay)) return paramDay;
    return todayId;
  }, [searchParams, upcomingDays, todayId]);

  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [schedule, setSchedule] = useState(() => getWeeklySchedule());

  // Library items
  const [libraryItems, setLibraryItems] = useState([]);

  // Add Modal State
  const [addModalSlot, setAddModalSlot] = useState(null);
  const [libSearch, setLibSearch] = useState('');
  const [libFilter, setLibFilter] = useState('all');
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(false);
  const [pickedItem, setPickedItem] = useState(null);
  const [addCount, setAddCount] = useState(1);
  const [addUnitMin, setAddUnitMin] = useState(24);
  const [addNote, setAddNote] = useState('');

  // Edit Modal State
  const [editingTarget, setEditingTarget] = useState(null);
  const [editDayId, setEditDayId] = useState('');
  const [editSlotId, setEditSlotId] = useState('');
  const [editCount, setEditCount] = useState(1);
  const [editUnitMin, setEditUnitMin] = useState(24);
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    const paramDay = searchParams?.get('day');
    if (paramDay && upcomingDays.some((d) => d.id === paramDay)) {
      setSelectedDay(paramDay);
    }
  }, [searchParams, upcomingDays]);

  useEffect(() => {
    document.title = 'Upcoming 7-Day Schedule - GaneshSpace';
    const unsubscribe = subscribeSchedule(currentUser?.uid);

    const loadLibrary = () => {
      const animes = (getLocalAnimes() || []).map((a) => ({
        id: a.id,
        mediaType: 'anime',
        title: a.title || a.name || 'Untitled Anime',
        poster: a.coverUrl || a.posterUrl || a.bannerUrl || '',
        raw: a,
      }));
      const movies = (getLocalMovies() || []).map((m) => ({
        id: m.id,
        mediaType: 'movie',
        title: m.title || 'Untitled Movie',
        poster: m.posterUrl || m.posterPath || '',
        raw: m,
      }));
      const webseries = (getLocalWebseries() || []).map((w) => ({
        id: w.id,
        mediaType: 'webseries',
        title: w.title || 'Untitled Series',
        poster: w.posterUrl || w.coverUrl || '',
        raw: w,
      }));
      const watchlist = (getLocalWatchlist() || []).map((wl) => ({
        id: wl.id,
        mediaType: 'watchlist',
        title: wl.title || 'Untitled',
        poster: wl.posterUrl || wl.coverUrl || '',
        raw: wl,
      }));
      const mangas = (getLocalMangas() || []).map((mg) => ({
        id: mg.id,
        mediaType: 'manga',
        title: mg.title || 'Untitled Manga',
        poster: mg.thumbnailBase64 || mg.coverUrl || '',
        raw: mg,
      }));
      const audios = (getLocalAudioStories() || []).map((au) => ({
        id: au.id,
        mediaType: 'audiostory',
        title: au.title || 'Untitled Audio',
        poster: au.thumbnailBase64 || (au.thumbnailPath ? `/api/image?path=${encodeURIComponent(au.thumbnailPath)}` : ''),
        raw: au,
      }));

      setLibraryItems([...animes, ...movies, ...webseries, ...watchlist, ...mangas, ...audios]);
    };

    loadLibrary();
    const handleScheduleUpdate = (e) => {
      setSchedule(e?.detail || getWeeklySchedule());
    };
    window.addEventListener('weekly_schedule_updated', handleScheduleUpdate);
    return () => {
      unsubscribe();
      window.removeEventListener('weekly_schedule_updated', handleScheduleUpdate);
    };
  }, [currentUser?.uid]);

  const filteredLibrary = useMemo(() => {
    const q = libSearch.trim().toLowerCase();
    return libraryItems.filter((item) => {
      if (isItemInVault(item.id)) return false;
      if (libFilter !== 'all' && item.mediaType !== libFilter) return false;
      if (showUnwatchedOnly && isLibraryItemWatched(item.raw, item.mediaType)) return false;
      if (q && !item.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [libraryItems, libFilter, libSearch, showUnwatchedOnly]);

  const currentDaySchedule = schedule?.[selectedDay] || {};
  const dayTotalMinutes = getDayEstimatedMinutes(currentDaySchedule);
  const weekTotalMinutes = getUpcoming7DaysEstimatedMinutes(schedule);
  const selectedDayMeta = upcomingDays.find((d) => d.id === selectedDay) || upcomingDays[0];

  const openAddModal = (slotId) => {
    setAddModalSlot(slotId);
    setPickedItem(null);
    setLibSearch('');
    setLibFilter('all');
    setAddCount(1);
    setAddUnitMin(24);
    setAddNote('');
  };

  const handleSelectLibraryItem = (item) => {
    setPickedItem(item);
    const est = estimateMediaUnitMinutes(item.raw, item.mediaType);
    setAddCount(1);
    setAddUnitMin(est);
    setAddNote('');
  };

  const handleConfirmAdd = () => {
    if (!addModalSlot || !pickedItem) return;
    const count = Math.max(1, Number(addCount) || 1);
    const perUnit = Math.max(1, Number(addUnitMin) || 1);
    const updated = addScheduleItem(
      selectedDay,
      addModalSlot,
      {
        mediaId: pickedItem.id,
        mediaType: pickedItem.mediaType,
        title: pickedItem.title,
        poster: pickedItem.poster,
        episodeCount: count,
        durationPerUnitMin: perUnit,
        totalMinutes: count * perUnit,
        note: addNote,
      },
      currentUser?.uid
    );
    setSchedule(updated);
    setAddModalSlot(null);
    setPickedItem(null);
  };

  const openEditModal = (dayId, slotId, entry) => {
    setEditingTarget({ dayId, slotId, entry });
    setEditDayId(dayId);
    setEditSlotId(slotId);
    setEditCount(entry.episodeCount || 1);
    setEditUnitMin(entry.durationPerUnitMin || 24);
    setEditNote(entry.note || '');
  };

  const handleSaveEdit = () => {
    if (!editingTarget) return;
    const count = Math.max(1, Number(editCount) || 1);
    const perUnit = Math.max(1, Number(editUnitMin) || 1);
    const updated = updateScheduleItem(
      editingTarget.dayId,
      editingTarget.slotId,
      editingTarget.entry.entryId,
      {
        episodeCount: count,
        durationPerUnitMin: perUnit,
        totalMinutes: count * perUnit,
        note: editNote,
      },
      editDayId,
      editSlotId,
      currentUser?.uid
    );
    setSchedule(updated);
    setEditingTarget(null);
  };

  const handleDeleteEntry = (slotId, entryId) => {
    const updated = deleteScheduleItem(selectedDay, slotId, entryId, currentUser?.uid);
    setSchedule(updated);
  };

  const handleClearSlot = (slotId) => {
    const updated = clearScheduleSlot(selectedDay, slotId, currentUser?.uid);
    setSchedule(updated);
  };

  const handleClearDay = () => {
    const updated = clearScheduleDay(selectedDay, currentUser?.uid);
    setSchedule(updated);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24 md:pb-12">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 hover:text-white transition"
              aria-label="Back to Home"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight flex items-center gap-2">
                <span>Upcoming 7-Day Schedule</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-xs">
              <Cloud size={13} className="text-[#65e335]" />
              <span className="text-gray-400">Synced to DB</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-xs">
              <Clock size={13} className="text-[#7c5cff]" />
              <span className="text-gray-400">7-Day Total:</span>
              <span className="font-bold text-white">{formatDurationMinutes(weekTotalMinutes)}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Upcoming 7 Days Selector Tabs */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
          {upcomingDays.map((day) => {
            const isSelected = day.id === selectedDay;
            const dayMins = getDayEstimatedMinutes(schedule?.[day.id]);
            const itemCount = TIME_SLOTS.reduce(
              (acc, s) => acc + (schedule?.[day.id]?.[s.id]?.length || 0),
              0
            );

            return (
              <button
                key={day.id}
                type="button"
                onClick={() => {
                  setSelectedDay(day.id);
                  router.replace(`/schedule?day=${day.id}`, { scroll: false });
                }}
                className={`relative flex flex-col items-center justify-center py-2.5 px-1 sm:px-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-black border-white shadow-lg'
                    : day.isToday
                    ? 'bg-[#65e335]/10 text-[#65e335] border-[#65e335]/50 hover:bg-[#65e335]/20'
                    : 'bg-white/[0.04] text-gray-300 border-white/10 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span className="text-[11px] sm:text-xs font-extrabold tracking-wider">{day.short}</span>
                <span className={`text-[9px] font-semibold ${isSelected ? 'text-black/75' : 'text-gray-400'}`}>
                  {day.dateLabel}
                </span>
                <span className={`text-[9px] sm:text-[10px] mt-0.5 font-semibold ${
                  isSelected ? 'text-black/70' : 'text-gray-500'
                }`}>
                  {dayMins > 0 ? formatDurationMinutes(dayMins) : `${itemCount} items`}
                </span>
                {day.isToday && (
                  <span className="absolute -top-1.5 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase bg-[#65e335] text-black">
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Day Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#65e335]/15 border border-[#65e335]/30 flex items-center justify-center text-[#65e335]">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                {selectedDayMeta.label} ({selectedDayMeta.dateLabel})
              </h2>
              <p className="text-xs text-gray-400">
                Estimated Day Duration:{' '}
                <span className="text-white font-bold">{formatDurationMinutes(dayTotalMinutes)}</span>
              </p>
            </div>
          </div>

          {dayTotalMinutes > 0 && (
            <button
              type="button"
              onClick={handleClearDay}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Clear {selectedDayMeta.short}</span>
            </button>
          )}
        </div>

        {/* 8 Time Slots */}
        <div className="space-y-4">
          {TIME_SLOTS.map((slot) => {
            const SlotIcon = SLOT_ICONS[slot.id] || Clock;
            const slotItems = currentDaySchedule?.[slot.id] || [];
            const slotMinutes = getSlotEstimatedMinutes(slotItems);

            return (
              <section
                key={slot.id}
                className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden"
              >
                {/* Slot Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/[0.03] border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-gray-200">
                      <SlotIcon size={17} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-white">{slot.label}</h3>
                        {slotItems.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-gray-200">
                            {slotItems.length} {slotItems.length === 1 ? 'item' : 'items'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">{slot.timeRange}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 border border-white/10 text-xs">
                      <Clock size={12} className={slotMinutes > 0 ? 'text-[#65e335]' : 'text-gray-500'} />
                      <span className="text-gray-400 text-[11px]">Est:</span>
                      <span className={`font-bold ${slotMinutes > 0 ? 'text-white' : 'text-gray-500'}`}>
                        {formatDurationMinutes(slotMinutes)}
                      </span>
                    </div>

                    {slotItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClearSlot(slot.id)}
                        title="Clear slot"
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 border border-white/10 transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openAddModal(slot.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black hover:bg-gray-200 text-xs font-bold transition cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* Slot Items List */}
                {slotItems.length > 0 ? (
                  <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {slotItems.map((entry) => {
                      const typeMeta = MEDIA_TYPE_META[entry.mediaType] || MEDIA_TYPE_META.anime;
                      const posterSrc = entry.poster ? toFanartPreview(entry.poster) : '';
                      const href = getMediaHref(entry.mediaType, entry.mediaId);

                      return (
                        <div
                          key={entry.entryId}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-black/60 border border-white/10 hover:border-white/20 transition group"
                        >
                          <Link
                            href={href}
                            className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10"
                          >
                            {posterSrc ? (
                              <img
                                src={posterSrc}
                                alt={entry.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-500">
                                <Layers size={16} />
                              </div>
                            )}
                          </Link>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${typeMeta.color}`}>
                                {typeMeta.label}
                              </span>
                              <span className="text-[10px] font-semibold text-gray-400">
                                {entry.episodeCount || 1}× ({entry.durationPerUnitMin || 24}m) ={' '}
                                <span className="text-white font-bold">
                                  {formatDurationMinutes(entry.totalMinutes)}
                                </span>
                              </span>
                            </div>

                            <Link
                              href={href}
                              className="block text-sm font-bold text-white truncate hover:text-[#65e335] transition-colors"
                              title={entry.title}
                            >
                              {entry.title}
                            </Link>

                            {entry.note && (
                              <p className="text-[11px] text-gray-400 truncate">{entry.note}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditModal(selectedDay, slot.id, entry)}
                              title="Edit / Move"
                              className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.14] text-gray-300 hover:text-white transition cursor-pointer"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(slot.id, entry.entryId)}
                              title="Delete"
                              className="p-2 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-gray-300 hover:text-rose-300 transition cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-xs text-gray-500 flex items-center justify-between">
                    <span>No content scheduled for {slot.label.toLowerCase()}.</span>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {/* ADD CONTENT MODAL */}
      {addModalSlot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-[#0b0b0b] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Add to {selectedDayMeta.label} ({selectedDayMeta.dateLabel}) • {TIME_SLOTS.find((s) => s.id === addModalSlot)?.label}
                </h3>
                <p className="text-xs text-gray-400">Choose any content from your library</p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalSlot(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {!pickedItem ? (
              <div className="p-4 flex-1 overflow-hidden flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={libSearch}
                      onChange={(e) => setLibSearch(e.target.value)}
                      placeholder="Search anime, movies, web series, watchlist..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUnwatchedOnly((prev) => !prev)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border whitespace-nowrap transition cursor-pointer ${
                      showUnwatchedOnly
                        ? 'bg-[#65e335] text-black border-[#65e335]'
                        : 'bg-white/[0.06] text-gray-300 border-white/10 hover:bg-white/[0.12]'
                    }`}
                  >
                    {showUnwatchedOnly ? 'Unwatched Only' : 'All Content'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'anime', label: 'Anime' },
                    { id: 'movie', label: 'Movies' },
                    { id: 'webseries', label: 'Web Series' },
                    { id: 'watchlist', label: 'Watchlist' },
                    { id: 'manga', label: 'Manga' },
                    { id: 'audiostory', label: 'Audio' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setLibFilter(tab.id)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                        libFilter === tab.id
                          ? 'bg-white text-black border-white'
                          : 'bg-white/[0.05] text-gray-300 border-white/10 hover:bg-white/[0.1]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredLibrary.length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-500">
                      No matching library items found.
                    </div>
                  ) : (
                    filteredLibrary.map((item) => {
                      const meta = MEDIA_TYPE_META[item.mediaType] || MEDIA_TYPE_META.anime;
                      const posterSrc = item.poster ? toFanartPreview(item.poster) : '';
                      return (
                        <button
                          key={`${item.mediaType}-${item.id}`}
                          type="button"
                          onClick={() => handleSelectLibraryItem(item)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-left transition cursor-pointer"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                            {posterSrc ? (
                              <img src={posterSrc} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-500">
                                <Layers size={14} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border mb-1 ${meta.color}`}>
                              {meta.label}
                            </span>
                            <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                          </div>
                          <Plus size={16} className="text-gray-400 flex-shrink-0" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.05] border border-white/10">
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                    {pickedItem.poster ? (
                      <img src={toFanartPreview(pickedItem.poster)} alt={pickedItem.title} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400">
                      {MEDIA_TYPE_META[pickedItem.mediaType]?.label}
                    </span>
                    <h4 className="text-base font-extrabold text-white truncate">{pickedItem.title}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickedItem(null)}
                    className="text-xs text-gray-400 hover:text-white underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Episodes / Units
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={addCount}
                      onChange={(e) => setAddCount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Est. Minutes Each
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={addUnitMin}
                      onChange={(e) => setAddUnitMin(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-sm text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    placeholder="e.g. Episodes 1-3, Director's Cut..."
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-sm text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div className="text-xs text-gray-400">
                    Session Est:{' '}
                    <span className="text-[#65e335] font-extrabold text-sm">
                      {formatDurationMinutes((Number(addCount) || 1) * (Number(addUnitMin) || 1))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddModalSlot(null)}
                      className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-gray-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmAdd}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black hover:bg-gray-200 text-xs font-extrabold cursor-pointer"
                    >
                      <Check size={14} />
                      <span>Add to Schedule</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT / MODIFY MODAL */}
      {editingTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0b0b0b] border border-white/15 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-base font-extrabold text-white truncate pr-2">
                Edit: {editingTarget.entry.title}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTarget(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Day</label>
                  <select
                    value={editDayId}
                    onChange={(e) => setEditDayId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#141414] border border-white/15 text-sm text-white focus:outline-none"
                  >
                    {upcomingDays.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.short} ({d.dateLabel}){d.isToday ? ' • Today' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Time Slot</label>
                  <select
                    value={editSlotId}
                    onChange={(e) => setEditSlotId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#141414] border border-white/15 text-sm text-white focus:outline-none"
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Episodes / Units
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={editCount}
                    onChange={(e) => setEditCount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-sm text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Minutes Each
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={editUnitMin}
                    onChange={(e) => setEditUnitMin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-sm text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Note</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Optional note..."
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-sm text-white placeholder-gray-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <div className="text-xs text-gray-400">
                  Est:{' '}
                  <span className="text-[#65e335] font-extrabold text-sm">
                    {formatDurationMinutes((Number(editCount) || 1) * (Number(editUnitMin) || 1))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTarget(null)}
                    className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-gray-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black hover:bg-gray-200 text-xs font-extrabold cursor-pointer"
                  >
                    <Check size={14} />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
