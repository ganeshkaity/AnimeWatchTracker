import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('id') || '';
    const rawTmdbId = searchParams.get('tmdbId') || '';
    const query = (searchParams.get('q') || searchParams.get('query') || searchParams.get('title') || '').trim();

    const tmdbApiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;

    let targetTmdbId = rawTmdbId || (rawId.startsWith('tmdb-') ? rawId.replace(/^tmdb-/, '') : '');

    // If ID is like watchlist-84958 or numeric
    if (!targetTmdbId && rawId) {
      const match = rawId.match(/\d+/);
      if (match) targetTmdbId = match[0];
    }

    // If still no TMDB ID, search by title on TMDB TV
    if (!targetTmdbId && query) {
      try {
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&language=en-US&query=${encodeURIComponent(query)}&page=1`,
          { headers: { Accept: 'application/json' }, next: { revalidate: 3600 } }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.results && searchData.results.length > 0) {
            targetTmdbId = String(searchData.results[0].id);
          }
        }
      } catch (err) {
        console.warn('[Seasons API] TMDB TV search failed:', err);
      }
    }

    if (!targetTmdbId) {
      return NextResponse.json(
        { success: false, error: 'TMDB ID or searchable title is required to fetch seasons' },
        { status: 400 }
      );
    }

    // Fetch Show details to get all seasons
    const tvUrl = `https://api.themoviedb.org/3/tv/${encodeURIComponent(targetTmdbId)}?api_key=${tmdbApiKey}&language=en-US`;
    const tvRes = await fetch(tvUrl, { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } });

    if (!tvRes.ok) {
      return NextResponse.json(
        { success: false, error: `TMDB TV show not found (${tvRes.status})` },
        { status: tvRes.status }
      );
    }

    const tvData = await tvRes.json();
    const rawSeasons = Array.isArray(tvData.seasons) ? tvData.seasons : [];

    // Filter to regular seasons (season_number > 0), or if only season 0 exists, include it
    const validSeasons = rawSeasons.filter((s) => s.season_number > 0);
    const targetSeasons = validSeasons.length > 0 ? validSeasons : rawSeasons;

    // Fetch episodes for all seasons in parallel
    const seasonsWithEpisodes = await Promise.all(
      targetSeasons.map(async (s) => {
        try {
          const sRes = await fetch(
            `https://api.themoviedb.org/3/tv/${encodeURIComponent(targetTmdbId)}/season/${s.season_number}?api_key=${tmdbApiKey}&language=en-US`,
            { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } }
          );

          if (!sRes.ok) {
            return {
              id: s.id,
              seasonNumber: s.season_number,
              name: s.name || `Season ${s.season_number}`,
              overview: s.overview || '',
              episodeCount: s.episode_count || 0,
              airDate: s.air_date || '',
              posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
              episodes: [],
            };
          }

          const sData = await sRes.json();
          const epList = (sData.episodes || []).map((ep) => ({
            id: ep.id,
            episodeNumber: ep.episode_number,
            seasonNumber: ep.season_number,
            name: ep.name || `Episode ${ep.episode_number}`,
            overview: ep.overview || '',
            airDate: ep.air_date || '',
            runtime: ep.runtime || 0,
            voteAverage: ep.vote_average ? Number(ep.vote_average.toFixed(1)) : null,
            voteCount: ep.vote_count || 0,
            stillUrl: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null,
          }));

          return {
            id: s.id,
            seasonNumber: s.season_number,
            name: s.name || `Season ${s.season_number}`,
            overview: sData.overview || s.overview || '',
            episodeCount: epList.length || s.episode_count || 0,
            airDate: sData.air_date || s.air_date || '',
            posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
            episodes: epList,
          };
        } catch (sErr) {
          console.warn(`[Seasons API] Failed to fetch season ${s.season_number}:`, sErr);
          return {
            id: s.id,
            seasonNumber: s.season_number,
            name: s.name || `Season ${s.season_number}`,
            overview: s.overview || '',
            episodeCount: s.episode_count || 0,
            airDate: s.air_date || '',
            posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
            episodes: [],
          };
        }
      })
    );

    // Calculate total episodes count across fetched seasons
    const totalEpisodesCount = seasonsWithEpisodes.reduce((acc, s) => acc + (s.episodes?.length || s.episodeCount || 0), 0);

    return NextResponse.json({
      success: true,
      tmdbId: targetTmdbId,
      showName: tvData.name || '',
      seasonsCount: tvData.number_of_seasons || seasonsWithEpisodes.length,
      episodesCount: tvData.number_of_episodes || totalEpisodesCount,
      seasons: seasonsWithEpisodes,
    });
  } catch (error) {
    console.error('[Watchlist Seasons API Error]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error fetching seasons' },
      { status: 500 }
    );
  }
}
