import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Tv, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import MediaCard from '../cards/MediaCard';
import MediaRowSkeleton from '../skeletons/MediaRowSkeleton';

export default function WebseriesSection({
  sortedWebseries = [],
  webseriesCount = 0,
  loadingWebseries = false,
  setShowAddWebseriesModal,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const webseriesScrollRef = useRef(null);

  const scrollWebseries = (direction) => {
    if (webseriesScrollRef.current) {
      const { scrollLeft, clientWidth } = webseriesScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      webseriesScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="webseries" className="space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Tv size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-wide text-white">Webseries</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/webseries')}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
            title="View All Webseries in Library"
          >
            <span>All</span>
            <ChevronRight size={14} />
          </button>

          {sortedWebseries.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => scrollWebseries('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollWebseries('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {loadingWebseries ? (
        <MediaRowSkeleton count={6} />
      ) : sortedWebseries.length === 0 ? (
        <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
            <Tv size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Web-series Added Yet</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              Track your local web-series episode folders with automatic TMDB metadata, seasons, and stream via Media Server!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddWebseriesModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Plus size={14} />
            <span>+ Add Web-series</span>
          </button>
        </div>
      ) : (
        <div
          ref={webseriesScrollRef}
          className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
        >
          {sortedWebseries.slice(0, 10).map((series) => {
            const isWatched = Boolean(series.watched || series.isWatched || series.watchStatus === 'Completed' || (series.progressPercent && series.progressPercent >= 100));
            const pct = series.progressPercent || 0;
            const coverImg = series.posterUrl || series.posterPath || (series.thumbnailBase64 || null);
            const seriesYear = series.year || (series.releaseDate ? series.releaseDate.split('-')[0] : '');
            const epCountDisplay = series.episodeCount ? `${series.episodeCount} Ep` : (Array.isArray(series.seasons) ? `${series.seasons.length} Seasons` : 'Series');

            return (
              <MediaCard
                key={`webseries-${series.id}`}
                item={series}
                type="webseries"
                coverImg={coverImg}
                rating={series.rating}
                isCompleted={isWatched}
                pct={pct}
                subLeft={seriesYear || 'Series'}
                subRight={epCountDisplay}
                accentBorder="hover:border-cyan-400/50"
                onClick={() => router.push(`/webseries/${series.id}`)}
                onMouseEnter={(e) => handleCardMouseEnter(series, 'webseries', e)}
                onMouseLeave={handleCardMouseLeave}
                onMobileMenuToggle={() => {
                  setActiveMobileMenu(activeMobileMenu?.id === series.id ? null : { type: 'webseries', id: series.id, item: series });
                }}
              />
            );
          })}

          {sortedWebseries.length > 10 && (
            <div
              onClick={() => router.push('/webseries')}
              className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col transition shadow-md hover:shadow-xl bg-cyan-950/10 hover:bg-cyan-950/20 self-start"
            >
              <div className="aspect-[2/3] flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Tv size={24} />
                </div>
                <div>
                  <span className="text-sm font-bold text-white block">See All Series</span>
                  <span className="text-xs text-cyan-400/80 font-mono mt-0.5 block">{webseriesCount} total</span>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-cyan-500 text-black text-xs font-extrabold flex items-center gap-1 group-hover:bg-cyan-400 transition">
                  View All <ChevronRight size={14} />
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
