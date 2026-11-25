"use client";

import React, { useState, useEffect, memo } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus, ChevronRight, Clock } from 'lucide-react';
import {
  WEEK_DAYS,
  getWeeklySchedule,
  getDayAllItems,
  getDayEstimatedMinutes,
  formatDurationMinutes,
  getTodayDayId,
} from '../../../utils/scheduleStore';
import { toFanartPreview } from '../../../lib/fanartUtils';

function ThisWeekSection() {
  const [schedule, setSchedule] = useState(() => (typeof window !== 'undefined' ? getWeeklySchedule() : null));
  const todayId = getTodayDayId();

  useEffect(() => {
    setSchedule(getWeeklySchedule());
    const handleUpdate = (e) => {
      if (e?.detail) {
        setSchedule(e.detail);
      } else {
        setSchedule(getWeeklySchedule());
      }
    };
    window.addEventListener('weekly_schedule_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('weekly_schedule_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

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
          <span>Manage Schedule</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* 7-Day Row matching Image 1 */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5 sm:gap-3">
        {WEEK_DAYS.map((day) => {
          const isToday = day.id === todayId;
          const daySchedule = schedule?.[day.id];
          const items = getDayAllItems(daySchedule);
          const primaryItem = items[0] || null;
          const extraCount = items.length > 1 ? items.length - 1 : 0;
          const totalMinutes = getDayEstimatedMinutes(daySchedule);
          const posterSrc = primaryItem?.poster ? toFanartPreview(primaryItem.poster) : '';

          return (
            <Link
              key={day.id}
              href={`/schedule?day=${day.id}`}
              className="group flex flex-col items-center gap-1.5 min-w-0"
            >
              <span
                className={`text-[11px] sm:text-xs font-bold tracking-wider uppercase transition-colors ${
                  isToday ? 'text-[#65e335]' : 'text-gray-400 group-hover:text-gray-200'
                }`}
              >
                {day.short}
              </span>

              <div
                className={`relative w-full aspect-[2/3] rounded-xl overflow-hidden transition-all duration-200 bg-white/[0.04] ${
                  isToday
                    ? 'ring-2 ring-[#65e335] shadow-[0_0_18px_rgba(101,227,53,0.3)]'
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
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default memo(ThisWeekSection);
