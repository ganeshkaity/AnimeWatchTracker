"use client";

import React, { useState, useEffect, useRef, memo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Tv } from 'lucide-react';

const CACHE_KEY = 'watchanime_upcoming_animes_v2';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function UpcomingAnimesSection({
  onSelectUpcomingAnime,
  handleCardMouseEnter,
  handleCardMouseLeave,
}) {
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  const [items, setItems] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
            return parsed.data;
          }
        }
      } catch {}
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);

  useEffect(() => {
    if (shouldFetch || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldFetch(true);
          observer.disconnect();
        }
      },
      { rootMargin: '350px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [shouldFetch]);

  useEffect(() => {
    if (!shouldFetch) return;
    let isMounted = true;

    const loadUpcoming = async () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.timestamp && Date.now() - parsed.timestamp < ONE_DAY_MS && Array.isArray(parsed?.data) && parsed.data.length > 0) {
            if (isMounted) setItems(parsed.data);
            return;
          }
        }
      } catch {}

      if (isMounted) setLoading(true);
      try {
        const res = await fetch('/api/upcoming/animes');
        if (res.ok) {
          const json = await res.json();
          if (json?.success && Array.isArray(json.animes) && json.animes.length > 0) {
            const top10 = json.animes.slice(0, 10);
            if (isMounted) setItems(top10);
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: top10 }));
            } catch {}
          }
        }
      } catch (err) {
        console.warn('[UpcomingAnimesSection] Fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadUpcoming();
    return () => { isMounted = false; };
  }, [shouldFetch]);

  const scrollRow = (direction) => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      scrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section ref={sentinelRef} id="upcoming-animes" className="space-y-3 dashboard-section-contain">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tv size={18} className="text-[#7c5cff]" />
          <h2 className="text-lg sm:text-xl font-extrabold tracking-wide text-white">
            Upcoming Animes
          </h2>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollRow('left')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95"
            title="Scroll left"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => scrollRow('right')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95"
            title="Scroll right"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="w-32 sm:w-36 md:w-40 flex-shrink-0 aspect-[2/3] rounded-xl bg-white/[0.05] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-6 text-xs text-gray-500">No upcoming animes available right now.</div>
      ) : (
        <div
          ref={scrollRef}
          className="flex items-start gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar py-1 scroll-smooth smooth-scroll-gpu select-none"
        >
          {items.map((anime) => {
            const previewObj = {
              ...anime,
              isUpcoming: true,
              coverUrl: anime.poster,
              bannerUrl: anime.banner || anime.poster,
            };

            return (
              <button
                key={anime.id}
                type="button"
                onClick={() => onSelectUpcomingAnime?.(anime)}
                onMouseEnter={(e) => handleCardMouseEnter?.(previewObj, 'anime', e)}
                onMouseLeave={() => handleCardMouseLeave?.()}
                className="group flex flex-col gap-1.5 w-32 sm:w-36 md:w-40 flex-shrink-0 text-left cursor-pointer"
              >
                <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 group-hover:border-[#7c5cff]/60 transition-all duration-200 group-hover:-translate-y-1">
                  {anime.poster ? (
                    <img
                      src={anime.poster}
                      alt={anime.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <Tv size={24} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent pointer-events-none" />

                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#7c5cff] text-white text-[9px] font-black uppercase">
                    {anime.format || 'TV'}
                  </div>

                  <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 text-[10px] font-bold text-purple-300">
                    <Calendar size={10} className="flex-shrink-0" />
                    <span className="truncate">{anime.releaseDate || 'TBA'}</span>
                  </div>
                </div>

                <h3 className="text-xs font-bold text-gray-100 group-hover:text-purple-300 transition-colors line-clamp-2 leading-snug">
                  {anime.title}
                </h3>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default memo(UpcomingAnimesSection);
