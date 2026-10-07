import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query');

    if (!query || !query.trim()) {
      return NextResponse.json({ success: true, results: [] });
    }

    const apiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;
    const cleanQuery = query.trim();

    const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}&include_adult=true&language=en-US&page=1`;

    const res = await fetch(tmdbUrl, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[TMDB Search Error]', res.status, errText);
      return NextResponse.json(
        { success: false, error: `TMDB API error (${res.status})` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawResults = data.results || [];

    const formatted = rawResults.map((item) => {
      const releaseYear = item.release_date ? item.release_date.split('-')[0] : '';
      const posterUrl = item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null;
      const backdropUrl = item.backdrop_path
        ? `https://image.tmdb.org/t/p/original${item.backdrop_path}`
        : null;

      return {
        id: item.id,
        tmdbId: item.id,
        title: item.title || item.original_title || 'Untitled Movie',
        originalTitle: item.original_title || '',
        releaseDate: item.release_date || '',
        year: releaseYear,
        rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
        voteCount: item.vote_count || 0,
        overview: item.overview || '',
        posterPath: item.poster_path || '',
        posterUrl,
        backdropPath: item.backdrop_path || '',
        backdropUrl,
        language: item.original_language || 'en',
      };
    });

    return NextResponse.json({
      success: true,
      results: formatted,
    });
  } catch (err) {
    console.error('[Movie Search Route Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error while searching movies' },
      { status: 500 }
    );
  }
}
