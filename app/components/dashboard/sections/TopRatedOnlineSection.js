import React from 'react';
import { Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import TopRatedOnlineSkeleton from '../skeletons/TopRatedOnlineSkeleton';
import TopRatedOnlineCard from '../cards/TopRatedOnlineCard';

export default function TopRatedOnlineSection({
  lazyTopRatedRef,
  scrollTopRated,
  hasScrolledToTopRated,
  loadingTopRated,
  topRatedWithLibrary = [],
  topRatedScrollRef,
  handleTopRatedMouseDown,
  handleTopRatedMouseMove,
  handleTopRatedMouseUp,
  handleTopRatedMouseLeave,
  topRatedHasDragged,
  onSelectAnime,
  handleAddAnimeToLibrary,
  handleOpenExternalAnime,
  handleOpenMalSearch,
}) {
  return (
    <section id="top-rated" ref={lazyTopRatedRef} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Trophy size={20} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
              Top 20 Episodes
            </h2>
          </div>
        </div>

        {/* Scroll Navigation Arrows */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => scrollTopRated && scrollTopRated('left')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
            title="Scroll Top Rated Left"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => scrollTopRated && scrollTopRated('right')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
            title="Scroll Top Rated Right"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Top Rated Cards Compact Horizontal Slider */}
      {!hasScrolledToTopRated || loadingTopRated ? (
        <TopRatedOnlineSkeleton count={7} />
      ) : topRatedWithLibrary.length === 0 ? (
        <div className="p-8 rounded-2xl glass-panel text-center text-xs text-gray-400 border border-white/10">
          No top-rated data available at the moment.
        </div>
      ) : (
        <div
          ref={topRatedScrollRef}
          onMouseDown={handleTopRatedMouseDown}
          onMouseMove={handleTopRatedMouseMove}
          onMouseUp={handleTopRatedMouseUp}
          onMouseLeave={handleTopRatedMouseLeave}
          className="flex gap-3 overflow-x-auto no-scrollbar py-2 scroll-smooth select-none cursor-grab active:cursor-grabbing"
        >
          {topRatedWithLibrary.map((show) => (
            <TopRatedOnlineCard
              key={show.id}
              show={show}
              hasDragged={topRatedHasDragged}
              onSelectAnime={onSelectAnime}
              onAddAnime={handleAddAnimeToLibrary}
              onOpenExternal={handleOpenExternalAnime}
              onOpenMal={handleOpenMalSearch}
            />
          ))}
        </div>
      )}
    </section>
  );
}
