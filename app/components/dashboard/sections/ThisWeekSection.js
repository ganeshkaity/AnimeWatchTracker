"use client";

import React, { useState, useEffect, useMemo, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Plus, ChevronRight, Clock, X, Layers, ExternalLink } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  getUpcoming7Days,
  getWeeklySchedule,
  subscribeSchedule,
  getDayAllItems,
  getDayEstimatedMinutes,
  formatDurationMinutes,
} from '../../../utils/scheduleStore';
import { toFanartPreview } from '../../../lib/fanartUtils';

function getMediaHref(mediaType, mediaId) {
  if (!mediaId) return '/schedule';
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

const MEDIA_LABELS = {
  anime: 'Anime',
  movie: 'Movie',
  webseries: 'Web Series',
  watchlist: 'Watchlist',
  manga: 'Manga',
  audiostory: 'Audio',
};

function ThisWeekSection() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [schedule, setSchedule] = useState(() => getWeeklySchedule());
  const upcomingDays = useMemo(() => getUpcoming7Days(), []);
  const [dayModal, setDayModal] = useState(null); // { day, items, totalMinutes }

  useEffect(() => {
    const unsubscribe = subscribeSchedule(currentUser?.uid);
    const handleUpdate = (e) => {
      if (e?.detail) {
        setSchedule(e.detail);
      } else {
        setSchedule(getWeeklySchedule());
      }
    };
    window.addEventListener('weekly_schedule_updated', handleUpdate);
    return () => {
      unsubscribe();
      window.removeEventListener('weekly_schedule_updated', handleUpdate);
    };
  }, [currentUser?.uid]);

  const handleDayClick = (day, items, totalMinutes) => {
    if (!items || items.length === 0) {
      router.push(`/schedule?day=${day.id}`);
      return;
    }
    if (items.length === 1) {
      const onlyItem = items[0];
      router.push(getMediaHref(onlyItem.mediaType, onlyItem.mediaId));
      return;
    }
    setDayModal({ day, items, totalMinutes });
  };

  return (
    <section id="this-week" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-white">
            This Week
          </h2>
        </div>

        <Link
          href="/schedule"
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white transition-colors px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10"
        >
          <span>Manage</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Upcoming 7 Days Row (Horizontally scrollable on mobile, 7-col grid on sm+) */}
      <div className="flex sm:grid sm:grid-cols-7 gap-2.5 sm:gap-3 overflow-x-auto sm:overflow-visible no-scrollbar smooth-scroll-gpu px-1 py-1 -mx-1 sm:mx-0 sm:p-0">
        {upcomingDays.map((day) => {
          const daySchedule = schedule?.[day.id];
          const items = getDayAllItems(daySchedule);
          const primaryItem = items[0] || null;
          const extraCount = items.length > 1 ? items.length - 1 : 0;
          const totalMinutes = getDayEstimatedMinutes(daySchedule);
          const posterSrc = primaryItem?.poster ? toFanartPreview(primaryItem.poster) : '';

          return (
            <button
              key={day.id}
              type="button"
              onClick={() => handleDayClick(day, items, totalMinutes)}
              className="group flex flex-col items-center gap-1.5 w-[84px] min-w-[84px] flex-shrink-0 sm:w-auto sm:min-w-0 sm:flex-shrink text-left cursor-pointer"
            >
              <div className="flex flex-col items-center leading-tight">
                <span
                  className={`text-[11px] sm:text-xs font-bold tracking-wider uppercase transition-colors ${
                    day.isToday ? 'text-[#65e335]' : 'text-gray-400 group-hover:text-gray-200'
                  }`}
                >
                  {day.short}
                </span>
              </div>

              <div
                className={`relative w-full aspect-[2/3] rounded-xl overflow-hidden transition-all duration-200 bg-white/[0.04] ${
                  day.isToday
                    ? 'border-2 border-[#65e335] shadow-[0_0_14px_rgba(101,227,53,0.3)]'
                    : 'border border-white/10 group-hover:border-white/30 group-hover:-translate-y-0.5'
                }`}
              >
                {primaryItem && posterSrc ? (
                  <>
                    <img
                      src={posterSrc}
                      alt={primaryItem.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />
                    {totalMinutes > 0 && (
                      <div className="hidden sm:flex items-center gap-1 absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[9px] font-semibold text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Clock size={9} className="text-[#65e335]" />
                        <span>{formatDurationMinutes(totalMinutes)}</span>
                      </div>
                    )}
                  </>
                ) : primaryItem ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br from-zinc-800 to-zinc-950">
                    <CalendarDays size={18} className="text-gray-400 mb-1" />
                    <span className="text-[10px] font-bold text-gray-200 line-clamp-2 leading-tight">
                      {primaryItem.title}
                    </span>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-gray-500 group-hover:text-gray-300 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-white/[0.06] group-hover:bg-white/[0.12] flex items-center justify-center mb-1 transition-colors">
                      <Plus size={14} />
                    </div>
                    <span className="text-[10px] font-medium">Add</span>
                  </div>
                )}

                {extraCount > 0 && (
                  <div className="absolute bottom-1.5 right-1.5 min-w-[24px] h-6 px-1.5 rounded-full bg-black/85 border border-white/20 flex items-center justify-center text-[11px] font-extrabold text-white shadow-md">
                    +{extraCount}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Multi-item Day Content Modal */}
      {dayModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDayModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#0b0b0b] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>{dayModal.day.label}</span>
                  <span className="text-xs font-semibold text-gray-400">
                    ({dayModal.day.isToday ? 'Today' : dayModal.day.dateLabel})
                  </span>
                </h3>
                <p className="text-xs text-gray-400">
                  {dayModal.items.length} scheduled • Est. {formatDurationMinutes(dayModal.totalMinutes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDayModal(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5">
              {dayModal.items.map((item) => {
                const posterSrc = item.poster ? toFanartPreview(item.poster) : '';
                const href = getMediaHref(item.mediaType, item.mediaId);
                return (
                  <Link
                    key={item.entryId}
                    href={href}
                    onClick={() => setDayModal(null)}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 transition group"
                  >
                    <div className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10">
                      {posterSrc ? (
                        <img src={posterSrc} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          <Layers size={16} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold uppercase text-gray-200">
                          {item.slotLabel}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400">
                          {MEDIA_LABELS[item.mediaType] || 'Media'} • {formatDurationMinutes(item.totalMinutes)}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white truncate group-hover:text-[#65e335] transition-colors">
                        {item.title}
                      </h4>
                      {item.note && (
                        <p className="text-[11px] text-gray-400 truncate">{item.note}</p>
                      )}
                    </div>
                    <ExternalLink size={15} className="text-gray-500 group-hover:text-white flex-shrink-0" />
                  </Link>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end bg-black/50">
              <Link
                href={`/schedule?day=${dayModal.day.id}`}
                onClick={() => setDayModal(null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-black hover:bg-gray-200 text-xs font-extrabold transition"
              >
                <span>Edit in Schedule</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default memo(ThisWeekSection);
