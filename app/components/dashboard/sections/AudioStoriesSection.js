import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Headphones, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import MediaCard from '../cards/MediaCard';
import MediaRowSkeleton from '../skeletons/MediaRowSkeleton';
import { getDeterministicRating } from '../utils/dashboardHelpers';

export default function AudioStoriesSection({
  sortedAudioStories = [],
  loadingAudioStories = false,
  setShowAddAudioStoryModal,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const audioStoryScrollRef = useRef(null);

  const scrollAudioStory = (direction) => {
    if (audioStoryScrollRef.current) {
      const { scrollLeft, clientWidth } = audioStoryScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      audioStoryScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="audios" className="space-y-4 scroll-mt-24">
      <span id="audio-stories" className="sr-only" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Headphones size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-wide text-white">Audio Stories</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sortedAudioStories.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => scrollAudioStory('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollAudioStory('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {loadingAudioStories ? (
        <MediaRowSkeleton count={6} />
      ) : sortedAudioStories.length === 0 ? (
        <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
            <Headphones size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Audio Stories Tracked Yet</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              Connect any local folder with audio chapters (MP3, M4A, FLAC) or narrative video files (MP4, MKV) to start listening!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddAudioStoryModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-black font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Plus size={14} />
            <span>Track Audio Stories Folder</span>
          </button>
        </div>
      ) : (
        <div
          ref={audioStoryScrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
        >
          {sortedAudioStories.map((s) => {
            const isWatched = Boolean(s.isWatched || s.progressPercent === 100 || s.status === 'completed');
            const pct = Number(s.progressPercent || 0);
            const coverImg = s.thumbnailBase64 || (s.thumbnailPath ? `/api/image?path=${encodeURIComponent(s.thumbnailPath)}` : (s.coverUrl || s.posterUrl || null));
            const rating = getDeterministicRating(s.id, s.rating);
            const subLeft = s.lastWatchedTrack || (s.completedTracks ? `Tr ${s.completedTracks}` : (s.year || 'Audio'));
            const subRight = s.totalTracks ? `${s.totalTracks} Tr` : (s.trackCount ? `${s.trackCount} Tr` : 'Audio');

            return (
              <MediaCard
                key={`audio-${s.id}`}
                item={s}
                type="audioStory"
                coverImg={coverImg}
                rating={rating}
                isCompleted={isWatched}
                pct={pct}
                subLeft={subLeft}
                subRight={subRight}
                accentBorder="hover:border-cyan-400/50"
                onClick={() => router.push(`/audio-story/${s.id}`)}
                onMouseEnter={(e) => handleCardMouseEnter(s, 'audioStory', e)}
                onMouseLeave={handleCardMouseLeave}
                onMobileMenuToggle={() => {
                  setActiveMobileMenu(activeMobileMenu?.id === s.id ? null : { type: 'audioStory', id: s.id, item: s });
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
