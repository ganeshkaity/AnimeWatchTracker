import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard from '../cards/MediaCard';

export default function RecentlyUpdatedSection({
  recentlyUpdated = [],
  onSelectAnime,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const recentlyUpdatedRef = useRef(null);

  const scrollRecentlyUpdated = (direction) => {
    if (recentlyUpdatedRef.current) {
      const { scrollLeft, clientWidth } = recentlyUpdatedRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      recentlyUpdatedRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!recentlyUpdated || recentlyUpdated.length === 0) return null;

  return (
    <section id="recently-updated" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Clock size={20} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-wide text-white">Recently Updated</h2>
          </div>
        </div>

        {/* Scroll Navigation Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollRecentlyUpdated('left')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
            title="Scroll left"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollRecentlyUpdated('right')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
            title="Scroll right"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Horizontal Slider */}
      <div
        ref={recentlyUpdatedRef}
        className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
      >
        {recentlyUpdated.map((show, i) => {
          const pct = Number(show.pct || 0);
          const isCompleted = pct >= 100;
          return (
            <MediaCard
              key={`recent-${show.type || 'anime'}-${show.id}-${i}`}
              item={show.item || show}
              type={show.type || 'anime'}
              coverImg={show.image}
              rating={show.rating}
              isCompleted={isCompleted}
              pct={pct}
              subLeft={show.episode}
              subRight={show.type === 'manga' ? 'Manga' : 'Anime'}
              isYouTube={!!show.isYouTube}
              accentBorder="hover:border-amber-400/50"
              onClick={() => {
                if (show.type === 'manga') {
                  router.push(`/manga/${show.id}`);
                } else {
                  onSelectAnime(show.id);
                }
              }}
              onMouseEnter={(e) => handleCardMouseEnter(show.item || show, show.type || 'anime', e)}
              onMouseLeave={handleCardMouseLeave}
              onMobileMenuToggle={() => {
                setActiveMobileMenu({ type: show.type || 'anime', id: show.id, item: show.item || show });
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
