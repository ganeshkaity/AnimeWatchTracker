import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import MediaCard from '../cards/MediaCard';
import MediaRowSkeleton from '../skeletons/MediaRowSkeleton';
import { getDeterministicRating } from '../utils/dashboardHelpers';

export default function MangaSection({
  sortedMangas = [],
  loadingManga = false,
  setShowAddMangaModal,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const mangaScrollRef = useRef(null);

  const scrollManga = (direction) => {
    if (mangaScrollRef.current) {
      const { scrollLeft, clientWidth } = mangaScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      mangaScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="manga" className="space-y-4 scroll-mt-24">
      <span id="manga-webtoons" className="sr-only" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <BookOpen size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-wide text-white">Manga or Webtoons</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sortedMangas.length > 2 && (
            <>
              <button
                type="button"
                onClick={() => scrollManga('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollManga('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {loadingManga ? (
        <MediaRowSkeleton count={6} />
      ) : sortedMangas.length === 0 ? (
        <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto">
            <BookOpen size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Manga or Webtoons Tracked Yet</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              Connect any local folder with PDF manga chapters to start reading with the custom PDF viewer!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMangaModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Plus size={14} />
            <span>Track Manga Folder</span>
          </button>
        </div>
      ) : (
        <div
          ref={mangaScrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
        >
          {sortedMangas.map((m) => {
            const isWatched = Boolean(m.isWatched || m.progressPercent === 100 || m.status === 'completed');
            const pct = Number(m.progressPercent || 0);
            const coverImg = m.thumbnailBase64 || (m.thumbnailPath ? `/api/image?path=${encodeURIComponent(m.thumbnailPath)}` : (m.coverUrl || m.posterUrl || null));
            const rating = getDeterministicRating(m.id, m.rating);
            const subLeft = m.lastWatchedChapter ? `CH ${m.lastWatchedChapter}` : (m.completedChapters ? `CH ${m.completedChapters}` : (m.year || 'Manga'));
            const subRight = m.totalChapters ? `${m.totalChapters} Ch` : (m.chapterCount ? `${m.chapterCount} Ch` : 'Manga');

            return (
              <MediaCard
                key={`manga-${m.id}`}
                item={m}
                type="manga"
                coverImg={coverImg}
                rating={rating}
                isCompleted={isWatched}
                pct={pct}
                subLeft={subLeft}
                subRight={subRight}
                accentBorder="hover:border-purple-400/50"
                onClick={() => router.push(`/manga/${m.id}`)}
                onMouseEnter={(e) => handleCardMouseEnter(m, 'manga', e)}
                onMouseLeave={handleCardMouseLeave}
                onMobileMenuToggle={() => {
                  setActiveMobileMenu(activeMobileMenu?.id === m.id ? null : { type: 'manga', id: m.id, item: m });
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
