import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Film, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import MediaCard from '../cards/MediaCard';
import MediaRowSkeleton from '../skeletons/MediaRowSkeleton';

export default function MoviesSection({
  sortedMovies = [],
  moviesCount = 0,
  loadingMovies = false,
  setShowAddMovieModal,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const movieScrollRef = useRef(null);

  const scrollMovie = (direction) => {
    if (movieScrollRef.current) {
      const { scrollLeft, clientWidth } = movieScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      movieScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="movies" className="space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Film size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-wide text-white">Movies</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/movies')}
            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
            title="View All Movies in Library"
          >
            <span>All</span>
            <ChevronRight size={14} />
          </button>

          {sortedMovies.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => scrollMovie('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollMovie('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {loadingMovies ? (
        <MediaRowSkeleton count={6} />
      ) : sortedMovies.length === 0 ? (
        <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
            <Film size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Movies Added Yet</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              Track your local movie files (MP4, MKV, WEBM, AVI, MOV) with automatic TMDB metadata, posters, and playback progress!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMovieModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Plus size={14} />
            <span>+ Add Movie</span>
          </button>
        </div>
      ) : (
        /* Horizontal Slider */
        <div
          ref={movieScrollRef}
          className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
        >
          {sortedMovies.slice(0, 10).map((movie) => {
            const isWatched = Boolean(movie.watched || movie.completed || movie.watchStatus === 'Completed' || (movie.watchProgress && movie.watchProgress >= 95));
            const pct = movie.watchProgress || (movie.duration ? Math.min(100, Math.round(((movie.currentTime || 0) / movie.duration) * 100)) : 0);
            const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);
            const movieYear = movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : '');
            const runtimeStr = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : null;

            return (
              <MediaCard
                key={`movie-${movie.id}`}
                item={movie}
                type="movie"
                coverImg={coverImg}
                rating={movie.rating}
                isCompleted={isWatched}
                pct={pct}
                subLeft={movieYear || 'Movie'}
                subRight={runtimeStr || 'Feature'}
                accentBorder="hover:border-amber-400/50"
                onClick={() => router.push(`/movies/${movie.id}`)}
                onMouseEnter={(e) => handleCardMouseEnter(movie, 'movie', e)}
                onMouseLeave={handleCardMouseLeave}
                onMobileMenuToggle={() => {
                  setActiveMobileMenu(activeMobileMenu?.id === movie.id ? null : { type: 'movie', id: movie.id, item: movie });
                }}
              />
            );
          })}

          {sortedMovies.length > 10 && (
            <div
              onClick={() => router.push('/movies')}
              className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col transition shadow-md hover:shadow-xl bg-amber-950/10 hover:bg-amber-950/20 self-start"
            >
              <div className="aspect-[2/3] flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Film size={24} />
                </div>
                <div>
                  <span className="text-sm font-bold text-white block">See All Movies</span>
                  <span className="text-xs text-amber-400/80 font-mono mt-0.5 block">{moviesCount} total</span>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-extrabold flex items-center gap-1 group-hover:bg-amber-400 transition">
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
