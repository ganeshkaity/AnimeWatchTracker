import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let cachedUpcomingMovies = null;
let cacheTime = 0;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function getTomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const now = Date.now();
  if (cachedUpcomingMovies && (now - cacheTime < CACHE_DURATION_MS)) {
    return NextResponse.json({
      success: true,
      movies: cachedUpcomingMovies,
      cached: true,
      updatedAt: cacheTime,
    });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'TMDB_API_KEY is not configured', movies: [] },
      { status: 500 }
    );
  }

  try {
    const tomorrowStr = getTomorrowDateStr();
    const collected = [];
    const seenIds = new Set();

    // Fetch strictly unreleased movies (primary_release_date.gte = tomorrow)
    for (let page = 1; page <= 3 && collected.length < 10; page++) {
      const discoverUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&include_adult=false&primary_release_date.gte=${tomorrowStr}&page=${page}`;
      const res = await fetch(discoverUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const rawList = Array.isArray(data?.results) ? data.results : [];

      for (const m of rawList) {
        if (collected.length >= 10) break;
        if (!m.poster_path || !m.release_date || m.release_date < tomorrowStr) continue;
        if (seenIds.has(m.id)) continue;
        seenIds.add(m.id);

        collected.push({
          id: m.id,
          tmdbId: m.id,
          title: m.title || m.original_title || 'Untitled Movie',
          originalTitle: m.original_title || '',
          poster: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
          posterUrl: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
          backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : '',
          backdropUrl: m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : '',
          releaseDate: m.release_date,
          year: m.release_date.slice(0, 4),
          rating: m.vote_average ? Number(m.vote_average).toFixed(1) : null,
          overview: m.overview || '',
          language: m.original_language || 'en',
          url: `https://www.themoviedb.org/movie/${m.id}`,
        });
      }
    }

    cachedUpcomingMovies = collected;
    cacheTime = now;

    return NextResponse.json({
      success: true,
      movies: collected,
      cached: false,
      updatedAt: now,
    });
  } catch (err) {
    console.error('[Upcoming Movies API Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch upcoming movies', movies: cachedUpcomingMovies || [] },
      { status: 500 }
    );
  }
}
