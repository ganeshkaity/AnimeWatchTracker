import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const imdbIdParam = searchParams.get('imdbId')?.trim() || '';
    const rawTitle = searchParams.get('title')?.trim() || '';
    const yearParam = searchParams.get('year')?.trim() || '';
    const typeParam = searchParams.get('type')?.trim() || '';

    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'OMDB_API_KEY is not configured in environment variables' },
        { status: 500 }
      );
    }

    if (!imdbIdParam && !rawTitle) {
      return NextResponse.json(
        { success: false, error: 'Either title or imdbId must be provided' },
        { status: 400 }
      );
    }

    // Clean title from common suffixes like (2020), [Dual Audio], etc.
    const cleanTitle = rawTitle
      .replace(/\s*\(\d{4}\).*/i, '')
      .replace(/\s*\[.*?\].*/g, '')
      .replace(/\s*-\s*Season\s*\d+.*/i, '')
      .replace(/\s*Season\s*\d+.*/i, '')
      .trim();

    // Map types if appropriate
    let omdbType = '';
    if (typeParam) {
      const lower = typeParam.toLowerCase();
      if (lower.includes('movie') || lower.includes('film')) omdbType = 'movie';
      else if (lower.includes('series') || lower.includes('tv') || lower.includes('anime')) omdbType = 'series';
    }

    let omdbData = null;

    // 1. Try querying by IMDb ID if provided
    if (imdbIdParam && imdbIdParam.startsWith('tt')) {
      try {
        const res = await fetch(
          `https://www.omdbapi.com/?apikey=${apiKey}&i=${encodeURIComponent(imdbIdParam)}`
        );
        const data = await res.json();
        if (data && data.Response === 'True') {
          omdbData = data;
        }
      } catch (err) {
        console.warn('[OMDB] Fetch by IMDb ID failed:', err.message);
      }
    }

    // 2. Try querying by title + year + type
    if (!omdbData && cleanTitle) {
      try {
        let url = `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(cleanTitle)}`;
        if (yearParam) url += `&y=${encodeURIComponent(yearParam)}`;
        if (omdbType) url += `&type=${encodeURIComponent(omdbType)}`;

        const res = await fetch(url);
        const data = await res.json();
        if (data && data.Response === 'True') {
          omdbData = data;
        }
      } catch (err) {
        console.warn('[OMDB] Fetch by title+year failed:', err.message);
      }
    }

    // 3. Fallback: try title without year
    if (!omdbData && cleanTitle && yearParam) {
      try {
        let url = `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(cleanTitle)}`;
        if (omdbType) url += `&type=${encodeURIComponent(omdbType)}`;

        const res = await fetch(url);
        const data = await res.json();
        if (data && data.Response === 'True') {
          omdbData = data;
        }
      } catch (err) {
        console.warn('[OMDB] Fetch by title without year failed:', err.message);
      }
    }

    // 4. Fallback: try title without type
    if (!omdbData && cleanTitle && omdbType) {
      try {
        const url = `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(cleanTitle)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.Response === 'True') {
          omdbData = data;
        }
      } catch (err) {
        console.warn('[OMDB] Fetch by title without type failed:', err.message);
      }
    }

    // 5. Fallback: Search mode (s=...) and pick best match
    if (!omdbData && cleanTitle) {
      try {
        const searchUrl = `https://www.omdbapi.com/?apikey=${apiKey}&s=${encodeURIComponent(cleanTitle)}`;
        const res = await fetch(searchUrl);
        const data = await res.json();
        if (data && data.Response === 'True' && Array.isArray(data.Search) && data.Search.length > 0) {
          const firstMatch = data.Search[0];
          if (firstMatch.imdbID) {
            const detailRes = await fetch(
              `https://www.omdbapi.com/?apikey=${apiKey}&i=${encodeURIComponent(firstMatch.imdbID)}`
            );
            const detailData = await detailRes.json();
            if (detailData && detailData.Response === 'True') {
              omdbData = detailData;
            }
          }
        }
      } catch (err) {
        console.warn('[OMDB] Search fallback failed:', err.message);
      }
    }

    if (!omdbData) {
      return NextResponse.json({
        success: false,
        error: 'No OMDB data found for this title',
        query: { title: cleanTitle, year: yearParam, imdbId: imdbIdParam }
      });
    }

    // Parse ratings
    const ratings = Array.isArray(omdbData.Ratings) ? omdbData.Ratings : [];
    
    // Rotten Tomatoes
    const rtItem = ratings.find(r => 
      r.Source === 'Rotten Tomatoes' || 
      (typeof r.Source === 'string' && r.Source.toLowerCase().includes('rotten'))
    );
    const rottenTomatoes = rtItem?.Value || null;
    let rottenTomatoesScore = null;
    if (rottenTomatoes) {
      const match = rottenTomatoes.match(/(\d+)/);
      if (match) rottenTomatoesScore = parseInt(match[1], 10);
    }

    // Metacritic
    const metaItem = ratings.find(r => 
      r.Source === 'Metacritic' || 
      (typeof r.Source === 'string' && r.Source.toLowerCase().includes('metacritic'))
    );
    const metascoreRaw = omdbData.Metascore && omdbData.Metascore !== 'N/A' ? omdbData.Metascore : (metaItem?.Value || null);
    let metacriticScore = null;
    if (metascoreRaw) {
      const match = String(metascoreRaw).match(/(\d+)/);
      if (match) metacriticScore = parseInt(match[1], 10);
    }

    // IMDb
    const imdbRating = omdbData.imdbRating && omdbData.imdbRating !== 'N/A' ? omdbData.imdbRating : null;
    const imdbVotes = omdbData.imdbVotes && omdbData.imdbVotes !== 'N/A' ? omdbData.imdbVotes : null;
    const imdbId = omdbData.imdbID && omdbData.imdbID !== 'N/A' ? omdbData.imdbID : null;

    // Awards & BoxOffice
    const awards = omdbData.Awards && omdbData.Awards !== 'N/A' ? omdbData.Awards : null;
    const boxOffice = omdbData.BoxOffice && omdbData.BoxOffice !== 'N/A' ? omdbData.BoxOffice : null;
    const rated = omdbData.Rated && omdbData.Rated !== 'N/A' ? omdbData.Rated : null;

    const parsedOmdb = {
      imdbId,
      imdbRating,
      imdbVotes,
      rottenTomatoes,
      rottenTomatoesScore,
      metacritic: metascoreRaw,
      metacriticScore,
      awards,
      boxOffice,
      rated,
      rawRatings: ratings,
      fetchedAt: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      omdb: parsedOmdb,
      title: omdbData.Title,
      year: omdbData.Year,
    });
  } catch (error) {
    console.error('[OMDB API Route] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
