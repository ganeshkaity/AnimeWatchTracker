import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Film, ChevronRight, ChevronLeft, FolderOpen, Plus } from 'lucide-react';
import MediaCard from '../cards/MediaCard';
import MediaRowSkeleton from '../skeletons/MediaRowSkeleton';
import { getAnimeProgressPercent, getDeterministicRating } from '../utils/dashboardHelpers';

export default function AnimeSection({
  topTrackedAnimes = [],
  animesCount = 0,
  loading = false,
  isOffline = false,
  onSelectAnime,
  setShowAddModal,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const animeScrollRef = useRef(null);

  const scrollAnime = (direction) => {
    if (animeScrollRef.current) {
      const { scrollLeft, clientWidth } = animeScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      animeScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="anime" className="space-y-4 scroll-mt-24">
      <span id="catalog" className="sr-only" />
      {/* Header Controls Panel */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#a855f7]">
            <Film size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-wide text-white">Animes</h2>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/animes')}
            className="px-3 py-1.5 rounded-xl bg-[#7c5cff]/10 hover:bg-[#7c5cff]/20 border border-[#7c5cff]/30 text-[#a855f7] hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
            title="View All Anime in Library"
          >
            <span>All</span>
            <ChevronRight size={14} />
          </button>

          {topTrackedAnimes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => scrollAnime('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollAnime('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Horizontal Slider */}
      {loading ? (
        <MediaRowSkeleton count={6} />
      ) : topTrackedAnimes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-10 md:p-16 rounded-3xl text-center border border-white/10 max-w-xl mx-auto my-8 space-y-4"
        >
          <div className="p-4 rounded-full bg-[#7c5cff]/10 text-[#7c5cff] w-16 h-16 mx-auto flex items-center justify-center">
            <FolderOpen size={32} />
          </div>
          <h3 className="text-xl font-bold tracking-wide">No Tracked Folders Found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            Connect your local PC anime folders to automatically parse episodes, track watch progress, and stream natively!
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={isOffline}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider btn-accent flex items-center gap-2 mx-auto ${isOffline ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Plus size={16} />
            {isOffline ? 'Offline Mode' : 'Track Local Anime Folder'}
          </button>
        </motion.div>
      ) : (
        <div
          ref={animeScrollRef}
          className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
        >
          {topTrackedAnimes.map((anime) => {
            const pct = getAnimeProgressPercent(anime);
            const isWatched = Boolean(anime.watched || anime.isWatched || anime.status === 'completed' || pct >= 100);
            const coverImg = anime.posterUrl || anime.posterPath || anime.coverUrl || anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null);
            const rating = getDeterministicRating(anime.id, anime.rating);
            const subLeft = anime.lastWatchedEpisode ? `EP ${anime.lastWatchedEpisode}` : (anime.year || (anime.totalSeasons ? `S${anime.totalSeasons}` : 'Anime'));
            const subRight = anime.totalEpisodes
              ? (anime.episodeCount && anime.episodeCount !== Number(anime.totalEpisodes)
                ? `${anime.episodeCount}/${anime.totalEpisodes} Ep`
                : `${anime.totalEpisodes} Ep`)
              : (anime.episodeCount ? `${anime.episodeCount} Ep` : 'Anime');
            const isYouTube = !!(anime.isYouTube || anime.folderPath?.startsWith('http') || anime.folderPath?.startsWith('youtube://'));

            return (
              <MediaCard
                key={`anime-${anime.id}`}
                item={anime}
                type="anime"
                coverImg={coverImg}
                rating={rating}
                isCompleted={isWatched}
                pct={pct}
                subLeft={subLeft}
                subRight={subRight}
                isYouTube={isYouTube}
                accentBorder="hover:border-amber-400/50"
                onClick={() => onSelectAnime(anime.id)}
                onMouseEnter={(e) => handleCardMouseEnter(anime, 'anime', e)}
                onMouseLeave={handleCardMouseLeave}
                onMobileMenuToggle={() => {
                  setActiveMobileMenu(activeMobileMenu?.id === anime.id ? null : { type: 'anime', id: anime.id, item: anime });
                }}
              />
            );
          })}

          {/* See All Card at the end */}
          <div
            onClick={() => router.push('/animes')}
            className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col transition shadow-md hover:shadow-xl bg-[#7c5cff]/5 hover:bg-[#7c5cff]/10 self-start"
          >
            <div className="aspect-[2/3] flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#7c5cff]/20 text-[#a855f7] flex items-center justify-center group-hover:scale-110 transition-transform mb-1">
                <Film size={24} />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">See All Anime</span>
                <span className="text-xs text-purple-300/80 font-mono mt-0.5 block">{animesCount} Total Series</span>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-[#7c5cff] text-white text-xs font-extrabold flex items-center gap-1 group-hover:bg-[#6c4cf0] transition shadow-md shadow-[#7c5cff]/30">
                View All <ChevronRight size={14} />
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
