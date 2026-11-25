"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Film, Tv,
  Star, Bookmark, Check, ExternalLink, X, Sparkles, Loader2
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { getLocalWatchlist, upsertLocalWatchlist, getUserId } from '../utils/localStore';

const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

function buildAllowedMonths() {
  const now = new Date();
  const baseYear = now.getFullYear();
  const baseMonth = now.getMonth(); // 0-indexed
  const list = [];

  for (let offset = -3; offset <= 6; offset++) {
    const d = new Date(baseYear, baseMonth + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    list.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      year: y,
      month: m,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      shortLabel: `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`,
      isCurrent: offset === 0,
      offset,
    });
  }
  return list;
}

function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ReleaseCalendarPage() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const allowedMonths = useMemo(() => buildAllowedMonths(), []);
  const currentMonthIndex = useMemo(
    () => Math.max(0, allowedMonths.findIndex((m) => m.isCurrent)),
    [allowedMonths]
  );

  const [selectedIdx, setSelectedIdx] = useState(currentMonthIndex);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'movie' | 'anime'

  // Strict per-month lazy cache: only fetched when the user opens that month
  const monthCacheRef = useRef(new Map());
  const [monthItems, setMonthItems] = useState([]);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Watchlist tracking for instant "In Watchlist" / "Add to Watchlist" state
  const [watchlist, setWatchlist] = useState(() => (typeof window !== 'undefined' ? getLocalWatchlist() || [] : []));
  const [addingId, setAddingId] = useState(null);

  // Hover preview popover & Day detail modal
  const [hoveredDay, setHoveredDay] = useState(null); // { dateStr, items, rect }
  const [selectedDayModal, setSelectedDayModal] = useState(null); // { dateStr, dayNum, items }
  const hoverTimerRef = useRef(null);

  const activeMonth = allowedMonths[selectedIdx] || allowedMonths[0];
  const todayStr = useMemo(() => getTodayDateStr(), []);

  useEffect(() => {
    document.title = 'Release Calendar - GaneshSpace';
    const syncWl = () => setWatchlist(getLocalWatchlist() || []);
    window.addEventListener('watchanime_store_hydrated', syncWl);
    return () => window.removeEventListener('watchanime_store_hydrated', syncWl);
  }, []);

  // Fetch ONLY the active month on demand when opened
  useEffect(() => {
    let isMounted = true;
    const key = activeMonth.key;

    if (monthCacheRef.current.has(key)) {
      setMonthItems(monthCacheRef.current.get(key));
      setLoadingMonth(false);
      setFetchError('');
      return;
    }

    setLoadingMonth(true);
    setFetchError('');
    setHoveredDay(null);

    const loadMonth = async () => {
      try {
        const res = await fetch(`/api/release-calendar?year=${activeMonth.year}&month=${activeMonth.month}`);
        const json = await res.json();
        if (!isMounted) return;

        if (res.ok && json?.success && Array.isArray(json.items)) {
          monthCacheRef.current.set(key, json.items);
          setMonthItems(json.items);
        } else {
          setMonthItems([]);
          setFetchError(json?.error || 'Could not load releases for this month.');
        }
      } catch (err) {
        if (isMounted) {
          setMonthItems([]);
          setFetchError('Network error while loading this month.');
        }
      } finally {
        if (isMounted) setLoadingMonth(false);
      }
    };

    void loadMonth();
    return () => {
      isMounted = false;
    };
  }, [activeMonth]);

  // Filter items by selected type ('all' | 'movie' | 'anime')
  const filteredMonthItems = useMemo(() => {
    if (typeFilter === 'all') return monthItems;
    return monthItems.filter((it) => it.mediaType === typeFilter);
  }, [monthItems, typeFilter]);

  // Group items by YYYY-MM-DD
  const itemsByDate = useMemo(() => {
    const map = new Map();
    for (const item of filteredMonthItems) {
      const key = item.releaseDate;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }, [filteredMonthItems]);

  // Build calendar cells for activeMonth
  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(activeMonth.year, activeMonth.month - 1, 1).getDay();
    const daysInMonth = new Date(activeMonth.year, activeMonth.month, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ empty: true, key: `pad-start-${i}` });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${activeMonth.key}-${String(day).padStart(2, '0')}`;
      cells.push({
        empty: false,
        key: dateStr,
        day,
        dateStr,
        isToday: dateStr === todayStr,
        items: itemsByDate.get(dateStr) || [],
      });
    }
    const remainder = cells.length % 7;
    if (remainder !== 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        cells.push({ empty: true, key: `pad-end-${i}` });
      }
    }
    return cells;
  }, [activeMonth, itemsByDate, todayStr]);

  const findExistingWatchlist = useCallback(
    (item) => {
      if (!item) return null;
      const slug = slugify(item.title);
      return watchlist.find(
        (w) =>
          (item.tmdbId && w.tmdbId === item.tmdbId) ||
          (item.anilistId && w.anilistId === item.anilistId) ||
          w.id === slug ||
          (w.title || '').toLowerCase().trim() === (item.title || '').toLowerCase().trim()
      );
    },
    [watchlist]
  );

  const handleAddToWatchlist = async (item) => {
    const existing = findExistingWatchlist(item);
    if (existing) {
      router.push(`/watchlist/${existing.id}`);
      return;
    }

    setAddingId(item.uid);
    try {
      const cleanSlug = slugify(item.title) || `wl-${Date.now()}`;
      const watchlistItem = {
        id: cleanSlug,
        slug: cleanSlug,
        tmdbId: item.tmdbId || null,
        anilistId: item.anilistId || null,
        contentType: item.mediaType === 'anime' ? 'anime' : 'movie',
        title: item.title,
        originalTitle: item.originalTitle || '',
        year: item.year || '',
        releaseDate: item.releaseDate || '',
        rating: item.rating || 0,
        overview: item.overview || '',
        genres: Array.isArray(item.genres) ? item.genres : [],
        posterUrl: item.posterUrl || '',
        backdropUrl: item.backdropUrl || '',
        logoUrl: '',
        cast: [],
        images: { posters: [], backdrops: [], logos: [] },
        videos: [],
        seasonsCount: 0,
        episodesCount: item.episodesCount || 0,
        seasons: [],
        streamProviders: { free: [], subscription: [], rent: [], buy: [] },
        status: 'Plan to Watch',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      upsertLocalWatchlist(watchlistItem);
      setWatchlist(getLocalWatchlist() || []);

      if (db) {
        const uid = currentUser?.uid || getUserId();
        if (uid) {
          await setDoc(doc(db, 'users', uid, 'watchlist', watchlistItem.id), watchlistItem, { merge: true });
        }
      }
    } catch (err) {
      console.error('[ReleaseCalendar] Failed to add to watchlist:', err);
    } finally {
      setAddingId(null);
    }
  };

  const handleCellMouseEnter = (cell, e) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (!cell.items || cell.items.length === 0) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => {
      setHoveredDay({ dateStr: cell.dateStr, day: cell.day, items: cell.items, rect });
    }, 180);
  };

  const handleCellMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredDay(null);
  };

  const formatModalDate = (dateStr) => {
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24 md:pb-14">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 md:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
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
                <span>Release Calendar</span>
              </h1>
            </div>
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1 bg-white/[0.05] p-1 rounded-xl border border-white/10 text-xs font-bold">
            {[
              { id: 'all', label: 'All' },
              { id: 'movie', label: 'Movies', icon: Film },
              { id: 'anime', label: 'Anime', icon: Tv },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                    typeFilter === tab.id
                      ? 'bg-white text-black shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {Icon && <Icon size={12} />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 md:px-8 py-5 space-y-5">
        {/* Month Navigator & Quick Month Strip */}
        <div className="flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg sm:text-2xl font-black tracking-tight text-white">
                {activeMonth.label}
              </h2>
              {activeMonth.isCurrent && (
                <span className="px-2 py-0.5 rounded-full bg-[#65e335]/15 border border-[#65e335]/40 text-[#65e335] text-[10px] font-extrabold uppercase">
                  Current
                </span>
              )}
              {!loadingMonth && (
                <span className="text-xs text-gray-400 font-medium hidden sm:inline">
                  • {filteredMonthItems.length} releases
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={selectedIdx <= 0}
                onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
                className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedIdx(currentMonthIndex)}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-bold text-gray-200 transition cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                disabled={selectedIdx >= allowedMonths.length - 1}
                onClick={() => setSelectedIdx((i) => Math.min(allowedMonths.length - 1, i + 1))}
                className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Next Month"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>

          {/* 10-Month Window Strip (-3 to +6 months) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {allowedMonths.map((m, idx) => {
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-white text-black border-white shadow'
                      : m.isCurrent
                      ? 'bg-[#65e335]/10 text-[#65e335] border-[#65e335]/40 hover:bg-[#65e335]/20'
                      : 'bg-black/60 text-gray-400 border-white/10 hover:text-white hover:border-white/25'
                  }`}
                >
                  {m.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error notice */}
        {fetchError && (
          <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300">
            {fetchError}
          </div>
        )}

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 text-center">
          {WEEKDAY_NAMES.map((d) => (
            <div
              key={d}
              className="py-1.5 text-[10px] sm:text-xs font-extrabold tracking-widest text-gray-400 uppercase"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Month Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeMonth.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-7 gap-1.5 sm:gap-2.5"
          >
            {calendarCells.map((cell) => {
              if (cell.empty) {
                return (
                  <div
                    key={cell.key}
                    className="min-h-[84px] sm:min-h-[132px] md:min-h-[154px] rounded-xl sm:rounded-2xl bg-white/[0.015] border border-white/[0.04]"
                  />
                );
              }

              const dayItems = cell.items || [];
              const firstItem = dayItems[0] || null;
              const secondItem = dayItems[1] || null;
              const hasMultiple = dayItems.length > 1;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    if (!loadingMonth) {
                      setSelectedDayModal({
                        dateStr: cell.dateStr,
                        day: cell.day,
                        items: dayItems,
                      });
                    }
                  }}
                  onMouseEnter={(e) => handleCellMouseEnter(cell, e)}
                  onMouseLeave={handleCellMouseLeave}
                  className={`group relative min-h-[84px] sm:min-h-[132px] md:min-h-[154px] rounded-xl sm:rounded-2xl p-1.5 sm:p-2 flex flex-col justify-between text-left transition-all duration-200 overflow-hidden cursor-pointer ${
                    cell.isToday
                      ? 'bg-[#65e335]/[0.07] border-2 border-[#65e335] shadow-[0_0_20px_rgba(101,227,53,0.18)]'
                      : dayItems.length > 0
                      ? 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 hover:border-white/35'
                      : 'bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] hover:border-white/15'
                  }`}
                >
                  {/* Top Row: Day Number + Release Count Badge */}
                  <div className="flex items-center justify-between w-full z-20">
                    <span
                      className={`text-[11px] sm:text-xs font-extrabold leading-none px-1.5 py-0.5 rounded-md ${
                        cell.isToday
                          ? 'bg-[#65e335] text-black'
                          : dayItems.length > 0
                          ? 'text-white bg-black/50'
                          : 'text-gray-500'
                      }`}
                    >
                      {cell.day}
                    </span>

                    {dayItems.length > 1 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-purple-600/90 text-white text-[9px] font-black shadow">
                        {dayItems.length}
                      </span>
                    )}
                  </div>

                  {/* Center / Body: Skeleton OR Nothing Found OR Poster OR 2-Poster Stack */}
                  {loadingMonth ? (
                    <div className="flex-1 w-full mt-1.5 rounded-lg bg-white/[0.05] animate-pulse" />
                  ) : dayItems.length === 0 ? (
                    <div className="flex-1 w-full flex items-center justify-center px-1">
                      <span className="hidden sm:inline text-[10px] font-medium text-gray-600 group-hover:text-gray-400 transition-colors text-center">
                        Nothing found
                      </span>
                    </div>
                  ) : hasMultiple ? (
                    /* 2-Poster Layered Stack */
                    <div className="relative flex-1 w-full flex items-center justify-center mt-1 mb-0.5">
                      {/* Back Poster (tilted right) */}
                      <div className="hidden sm:block absolute w-[54%] aspect-[2/3] rounded-lg overflow-hidden border border-white/25 bg-zinc-900 shadow-lg translate-x-2.5 -translate-y-0.5 rotate-6 opacity-80 group-hover:translate-x-3.5 group-hover:rotate-12 transition-transform duration-300">
                        {secondItem?.posterUrl && (
                          <img
                            src={secondItem.posterUrl}
                            alt={secondItem.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      {/* Front Poster (tilted slightly left on hover) */}
                      <div className="relative w-[82%] sm:w-[58%] aspect-[2/3] rounded-lg overflow-hidden border border-white/30 bg-zinc-900 shadow-xl group-hover:-translate-x-1 group-hover:-rotate-3 transition-transform duration-300 z-10">
                        {firstItem?.posterUrl ? (
                          <img
                            src={firstItem.posterUrl}
                            alt={firstItem.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-1 text-[9px] font-bold text-center text-white">
                            {firstItem?.title}
                          </div>
                        )}
                        <div className="sm:hidden absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/85 text-[8px] font-black text-white">
                          +{dayItems.length - 1}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Single Item Poster */
                    <div className="relative flex-1 w-full mt-1 rounded-lg overflow-hidden bg-zinc-900 border border-white/10">
                      {firstItem?.posterUrl ? (
                        <>
                          <img
                            src={firstItem.posterUrl}
                            alt={firstItem.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="hidden sm:block absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-1.5">
                            <p className="text-[10px] font-bold text-white line-clamp-1 leading-tight">
                              {firstItem.title}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-1.5 text-[10px] font-bold text-center text-gray-200">
                          {firstItem?.title}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Desktop Hover Popover Showing All Contents in That Day */}
      <AnimatePresence>
        {hoveredDay && !selectedDayModal && typeof window !== 'undefined' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.14 }}
            style={{
              position: 'fixed',
              left: Math.min(
                window.innerWidth - 310,
                Math.max(16, hoveredDay.rect.left + hoveredDay.rect.width / 2 - 145)
              ),
              top:
                hoveredDay.rect.bottom + 240 > window.innerHeight
                  ? Math.max(16, hoveredDay.rect.top - 220)
                  : hoveredDay.rect.bottom + 8,
            }}
            className="hidden md:block z-50 w-[290px] rounded-2xl bg-[#0b0b10]/95 backdrop-blur-xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-3 pointer-events-none"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <span className="text-xs font-extrabold text-white">
                {formatModalDate(hoveredDay.dateStr)}
              </span>
              <span className="text-[10px] font-bold text-purple-300">
                {hoveredDay.items.length} {hoveredDay.items.length === 1 ? 'release' : 'releases'}
              </span>
            </div>
            <div className="space-y-2 max-h-52 overflow-hidden">
              {hoveredDay.items.slice(0, 4).map((item) => (
                <div key={item.uid} className="flex items-center gap-2.5">
                  <div className="w-8 h-11 rounded-md overflow-hidden bg-zinc-900 shrink-0 border border-white/10">
                    {item.posterUrl && (
                      <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-block text-[8px] font-black uppercase px-1.5 py-0.2 rounded ${
                        item.mediaType === 'anime'
                          ? 'bg-[#7c5cff]/30 text-purple-300'
                          : 'bg-amber-500/25 text-amber-300'
                      }`}
                    >
                      {item.mediaType === 'anime' ? item.format || 'Anime' : 'Movie'}
                    </span>
                    <p className="text-xs font-bold text-white truncate">{item.title}</p>
                  </div>
                </div>
              ))}
              {hoveredDay.items.length > 4 && (
                <p className="text-[10px] text-center text-gray-400 font-semibold pt-1">
                  +{hoveredDay.items.length - 4} more — click to view all
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Day Detail Modal (Click Day -> View All + Add to Watchlist) */}
      <AnimatePresence>
        {selectedDayModal && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setSelectedDayModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-[#09090d] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              {/* Modal Header */}
              <div className="shrink-0 px-5 py-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                    <Sparkles size={17} className="text-[#7c5cff]" />
                    <span>{formatModalDate(selectedDayModal.dateStr)}</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedDayModal.items.length}{' '}
                    {selectedDayModal.items.length === 1 ? 'release' : 'releases'} scheduled
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDayModal(null)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content List */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3 custom-scrollbar">
                {selectedDayModal.items.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mx-auto text-gray-400">
                      <CalendarDays size={22} />
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-white">Nothing found</h4>
                    <p className="text-xs text-gray-400 max-w-xs mx-auto">
                      No movies or anime releases were found for {formatModalDate(selectedDayModal.dateStr)}.
                    </p>
                  </div>
                ) : (
                  selectedDayModal.items.map((item) => {
                  const existingWl = findExistingWatchlist(item);
                  const isAdding = addingId === item.uid;

                  return (
                    <div
                      key={item.uid}
                      className="flex gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition"
                    >
                      <div className="w-16 sm:w-20 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/10">
                        {item.posterUrl ? (
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <Film size={20} />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                item.mediaType === 'anime'
                                  ? 'bg-[#7c5cff]/20 text-purple-300 border-[#7c5cff]/40'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}
                            >
                              {item.mediaType === 'anime' ? item.format || 'Anime' : 'Movie'}
                            </span>

                            {item.rating > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                                <Star size={10} className="fill-amber-400" />
                                {item.rating}
                              </span>
                            )}

                            {item.genres?.slice(0, 2).map((g) => (
                              <span
                                key={g}
                                className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded"
                              >
                                {g}
                              </span>
                            ))}
                          </div>

                          <h4 className="text-sm sm:text-base font-extrabold text-white leading-snug">
                            {item.title}
                          </h4>

                          {item.overview && (
                            <p className="text-[11px] text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                              {item.overview}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleAddToWatchlist(item)}
                            disabled={isAdding}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                              existingWl
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                : 'bg-white text-black hover:bg-gray-200'
                            }`}
                          >
                            {isAdding ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : existingWl ? (
                              <Check size={13} />
                            ) : (
                              <Bookmark size={13} />
                            )}
                            <span>{existingWl ? 'In Watchlist' : 'Add to Watchlist'}</span>
                          </button>

                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-gray-300 hover:text-white transition"
                            >
                              <span>Details</span>
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
