import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';

// Helper to search TMDB TV
async function searchTmdbTv(searchTerm, apiKey, isAnime) {
  if (!searchTerm || !searchTerm.trim()) return null;
  const term = searchTerm.trim();
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(term)}&page=1`;
    const res = await fetch(searchUrl, { headers: { Accept: 'application/json' }, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length === 0) return null;

    if (isAnime) {
      // 1. Look for anime match (origin_country contains JP or genre 16 = animation)
      const animeMatch = results.find(
        (r) => (r.origin_country && r.origin_country.includes('JP')) || (r.genre_ids && r.genre_ids.includes(16))
      );
      if (animeMatch) return String(animeMatch.id);
    }

    // 2. Exact name match (case-insensitive)
    const exactMatch = results.find(
      (r) => r.name?.toLowerCase() === term.toLowerCase() || r.original_name?.toLowerCase() === term.toLowerCase()
    );
    if (exactMatch) return String(exactMatch.id);

    // 3. First result
    return String(results[0].id);
  } catch (err) {
    return null;
  }
}

// Helper to search TMDB Multi (fallback)
async function searchTmdbMulti(searchTerm, apiKey) {
  if (!searchTerm || !searchTerm.trim()) return null;
  try {
    const multiUrl = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(searchTerm.trim())}&page=1`;
    const res = await fetch(multiUrl, { headers: { Accept: 'application/json' }, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    const tvMatch = results.find((r) => r.media_type === 'tv');
    if (tvMatch) return String(tvMatch.id);
    return null;
  } catch (err) {
    return null;
  }
}

// Helper to query AniList for alternative titles and episode count
async function fetchAniListInfo(anilistId, query) {
  try {
    const isIdLookup = anilistId && !isNaN(Number(anilistId));
    const gql = `
      query ($id: Int, $search: String) {
        Media(id: $id, search: $search, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          episodes
        }
      }
    `;
    const variables = isIdLookup ? { id: Number(anilistId) } : { search: query };
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables }),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.Media || null;
  } catch (err) {
    return null;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('id') || '';
    const rawTmdbId = searchParams.get('tmdbId') || '';
    const rawAnilistId = searchParams.get('anilistId') || '';
    const rawType = (searchParams.get('type') || '').toLowerCase();
    const isAnime = rawType === 'anime';

    const query = (searchParams.get('q') || searchParams.get('query') || searchParams.get('title') || searchParams.get('name') || '').trim();
    const englishTitle = (searchParams.get('englishTitle') || '').trim();
    const originalTitle = (searchParams.get('originalTitle') || '').trim();
    const romajiTitle = (searchParams.get('romajiTitle') || '').trim();

    const tmdbApiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;

    let targetTmdbId = '';

    // 1. Validate rawTmdbId: must be a reasonable TMDB ID, not a timestamp or prefixed string
    if (rawTmdbId && !String(rawTmdbId).startsWith('watchlist-') && !String(rawTmdbId).startsWith('anilist-')) {
      const num = Number(rawTmdbId);
      if (!isNaN(num) && num > 0 && num < 10000000) {
        targetTmdbId = String(num);
      }
    }

    // 2. Check if rawId explicitly starts with tmdb-
    if (!targetTmdbId && rawId && rawId.startsWith('tmdb-')) {
      const candidate = rawId.replace(/^tmdb-/, '').trim();
      if (/^\d+$/.test(candidate) && Number(candidate) < 10000000) {
        targetTmdbId = candidate;
      }
    }

    // 3. For non-anime content, accept numeric ID if not a timestamp/prefixed
    if (
      !targetTmdbId &&
      rawId &&
      !isAnime &&
      !rawId.startsWith('watchlist-') &&
      !rawId.startsWith('anilist-') &&
      !rawId.startsWith('anime-') &&
      /^\d+$/.test(rawId) &&
      Number(rawId) < 10000000
    ) {
      targetTmdbId = rawId;
    }

    // Determine anilistId candidate
    let anilistId = rawAnilistId || (rawId.startsWith('anilist-') ? rawId.replace(/^anilist-/, '') : '');

    let tvData = null;

    // 4. If targetTmdbId exists, test it with TMDB
    if (targetTmdbId) {
      try {
        const tvUrl = `https://api.themoviedb.org/3/tv/${encodeURIComponent(targetTmdbId)}?api_key=${tmdbApiKey}&language=en-US`;
        const tvRes = await fetch(tvUrl, { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } });
        if (tvRes.ok) {
          tvData = await tvRes.json();
        } else {
          console.warn(`[Seasons API] TMDB TV lookup with ID ${targetTmdbId} returned status ${tvRes.status}. Falling back to search.`);
          targetTmdbId = '';
        }
      } catch (err) {
        console.warn(`[Seasons API] TMDB TV lookup failed for ID ${targetTmdbId}:`, err);
        targetTmdbId = '';
      }
    }

    // 5. If still no valid TMDB ID / data, search by titles
    if (!tvData) {
      const searchTerms = [];
      if (englishTitle) searchTerms.push(englishTitle);
      if (query && !searchTerms.includes(query)) searchTerms.push(query);
      if (romajiTitle && !searchTerms.includes(romajiTitle)) searchTerms.push(romajiTitle);
      if (originalTitle && !searchTerms.includes(originalTitle)) searchTerms.push(originalTitle);

      // Cleaned variants
      const extraTerms = [];
      for (const term of searchTerms) {
        if (term.includes(':') || term.includes('-') || term.includes('(')) {
          const clean = term.split(/[:\-(]/)[0].trim();
          if (clean && clean.length > 2 && !searchTerms.includes(clean) && !extraTerms.includes(clean)) {
            extraTerms.push(clean);
          }
        }
        const seasonStripped = term.replace(/season\s*\d+|part\s*\d+|\b2nd\b|\b3rd\b|\b4th\b|\btv\b|\bfinal\b|\barc\b/gi, '').trim();
        if (seasonStripped && seasonStripped.length > 2 && !searchTerms.includes(seasonStripped) && !extraTerms.includes(seasonStripped)) {
          extraTerms.push(seasonStripped);
        }
      }

      const allTerms = [...searchTerms, ...extraTerms];

      for (const term of allTerms) {
        const foundId = await searchTmdbTv(term, tmdbApiKey, isAnime);
        if (foundId) {
          targetTmdbId = foundId;
          break;
        }
      }

      // Multi search fallback
      if (!targetTmdbId && query) {
        targetTmdbId = await searchTmdbMulti(query, tmdbApiKey);
      }
    }

    // 6. AniList fallback for Anime: resolve English/Romaji titles from AniList GraphQL and re-search TMDB
    let aniMedia = null;
    if (!targetTmdbId && (anilistId || (isAnime && query))) {
      try {
        aniMedia = await fetchAniListInfo(anilistId, query);
        if (aniMedia?.title) {
          const aniTitles = [aniMedia.title.english, aniMedia.title.romaji, aniMedia.title.native].filter(Boolean);
          for (const aTitle of aniTitles) {
            const foundId = await searchTmdbTv(aTitle, tmdbApiKey, true);
            if (foundId) {
              targetTmdbId = foundId;
              break;
            }
          }
        }
      } catch (aniErr) {
        console.warn('[Seasons API] AniList title search fallback error:', aniErr);
      }
    }

    // 7. Fetch TV show data if targetTmdbId was newly resolved
    if (targetTmdbId && !tvData) {
      try {
        const tvUrl = `https://api.themoviedb.org/3/tv/${encodeURIComponent(targetTmdbId)}?api_key=${tmdbApiKey}&language=en-US`;
        const tvRes = await fetch(tvUrl, { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } });
        if (tvRes.ok) {
          tvData = await tvRes.json();
        }
      } catch (err) {
        console.warn(`[Seasons API] Failed to fetch TV details for ${targetTmdbId}:`, err);
      }
    }

    // 8. If we have TMDB TV data, extract and fetch all seasons & episodes
    if (tvData) {
      const rawSeasons = Array.isArray(tvData.seasons) ? tvData.seasons : [];
      const validSeasons = rawSeasons.filter((s) => s.season_number > 0);
      const targetSeasons = validSeasons.length > 0 ? validSeasons : rawSeasons;

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

      const totalEpisodesCount = seasonsWithEpisodes.reduce((acc, s) => acc + (s.episodes?.length || s.episodeCount || 0), 0);

      return NextResponse.json({
        success: true,
        tmdbId: targetTmdbId,
        showName: tvData.name || '',
        seasonsCount: tvData.number_of_seasons || seasonsWithEpisodes.length,
        episodesCount: tvData.number_of_episodes || totalEpisodesCount,
        seasons: seasonsWithEpisodes,
      });
    }

    // 9. Graceful fallback: If TMDB TV show wasn't found but AniList gave episode count
    if (aniMedia && aniMedia.episodes > 0) {
      const epCount = aniMedia.episodes;
      const dummyEpisodes = Array.from({ length: epCount }, (_, i) => ({
        id: `ani-ep-${aniMedia.id}-${i + 1}`,
        episodeNumber: i + 1,
        seasonNumber: 1,
        name: `Episode ${i + 1}`,
        overview: '',
        airDate: '',
        runtime: 24,
        voteAverage: null,
        voteCount: 0,
        stillUrl: null,
      }));

      return NextResponse.json({
        success: true,
        tmdbId: null,
        anilistId: aniMedia.id,
        showName: aniMedia.title?.english || aniMedia.title?.romaji || query,
        seasonsCount: 1,
        episodesCount: epCount,
        seasons: [
          {
            id: 1,
            seasonNumber: 1,
            name: 'Season 1',
            overview: '',
            episodeCount: epCount,
            airDate: '',
            posterUrl: null,
            episodes: dummyEpisodes,
          },
        ],
      });
    }

    return NextResponse.json(
      { success: false, error: 'Could not find show details or seasons for this title' },
      { status: 404 }
    );
  } catch (error) {
    console.error('[Watchlist Seasons API Error]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error fetching seasons' },
      { status: 500 }
    );
  }
}
