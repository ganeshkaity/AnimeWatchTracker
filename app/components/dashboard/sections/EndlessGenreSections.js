"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Film, Play, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import MediaCard from '../cards/MediaCard';

// Seed curated items matching user's Image 4 for "Action Movies" and diverse genres
const CURATED_GENRE_SEEDS = {
  'action-movies': [
    {
      id: 'seed-act-1',
      title: 'Singham Returns',
      type: 'movie',
      rating: '7.8',
      year: '2014',
      posterUrl: 'https://image.tmdb.org/t/p/w500/qjY7pXgD3p2v54QdC66i1r4Y0Gg.jpg',
    },
    {
      id: 'seed-act-2',
      title: 'Shang-Chi and The Legend of The Ten Rings',
      type: 'movie',
      rating: '7.9',
      year: '2021',
      posterUrl: 'https://image.tmdb.org/t/p/w500/1BIoJGKbXjdFDAvFarT3Ojh5q92.jpg',
    },
    {
      id: 'seed-act-3',
      title: 'Vikram',
      type: 'movie',
      rating: '8.3',
      year: '2022',
      posterUrl: 'https://image.tmdb.org/t/p/w500/h2P6F1i7vD0zP0vW9o2g9fV2i2v.jpg',
    },
    {
      id: 'seed-act-4',
      title: 'Empuraan: Lucifer 2',
      type: 'movie',
      rating: '8.5',
      year: '2025',
      posterUrl: 'https://image.tmdb.org/t/p/w500/9yY9oU7w7w8v8v7f7f7f7f7f7f7.jpg',
    },
    {
      id: 'seed-act-5',
      title: 'Aavesham',
      type: 'movie',
      rating: '8.2',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/3o9o9o9o9o9o9o9o9o9o9o9o9o9.jpg',
    },
    {
      id: 'seed-act-6',
      title: 'Iron Man',
      type: 'movie',
      rating: '8.4',
      year: '2008',
      posterUrl: 'https://image.tmdb.org/t/p/w500/78lPtwv72eTNqFW9COBYI0dWDJa.jpg',
    },
    {
      id: 'seed-act-7',
      title: 'Avengers: Infinity War',
      type: 'movie',
      rating: '8.7',
      year: '2018',
      posterUrl: 'https://image.tmdb.org/t/p/w500/mDfAV9uH9s6o8gG8v2f0s5u0e6d.jpg',
    },
    {
      id: 'seed-act-8',
      title: 'John Wick: Chapter 4',
      type: 'movie',
      rating: '8.6',
      year: '2023',
      posterUrl: 'https://image.tmdb.org/t/p/w500/vZloFAK7NKnMGKEHvY2ilR22jF8.jpg',
    },
  ],
  'action-anime': [
    {
      id: 'seed-ani-1',
      title: 'Jujutsu Kaisen',
      type: 'anime',
      rating: '8.8',
      year: '2020',
      posterUrl: 'https://image.tmdb.org/t/p/w500/fD14tP44Y0V1yS8Z4Zf9f9f9f9f.jpg',
    },
    {
      id: 'seed-ani-2',
      title: 'Demon Slayer: Kimetsu no Yaiba',
      type: 'anime',
      rating: '8.9',
      year: '2019',
      posterUrl: 'https://image.tmdb.org/t/p/w500/xUfRZu2mi8jH69hmV1KiMFF78q3.jpg',
    },
    {
      id: 'seed-ani-3',
      title: 'Attack on Titan',
      type: 'anime',
      rating: '9.1',
      year: '2013',
      posterUrl: 'https://image.tmdb.org/t/p/w500/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg',
    },
    {
      id: 'seed-ani-4',
      title: 'Solo Leveling',
      type: 'anime',
      rating: '8.6',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/geCRueV3ElhRTr0xtJuPxJ8BGdM.jpg',
    },
    {
      id: 'seed-ani-5',
      title: 'Bleach: Thousand-Year Blood War',
      type: 'anime',
      rating: '9.0',
      year: '2022',
      posterUrl: 'https://image.tmdb.org/t/p/w500/2Eewgp7o5AU1xCmuIOxte01nvXA.jpg',
    },
  ],
  'romance-drama': [
    {
      id: 'seed-rom-1',
      title: 'Your Name (Kimi no Na wa)',
      type: 'anime',
      rating: '9.2',
      year: '2016',
      posterUrl: 'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6qFsxWa93bu.jpg',
    },
    {
      id: 'seed-rom-2',
      title: 'La La Land',
      type: 'movie',
      rating: '8.5',
      year: '2016',
      posterUrl: 'https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkVJt0Rf0.jpg',
    },
    {
      id: 'seed-rom-3',
      title: 'A Silent Voice',
      type: 'anime',
      rating: '8.9',
      year: '2016',
      posterUrl: 'https://image.tmdb.org/t/p/w500/tuFaWiqX0TXoWu7DGNcmX3UW7sT.jpg',
    },
    {
      id: 'seed-rom-4',
      title: 'Titanic',
      type: 'movie',
      rating: '8.8',
      year: '1997',
      posterUrl: 'https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg',
    },
  ],
  'scifi-fantasy': [
    {
      id: 'seed-sci-1',
      title: 'Interstellar',
      type: 'movie',
      rating: '8.9',
      year: '2014',
      posterUrl: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    },
    {
      id: 'seed-sci-2',
      title: 'Dune: Part Two',
      type: 'movie',
      rating: '8.8',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    },
    {
      id: 'seed-sci-3',
      title: 'Steins;Gate',
      type: 'anime',
      rating: '9.1',
      year: '2011',
      posterUrl: 'https://image.tmdb.org/t/p/w500/5k3M5gQf2d1e2s3k4j5l6a7b8c9.jpg',
    },
    {
      id: 'seed-sci-4',
      title: 'Inception',
      type: 'movie',
      rating: '8.8',
      year: '2010',
      posterUrl: 'https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg',
    },
  ],
  'comedy-slice': [
    {
      id: 'seed-com-1',
      title: 'Spy x Family',
      type: 'anime',
      rating: '8.6',
      year: '2022',
      posterUrl: 'https://image.tmdb.org/t/p/w500/3r4Cd1pENbBsqE6t2v6Ww03qRrq.jpg',
    },
    {
      id: 'seed-com-2',
      title: 'Deadpool & Wolverine',
      type: 'movie',
      rating: '8.3',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
    },
    {
      id: 'seed-com-3',
      title: 'KonoSuba: God\'s Blessing',
      type: 'anime',
      rating: '8.4',
      year: '2016',
      posterUrl: 'https://image.tmdb.org/t/p/w500/4gV8LgK5o7c1x2z3b4v5n6m7q8w.jpg',
    },
    {
      id: 'seed-com-4',
      title: 'Ted Lasso',
      type: 'webseries',
      rating: '8.8',
      year: '2020',
      posterUrl: 'https://image.tmdb.org/t/p/w500/5fhZdwPmsUmHgQaox5e363sY714.jpg',
    },
  ],
  'crime-thriller': [
    {
      id: 'seed-crm-1',
      title: 'Death Note',
      type: 'anime',
      rating: '9.0',
      year: '2006',
      posterUrl: 'https://image.tmdb.org/t/p/w500/iigTJJskR1PcjjPLiNzV2JgZkH7.jpg',
    },
    {
      id: 'seed-crm-2',
      title: 'The Dark Knight',
      type: 'movie',
      rating: '9.0',
      year: '2008',
      posterUrl: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    },
    {
      id: 'seed-crm-3',
      title: 'Monster',
      type: 'anime',
      rating: '9.1',
      year: '2004',
      posterUrl: 'https://image.tmdb.org/t/p/w500/2gB1i5c3d4e5f6g7h8i9j0k1l2m.jpg',
    },
    {
      id: 'seed-crm-4',
      title: 'Breaking Bad',
      type: 'webseries',
      rating: '9.5',
      year: '2008',
      posterUrl: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    },
  ],
};

const GENRE_ROW_DEFINITIONS = [
  { id: 'action-movies', title: 'Action Movies', filterGenre: 'Action', mediaFilter: 'movie' },
  { id: 'action-anime', title: 'Action Anime', filterGenre: 'Action', mediaFilter: 'anime' },
  { id: 'romance-drama', title: 'Romance & Drama', filterGenre: 'Romance', mediaFilter: 'all' },
  { id: 'scifi-fantasy', title: 'Sci-Fi & Fantasy', filterGenre: 'Sci-Fi', mediaFilter: 'all' },
  { id: 'comedy-slice', title: 'Comedy & Slice of Life', filterGenre: 'Comedy', mediaFilter: 'all' },
  { id: 'crime-thriller', title: 'Crime & Mystery Thrillers', filterGenre: 'Crime', mediaFilter: 'all' },
];

export default function EndlessGenreSections({
  movies = [],
  animes = [],
  webseriesList = [],
  onSelectAnime,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(2);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerTargetRef = useRef(null);
  const rowRefs = useRef({});

  // Helper to scroll horizontal rows
  const scrollRow = (rowId, direction) => {
    const el = rowRefs.current[rowId];
    if (el) {
      const { scrollLeft, clientWidth } = el;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      el.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // IntersectionObserver for continuous endless scroll
  useEffect(() => {
    const target = observerTargetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && visibleCount < GENRE_ROW_DEFINITIONS.length) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + 2, GENRE_ROW_DEFINITIONS.length));
            setIsLoadingMore(false);
          }, 350);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoadingMore, visibleCount]);

  // Aggregate and sort items for each genre definition
  const genreRowsData = useMemo(() => {
    return GENRE_ROW_DEFINITIONS.slice(0, visibleCount).map((def) => {
      const gTerm = def.filterGenre.toLowerCase();

      // Filter library movies
      const matchedMovies = (movies || []).filter((m) => {
        if (def.mediaFilter === 'anime') return false;
        const gList = Array.isArray(m.genres) ? m.genres : (typeof m.genres === 'string' ? m.genres.split(',') : []);
        return gList.some((g) => g.trim().toLowerCase().includes(gTerm)) || (m.genre || '').toLowerCase().includes(gTerm);
      });

      // Filter library animes
      const matchedAnimes = (animes || []).filter((a) => {
        if (def.mediaFilter === 'movie') return false;
        const gList = Array.isArray(a.genres) ? a.genres : (typeof a.genres === 'string' ? a.genres.split(',') : []);
        return gList.some((g) => g.trim().toLowerCase().includes(gTerm)) || (a.genre || '').toLowerCase().includes(gTerm);
      });

      // Filter library webseries
      const matchedSeries = (webseriesList || []).filter((w) => {
        if (def.mediaFilter === 'movie' || def.mediaFilter === 'anime') return false;
        const gList = Array.isArray(w.genres) ? w.genres : (typeof w.genres === 'string' ? w.genres.split(',') : []);
        return gList.some((g) => g.trim().toLowerCase().includes(gTerm)) || (w.genre || '').toLowerCase().includes(gTerm);
      });

      // Combine library matches with curated seed items to guarantee a rich row matching Image 4
      const seedItems = CURATED_GENRE_SEEDS[def.id] || [];
      const combined = [
        ...matchedMovies.map((m) => ({ ...m, mediaType: 'movie' })),
        ...matchedAnimes.map((a) => ({ ...a, mediaType: 'anime' })),
        ...matchedSeries.map((s) => ({ ...s, mediaType: 'webseries' })),
        ...seedItems,
      ];

      // Remove duplicates by title
      const seenTitles = new Set();
      const uniqueItems = [];
      for (const item of combined) {
        const key = (item.title || '').trim().toLowerCase();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          uniqueItems.push(item);
        }
      }

      return {
        ...def,
        items: uniqueItems,
      };
    });
  }, [movies, animes, webseriesList, visibleCount]);

  return (
    <div className="space-y-8 pt-4">
      {genreRowsData.map((row) => (
        <section key={row.id} className="space-y-3">
          {/* Row Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
              <span>{row.title}</span>
            </h2>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollRow(row.id, 'left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollRow(row.id, 'right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Horizontal Slider with Minimal Gap (gap-1.5 sm:gap-2) and Title-in-Middle Loading */}
          <div
            ref={(el) => {
              if (el) rowRefs.current[row.id] = el;
            }}
            className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2 scroll-smooth select-none"
          >
            {row.items.map((item) => {
              const coverImg = item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
              const rating = item.rating || item.score || null;
              const isWatched = Boolean(item.watched || item.completed || item.isWatched || (item.watchProgress && item.watchProgress >= 95));
              const pct = item.watchProgress || item.progressPercent || 0;
              const subLeft = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : (item.mediaType === 'movie' ? 'Movie' : 'Anime'));
              const subRight = item.mediaType === 'movie' ? (item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : 'Feature') : (item.episodeCount ? `${item.episodeCount} Ep` : 'Series');

              return (
                <MediaCard
                  key={`${row.id}-${item.id}`}
                  item={item}
                  type={item.mediaType || 'movie'}
                  coverImg={coverImg}
                  rating={rating}
                  isCompleted={isWatched}
                  pct={pct}
                  subLeft={subLeft}
                  subRight={subRight}
                  accentBorder="hover:border-purple-400/50"
                  onClick={() => {
                    if (item.mediaType === 'movie' && !item.id.startsWith('seed-')) {
                      router.push(`/movies/${item.id}`);
                    } else if (item.mediaType === 'anime' && !item.id.startsWith('seed-') && onSelectAnime) {
                      onSelectAnime(item.id);
                    } else if (item.mediaType === 'webseries' && !item.id.startsWith('seed-')) {
                      router.push(`/webseries/${item.id}`);
                    }
                  }}
                  onMouseEnter={(e) => handleCardMouseEnter && handleCardMouseEnter(item, item.mediaType || 'movie', e)}
                  onMouseLeave={handleCardMouseLeave}
                  onMobileMenuToggle={() => {
                    if (setActiveMobileMenu) {
                      setActiveMobileMenu(activeMobileMenu?.id === item.id ? null : { type: item.mediaType || 'movie', id: item.id, item });
                    }
                  }}
                />
              );
            })}
          </div>
        </section>
      ))}

      {/* Endless Scroll Sentinel */}
      <div ref={observerTargetRef} className="py-6 flex items-center justify-center">
        {isLoadingMore && (
          <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
            <Loader2 size={16} className="animate-spin text-purple-400" />
            <span>Loading more recommendations...</span>
          </div>
        )}
      </div>
    </div>
  );
}
