import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get('tmdbId') || searchParams.get('id');
    const rawType = (searchParams.get('type') || 'movie').toLowerCase();
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim();

    const tmdbApiKey = process.env.TMDB_API_KEY || '';
    const isTv = rawType === 'tv' || rawType === 'web-series' || rawType === 'series';
    const endpoint = isTv ? 'tv' : 'movie';

    let recommendations = [];

    // 1. If we have a TMDB ID, try TMDB recommendations first
    if (tmdbId) {
      const cleanId = String(tmdbId).replace(/^[a-zA-Z_-]+/, '');
      try {
        const recUrl = `https://api.themoviedb.org/3/${endpoint}/${encodeURIComponent(cleanId)}/recommendations?api_key=${tmdbApiKey}&language=en-US&page=1`;
        const res = await fetch(recUrl, { next: { revalidate: 43200 } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            recommendations = data.results;
          }
        }
      } catch (err) {
        console.warn('[Rec API] Failed to fetch TMDB recommendations:', err);
      }

      // If recommendations is empty, try TMDB similar endpoint
      if (recommendations.length === 0) {
        try {
          const simUrl = `https://api.themoviedb.org/3/${endpoint}/${encodeURIComponent(cleanId)}/similar?api_key=${tmdbApiKey}&language=en-US&page=1`;
          const res = await fetch(simUrl, { next: { revalidate: 43200 } });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.results) && data.results.length > 0) {
              recommendations = data.results;
            }
          }
        } catch (err) {
          console.warn('[Rec API] Failed to fetch TMDB similar:', err);
        }
      }
    }

    // 2. Fallback: Search TMDB by query or trending if still empty
    if (recommendations.length === 0) {
      try {
        const searchUrl = query
          ? `https://api.themoviedb.org/3/search/${endpoint}?api_key=${tmdbApiKey}&language=en-US&query=${encodeURIComponent(query)}&page=1`
          : `https://api.themoviedb.org/3/trending/${endpoint}/week?api_key=${tmdbApiKey}`;
        const res = await fetch(searchUrl, { next: { revalidate: 43200 } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results)) {
            recommendations = data.results;
          }
        }
      } catch (err) {
        console.warn('[Rec API] Fallback search error:', err);
      }
    }

    // Format results cleanly
    const formatted = recommendations
      .filter((item) => item && (item.title || item.name) && item.poster_path)
      .slice(0, 18)
      .map((item) => ({
        id: `rec-${item.id}`,
        tmdbId: item.id,
        title: item.title || item.name || 'Untitled',
        originalTitle: item.original_title || item.original_name || '',
        overview: item.overview || '',
        posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
        rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
        voteCount: item.vote_count || 0,
        year: (item.release_date || item.first_air_date || '').split('-')[0] || '',
        releaseDate: item.release_date || item.first_air_date || '',
        contentType: isTv ? 'web-series' : 'movie',
      }));

    return NextResponse.json({
      success: true,
      recommendations: formatted,
    });
  } catch (error) {
    console.error('[Recommendations API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

