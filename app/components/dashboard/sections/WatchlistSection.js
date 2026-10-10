import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import MediaCard from '../cards/MediaCard';
import MediaRowSkeleton from '../skeletons/MediaRowSkeleton';

export default function WatchlistSection({
  sortedWatchlist = [],
  watchlistCount = 0,
  loadingWatchlist = false,
  setShowAddWatchlistModal,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const watchlistScrollRef = useRef(null);
  const isWatchlistDraggingRef = useRef(false);
  const watchlistStartXRef = useRef(0);
  const watchlistScrollLeftRef = useRef(0);

  const scrollWatchlist = (direction) => {
    if (watchlistScrollRef.current) {
      const { scrollLeft, clientWidth } = watchlistScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      watchlistScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleWatchlistMouseDown = (e) => {
    isWatchlistDraggingRef.current = true;
    watchlistStartXRef.current = e.pageX - (watchlistScrollRef.current?.offsetLeft || 0);
    watchlistScrollLeftRef.current = watchlistScrollRef.current?.scrollLeft || 0;
  };

  const handleWatchlistMouseMove = (e) => {
    if (!isWatchlistDraggingRef.current || !watchlistScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - (watchlistScrollRef.current?.offsetLeft || 0);
    const walk = (x - watchlistStartXRef.current) * 1.5;
    watchlistScrollRef.current.scrollLeft = watchlistScrollLeftRef.current - walk;
  };

  const handleWatchlistMouseUpOrLeave = () => {
    isWatchlistDraggingRef.current = false;
  };

  return (
    <section id="watchlist" className="space-y-4 scroll-mt-24">
      <span id="watchlist-anchor" className="sr-only" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Bookmark size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-wide text-white">Watchlist</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/watchlist')}
            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
            title="View All Watchlist Items"
          >
            <span>All</span>
            <ChevronRight size={14} />
          </button>

          {sortedWatchlist.length > 2 && (
            <>
              <button
                type="button"
                onClick={() => scrollWatchlist('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollWatchlist('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {loadingWatchlist ? (
        <MediaRowSkeleton count={6} />
      ) : sortedWatchlist.length === 0 ? (
        <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
            <Bookmark size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Items in Watchlist Yet</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              Save upcoming movies, series, anime, manga, and audio stories to watch or read later!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddWatchlistModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Plus size={14} />
            <span>Add to Watchlist</span>
          </button>
        </div>
      ) : (
        <div
          ref={watchlistScrollRef}
          onMouseDown={handleWatchlistMouseDown}
          onMouseMove={handleWatchlistMouseMove}
          onMouseUp={handleWatchlistMouseUpOrLeave}
          onMouseLeave={handleWatchlistMouseUpOrLeave}
          className="flex gap-4 overflow-x-auto py-2 scroll-smooth select-none cursor-grab active:cursor-grabbing no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {sortedWatchlist.slice(0, 10).map((item) => {
            const coverImg = item.posterUrl || (item.images?.posters?.[0]?.url || null);
            const pct = Number(item.progressPercent || item.progressPct || 0);
            const isCompleted = item.status === 'Completed' || pct >= 100;
            const rating = item.rating > 0 ? parseFloat(item.rating).toFixed(1) : (item.score > 0 ? parseFloat(item.score).toFixed(1) : null);
            const subLeft = item.year || item.contentType || 'Media';
            const subRight = item.status || 'Plan to Watch';

            return (
              <MediaCard
                key={`wl-${item.id}`}
                item={item}
                type="watchlist"
                coverImg={coverImg}
                rating={rating}
                isCompleted={isCompleted}
                pct={pct}
                subLeft={subLeft}
                subRight={subRight}
                badgeMediaType={item.contentType || 'Media'}
                accentBorder="hover:border-amber-400/50"
                onClick={() => router.push(`/watchlist/${item.id}`)}
                onMouseEnter={(e) => handleCardMouseEnter(item, 'watchlist', e)}
                onMouseLeave={handleCardMouseLeave}
                onMobileMenuToggle={() => {
                  setActiveMobileMenu(activeMobileMenu?.id === item.id ? null : { type: 'watchlist', id: item.id, item });
                }}
              />
            );
          })}

          {/* See All Card at the end */}
          <div
            onClick={() => router.push('/watchlist')}
            className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col transition shadow-md hover:shadow-xl bg-amber-950/10 hover:bg-amber-950/20 self-start"
          >
            <div className="aspect-[2/3] flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center group-hover:scale-110 transition-transform mb-1">
                <Bookmark size={24} />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">See All</span>
                <span className="text-xs text-amber-400/80 font-mono mt-0.5 block">{watchlistCount} items</span>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-extrabold flex items-center gap-1 group-hover:bg-amber-400 transition">
                View All <ChevronRight size={14} />
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
