import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Per-month server cache: key = "YYYY-MM" -> { items, updatedAt }
const monthCache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const TMDB_MOVIE_GENRES = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

function toFuzzyDateInt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return Number(`${y}${m}${d}`);
}

function isWithinAllowedRange(year, month) {
  const now = new Date();
  const baseIdx = now.getFullYear() * 12 + now.getMonth();
  const targetIdx = year * 12 + (month - 1);
  const diff = targetIdx - baseIdx;
  return diff >= -3 && diff <= 6;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      month < 1 ||
      month > 12 ||
      !isWithinAllowedRange(year, month)
    ) {
      return NextResponse.json(
        { success: false, error: 'Month is outside the allowed range (past 3 to upcoming 6 months).', items: [] },
        { status: 400 }
      );
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const cached = monthCache.get(monthKey);
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        year,
        month,
        monthKey,
        items: cached.items,
        cached: true,
      });
    }

    const lastDay = new Date(year, month, 0).getDate();
    const startDateStr = `${monthKey}-01`;
    const endDateStr = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

    // Exact FuzzyDate bounds for AniList
    const prevDay = new Date(year, month - 1, 0);
    const nextDay = new Date(year, month, 1);
    const startGreater = toFuzzyDateInt(prevDay);
    const startLesser = toFuzzyDateInt(nextDay);

    const apiKey = process.env.TMDB_API_KEY;

    // Fetch TMDB movies (pages 1 & 2) + AniList animes in parallel for ONLY this month
    const fetchMoviesPromise = (async () => {
      if (!apiKey) return [];
      const movies = [];
      const seen = new Set();

      for (let page = 1; page <= 2; page++) {
        try {
          const url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&include_adult=false&primary_release_date.gte=${startDateStr}&primary_release_date.lte=${endDateStr}&page=${page}`;
          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(9000),
          });
          if (!res.ok) continue;
          const data = await res.json();
          const list = Array.isArray(data?.results) ? data.results : [];
          for (const m of list) {
            if (!m.release_date || !m.release_date.startsWith(monthKey)) continue;
            if (!m.poster_path || seen.has(m.id)) continue;
            seen.add(m.id);

            movies.push({
              uid: `movie-${m.id}`,
              tmdbId: m.id,
              anilistId: null,
              mediaType: 'movie',
              contentType: 'movie',
              title: m.title || m.original_title || 'Untitled Movie',
              originalTitle: m.original_title || '',
              releaseDate: m.release_date,
              year: m.release_date.slice(0, 4),
              rating: m.vote_average ? Number(m.vote_average.toFixed(1)) : 0,
              popularity: Number(m.popularity || 0),
              overview: m.overview || '',
              genres: Array.isArray(m.genre_ids)
                ? m.genre_ids.map((id) => TMDB_MOVIE_GENRES[id]).filter(Boolean).slice(0, 4)
                : [],
              posterUrl: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
              backdropUrl: m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : '',
              url: `https://www.themoviedb.org/movie/${m.id}`,
            });
          }
        } catch (err) {
          console.warn(`[ReleaseCalendar] TMDB page ${page} error:`, err.message);
        }
      }
      return movies;
    })();

    const fetchAnimesPromise = (async () => {
      try {
        const query = `
          query {
            Page(page: 1, perPage: 50) {
              media(
                startDate_greater: ${startGreater},
                startDate_lesser: ${startLesser},
                sort: POPULARITY_DESC,
                type: ANIME,
                isAdult: false
              ) {
                id
                title {
                  english
                  romaji
                }
                coverImage {
                  extraLarge
                  large
                }
                bannerImage
                description(asHtml: false)
                format
                episodes
                averageScore
                popularity
                genres
                startDate {
                  year
                  month
                  day
                }
                siteUrl
              }
            }
          }
        `;

        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(9000),
        });

        if (!res.ok) return [];
        const data = await res.json();
        const media = data?.data?.Page?.media || [];
        const animes = [];

        for (const a of media) {
          const sd = a.startDate;
          if (!sd || sd.year !== year || sd.month !== month || !sd.day || sd.day < 1) continue;
          const poster = a.coverImage?.extraLarge || a.coverImage?.large || '';
          if (!poster) continue;

          const dayStr = String(sd.day).padStart(2, '0');
          animes.push({
            uid: `anime-${a.id}`,
            tmdbId: null,
            anilistId: a.id,
            mediaType: 'anime',
            contentType: 'anime',
            title: a.title?.english || a.title?.romaji || 'Untitled Anime',
            originalTitle: a.title?.romaji || '',
            releaseDate: `${monthKey}-${dayStr}`,
            year: String(year),
            rating: a.averageScore ? Number((a.averageScore / 10).toFixed(1)) : 0,
            popularity: Number(a.popularity || 0),
            overview: (a.description || '').replace(/<[^>]*>/g, '').trim(),
            genres: Array.isArray(a.genres) ? a.genres.slice(0, 4) : [],
            format: a.format || 'TV',
            episodesCount: a.episodes || 0,
            posterUrl: poster,
            backdropUrl: a.bannerImage || '',
            url: a.siteUrl || `https://anilist.co/anime/${a.id}`,
          });
        }
        return animes;
      } catch (err) {
        console.warn('[ReleaseCalendar] AniList error:', err.message);
        return [];
      }
    })();

    const [movieItems, animeItems] = await Promise.all([fetchMoviesPromise, fetchAnimesPromise]);

    const items = [...movieItems, ...animeItems].sort((a, b) => {
      if (a.releaseDate !== b.releaseDate) return a.releaseDate.localeCompare(b.releaseDate);
      return (b.popularity || 0) - (a.popularity || 0);
    });

    monthCache.set(monthKey, { items, updatedAt: Date.now() });

    return NextResponse.json({
      success: true,
      year,
      month,
      monthKey,
      items,
      cached: false,
    });
  } catch (err) {
    console.error('[ReleaseCalendar API Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to load release calendar', items: [] },
      { status: 500 }
    );
  }
}
