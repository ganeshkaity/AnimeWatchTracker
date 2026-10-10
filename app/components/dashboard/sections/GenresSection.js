import React, { useRef } from 'react';
import { Compass, ChevronLeft, ChevronRight } from 'lucide-react';
import { GENRES_LIST } from '../utils/dashboardHelpers';

export default function GenresSection({
  selectedGenre = 'All',
  setSelectedGenre,
}) {
  const genresScrollRef = useRef(null);

  const scrollGenres = (direction) => {
    if (genresScrollRef.current) {
      const { scrollLeft, clientWidth } = genresScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      genresScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="genres" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#a855f7]">
            <Compass size={20} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
              Explore Genres
            </h2>
          </div>
        </div>

        {/* Scroll Navigation Arrows */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollGenres('left')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
            title="Scroll Genres Left"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollGenres('right')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
            title="Scroll Genres Right"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        ref={genresScrollRef}
        className="grid grid-rows-2 grid-flow-col auto-cols-max gap-2.5 overflow-x-auto no-scrollbar py-1 scroll-smooth"
      >
        {GENRES_LIST.map((genre) => (
          <button
            key={genre}
            type="button"
            onClick={() => setSelectedGenre(genre)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold glass-chip cursor-pointer transition select-none flex items-center justify-center shrink-0 ${selectedGenre === genre
              ? 'active text-white bg-[#7c5cff] shadow-md border-[#7c5cff]/50 font-bold'
              : 'text-gray-300 hover:text-white hover:bg-white/10 border-white/10'
              }`}
          >
            {genre}
          </button>
        ))}
      </div>
    </section>
  );
}
