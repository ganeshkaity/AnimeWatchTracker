import React, { useRef } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import TopRatedMasterpieceCard from '../cards/TopRatedMasterpieceCard';
import TopRatedSkeleton from '../skeletons/TopRatedSkeleton';

export default function TopRatedMasterpiecesSection({
  lazyTopRatedRef,
  loadingTopRated = false,
  hasScrolledToTopRated = true,
  topRatedWithLibrary = [],
  onSelectAnime,
  handleAddAnimeToLibrary,
}) {
  const localTopRatedScrollRef = useRef(null);

  const scrollLocalTopRated = (direction) => {
    if (localTopRatedScrollRef.current) {
      const { scrollLeft, clientWidth } = localTopRatedScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      localTopRatedScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const isLoading = !hasScrolledToTopRated || loadingTopRated;

  return (
    <section id="top-rated-masterpieces" ref={lazyTopRatedRef} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Star size={20} className="fill-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
              Top Rated Anime
            </h2>
          </div>
        </div>

        {/* Arrow navigation controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollLocalTopRated('left')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
            title="Scroll Top Rated Left"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollLocalTopRated('right')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
            title="Scroll Top Rated Right"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <TopRatedSkeleton count={7} />
      ) : topRatedWithLibrary.length === 0 ? (
        <div className="p-8 rounded-2xl glass-panel text-center text-xs text-gray-400 border border-white/10">
          No top-rated anime data available at the moment.
        </div>
      ) : (
        <div
          ref={localTopRatedScrollRef}
          className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-3 scroll-smooth select-none"
        >
          {topRatedWithLibrary.map((show, idx) => (
            <TopRatedMasterpieceCard
              key={`top-${show.id}-${idx}`}
              show={show}
              index={idx}
              onClick={() => {
                if (show.isUploaded && show.uploadedAnimeId) {
                  onSelectAnime(show.uploadedAnimeId);
                } else if (show.id && !show.id.startsWith('ext-') && !show.id.startsWith('top-rated-')) {
                  onSelectAnime(show.id);
                } else if (handleAddAnimeToLibrary) {
                  handleAddAnimeToLibrary(null, show);
                }
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
