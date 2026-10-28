import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Film, Tv, BookOpen, Headphones, ChevronLeft, ChevronRight } from 'lucide-react';
import ContinueWatchingCard from '../cards/ContinueWatchingCard';
import ContinueWatchingSkeleton from '../skeletons/ContinueWatchingSkeleton';
import { getAnimeProgressPercent } from '../utils/dashboardHelpers';

export default function ContinueWatchingSection({
  continueWatchingList = [],
  isLoading = false,
  onSelectAnime,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const continueScrollRef = useRef(null);

  const scrollContinue = (direction) => {
    if (continueScrollRef.current) {
      const { scrollLeft, clientWidth } = continueScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      continueScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (isLoading) {
    return (
      <section id="continue-watching" className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#7c5cff]">
              <Play size={20} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                <span>Continue Watching</span>
              </h2>
            </div>
          </div>
        </div>
        <ContinueWatchingSkeleton count={5} />
      </section>
    );
  }

  if (!continueWatchingList || continueWatchingList.length === 0) {
    return null;
  }

  return (
    <section id="continue-watching" className="space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#7c5cff]">
            <Play size={20} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
              <span>Continue Watching</span>
            </h2>
          </div>
        </div>

        {/* Chevron Navigation Keys */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollContinue('left')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
            title="Scroll left"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollContinue('right')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
            title="Scroll right"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Horizontal Slider with 16:9 Backdrop Cards */}
      <div
        ref={continueScrollRef}
        className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2 scroll-smooth"
      >
        {continueWatchingList.map((item) => {
          let backdropImg = null;
          let logoUrl = item.logoUrl || item.logo || (item.images?.logos?.[0]?.url) || null;
          let itemRating = item.rating || item.score || item.vote_average || null;
          let pct = 0;
          let isCompleted = false;
          let subText = '';
          let fallbackIcon = <Play size={32} />;

          if (item.mediaType === 'movie') {
            backdropImg = item.backdropUrl || item.bannerUrl || item.backdropPath || item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
            pct = item.progressPct || (item.duration ? Math.min(100, Math.round(((item.currentTime || 0) / item.duration) * 100)) : 0);
            isCompleted = Boolean(item.watched || item.completed || item.watchStatus === 'Completed' || pct >= 95);
            subText = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : 'Movie');
            fallbackIcon = <Film size={32} />;
          } else if (item.mediaType === 'webseries') {
            backdropImg = item.backdropUrl || item.bannerUrl || item.backdropPath || item.coverUrl || item.posterUrl || (item.thumbnailBase64 || null);
            pct = item.progressPct || item.progressPercent || 0;
            isCompleted = Boolean(item.watched || item.isWatched || item.watchStatus === 'Completed' || pct >= 100);
            subText = item.lastWatchedEpisode ? `EP ${item.lastWatchedEpisode}` : (item.year || 'Series');
            fallbackIcon = <Tv size={32} />;
          } else if (item.mediaType === 'anime') {
            backdropImg = item.backdropUrl || item.bannerUrl || item.banner || item.coverUrl || item.posterUrl || item.posterPath || item.thumbnailBase64 || (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : null);
            pct = getAnimeProgressPercent(item);
            isCompleted = Boolean(item.watched || item.isWatched || item.watchStatus === 'Completed' || pct >= 100);
            subText = item.lastWatchedEpisode ? `EP ${item.lastWatchedEpisode}` : (item.year || 'Anime');
            fallbackIcon = <Play size={32} />;
          } else if (item.mediaType === 'manga') {
            backdropImg = item.bannerUrl || item.backdropUrl || item.coverUrl || item.posterUrl || item.thumbnailBase64 || (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : null);
            pct = item.progressPct || item.progressPercent || 0;
            isCompleted = Boolean(item.isWatched || item.isCompleted || pct >= 100);
            subText = item.lastWatchedChapter ? `CH ${item.lastWatchedChapter}` : (item.completedChapters ? `CH ${item.completedChapters}` : (item.year || 'Manga'));
            fallbackIcon = <BookOpen size={32} />;
          } else if (item.mediaType === 'audioStory') {
            backdropImg = item.bannerUrl || item.backdropUrl || item.coverUrl || item.posterUrl || item.thumbnailBase64 || (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : null);
            pct = item.progressPct || item.progressPercent || 0;
            isCompleted = Boolean(item.isWatched || item.isCompleted || pct >= 100);
            subText = item.lastWatchedTrack || (item.completedTracks ? `Tr ${item.completedTracks}` : 'Audio');
            fallbackIcon = <Headphones size={32} />;
          }

          return (
            <ContinueWatchingCard
              key={`continue-${item.mediaType}-${item.id}`}
              item={item}
              mediaType={item.mediaType}
              backdropImg={backdropImg}
              logoUrl={logoUrl}
              title={item.title || item.name}
              subText={subText}
              rating={itemRating}
              pct={pct}
              isCompleted={isCompleted}
              fallbackIcon={fallbackIcon}
              onClick={() => {
                if (item.mediaType === 'movie') {
                  router.push(`/movies/${item.id}`);
                } else if (item.mediaType === 'webseries') {
                  router.push(`/webseries/${item.id}`);
                } else if (item.mediaType === 'anime') {
                  onSelectAnime(item.id);
                } else if (item.mediaType === 'manga') {
                  router.push(`/manga/${item.id}`);
                } else if (item.mediaType === 'audioStory') {
                  router.push(`/audio-story/${item.id}`);
                }
              }}
              onMouseEnter={(e) => handleCardMouseEnter(item, item.mediaType, e)}
              onMouseLeave={handleCardMouseLeave}
              onMobileMenuToggle={() => {
                setActiveMobileMenu(activeMobileMenu?.id === item.id ? null : { type: item.mediaType, id: item.id, item });
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
