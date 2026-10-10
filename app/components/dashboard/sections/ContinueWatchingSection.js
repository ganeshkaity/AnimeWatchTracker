import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Film, Tv, BookOpen, Headphones, ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard from '../cards/MediaCard';
import MediaRowSkeleton from '../skeletons/MediaRowSkeleton';
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
        <MediaRowSkeleton count={6} />
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

      {/* Horizontal Slider */}
      <div
        ref={continueScrollRef}
        className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
      >
        {continueWatchingList.map((item) => {
          let coverImg = null;
          let itemRating = item.rating || item.score || item.vote_average || null;
          let pct = 0;
          let isCompleted = false;
          let subLeft = '';
          let subRight = '';
          let badgeMediaType = '';
          let fallbackIcon = <Play size={36} />;

          if (item.mediaType === 'movie') {
            coverImg = item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
            pct = item.progressPct || (item.duration ? Math.min(100, Math.round(((item.currentTime || 0) / item.duration) * 100)) : 0);
            isCompleted = Boolean(item.watched || item.completed || item.watchStatus === 'Completed' || pct >= 95);
            subLeft = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : 'Movie');
            subRight = item.runtime
              ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`
              : item.duration
              ? `${Math.floor(item.duration / 3600) > 0 ? Math.floor(item.duration / 3600) + 'h ' : ''}${Math.floor((item.duration % 3600) / 60)}m`
              : 'Feature';
            badgeMediaType = 'Movie';
            fallbackIcon = <Film size={36} />;
          } else if (item.mediaType === 'webseries') {
            coverImg = item.posterUrl || item.posterPath || item.coverUrl || (item.thumbnailBase64 || null);
            pct = item.progressPct || item.progressPercent || 0;
            isCompleted = Boolean(item.watched || item.isWatched || item.watchStatus === 'Completed' || pct >= 100);
            subLeft = item.lastWatchedEpisode ? `EP ${item.lastWatchedEpisode}` : (item.year || 'Series');
            subRight = item.totalEpisodes ? `${item.totalEpisodes} Ep` : (item.episodeCount ? `${item.episodeCount} Ep` : 'Series');
            badgeMediaType = 'Series';
            fallbackIcon = <Tv size={36} />;
          } else if (item.mediaType === 'anime') {
            coverImg = item.posterUrl || item.posterPath || item.coverUrl || item.thumbnailBase64 || (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : null);
            pct = getAnimeProgressPercent(item);
            isCompleted = Boolean(item.watched || item.isWatched || item.watchStatus === 'Completed' || pct >= 100);
            subLeft = item.lastWatchedEpisode ? `EP ${item.lastWatchedEpisode}` : (item.year || 'Anime');
            subRight = item.totalEpisodes ? `${item.totalEpisodes} Ep` : (item.episodeCount ? `${item.episodeCount} Ep` : 'Anime');
            badgeMediaType = 'Anime';
            fallbackIcon = <Play size={36} />;
          } else if (item.mediaType === 'manga') {
            coverImg = item.thumbnailBase64 || (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : (item.coverUrl || item.posterUrl || null));
            pct = item.progressPct || item.progressPercent || 0;
            isCompleted = Boolean(item.isWatched || item.isCompleted || pct >= 100);
            subLeft = item.lastWatchedChapter ? `CH ${item.lastWatchedChapter}` : (item.completedChapters ? `CH ${item.completedChapters}` : (item.year || 'Manga'));
            subRight = item.totalChapters ? `${item.totalChapters} Ch` : (item.chapterCount ? `${item.chapterCount} Ch` : 'Manga');
            badgeMediaType = 'Manga';
            fallbackIcon = <BookOpen size={36} />;
          } else if (item.mediaType === 'audioStory') {
            coverImg = item.thumbnailBase64 || (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : (item.coverUrl || item.posterUrl || null));
            pct = item.progressPct || item.progressPercent || 0;
            isCompleted = Boolean(item.isWatched || item.isCompleted || pct >= 100);
            subLeft = item.lastWatchedTrack || (item.completedTracks ? `Tr ${item.completedTracks}` : 'Audio');
            subRight = item.totalTracks ? `${item.totalTracks} Tr` : (item.trackCount ? `${item.trackCount} Tr` : 'Audio');
            badgeMediaType = 'Audio';
            fallbackIcon = <Headphones size={36} />;
          }

          return (
            <MediaCard
              key={`continue-${item.mediaType}-${item.id}`}
              item={item}
              type={item.mediaType}
              coverImg={coverImg}
              rating={itemRating}
              isCompleted={isCompleted}
              pct={pct}
              subLeft={subLeft}
              subRight={subRight}
              badgeMediaType={badgeMediaType}
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
