import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';
const DEFAULT_FANART_KEY = 'd2d31f9ecabea050fc7d68aa3146015f';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();

    if (!query) {
      return NextResponse.json({ success: true, results: [] });
    }

    const tmdbApiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;
    const fanartApiKey = process.env.FANART_API_KEY || DEFAULT_FANART_KEY;

    const aniListPromise = fetchAniList(query);
    const fanartPromise = fetchFanartPosters(query, tmdbApiKey, fanartApiKey);
    const jikanPromise = fetchJikan(query);

    const [aniSettled, fanartSettled, jikanSettled] = await Promise.allSettled([
      aniListPromise,
      fanartPromise,
      jikanPromise,
    ]);

    const aniResults = aniSettled.status === 'fulfilled' ? aniSettled.value : [];
    const fanartResults = fanartSettled.status === 'fulfilled' ? fanartSettled.value : [];
    let jikanResults = jikanSettled.status === 'fulfilled' ? jikanSettled.value : [];

    // Fallback: If Jikan failed, fetch from Kitsu
    if (jikanResults.length === 0 && fanartResults.length === 0) {
      try {
        jikanResults = await fetchKitsu(query);
      } catch (kitsuErr) {
        console.warn('Kitsu fallback error:', kitsuErr.message);
      }
    }

    // Interleave or combine results with AniList and Fanart prioritized
    const results = [];
    const maxLen = Math.max(aniResults.length, fanartResults.length, jikanResults.length);
    for (let i = 0; i < maxLen; i++) {
      if (aniResults[i]) results.push(aniResults[i]);
      if (fanartResults[i]) results.push(fanartResults[i]);
      if (jikanResults[i]) results.push(jikanResults[i]);
    }

    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      results,
      providers: {
        aniList: aniResults.length,
        fanart: fanartResults.length,
        jikan: jikanResults.length,
      },
    });
  } catch (err) {
    console.error('Anime covers search API error:', err);
    return NextResponse.json({ success: false, error: err.message, results: [] }, { status: 500 });
  }
}

async function fetchAniList(query) {
  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
            medium
          }
          startDate {
            year
          }
          format
        }
      }
    }
  `;

  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query: gqlQuery,
      variables: { search: query },
    }),
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    throw new Error(`AniList returned status ${res.status}`);
  }

  const json = await res.json();
  const media = json?.data?.Page?.media || [];

  return media.map((item) => {
    const title = item.title?.english || item.title?.romaji || item.title?.native || 'Anime';
    const imageUrl = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium;
    return {
      id: `anilist-${item.id}`,
      source: 'AniList',
      title,
      imageUrl,
      thumbnailUrl: item.coverImage?.medium || imageUrl,
      year: item.startDate?.year || null,
      format: item.format || 'Anime',
    };
  }).filter((item) => !!item.imageUrl);
}

async function fetchFanartPosters(query, tmdbApiKey, fanartApiKey) {
  try {
    const tvSearchRes = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
      { signal: AbortSignal.timeout(4000) }
    );
    const tvData = await tvSearchRes.json();
    const tvShow = tvData.results?.[0];

    let tvdbId = null;
    if (tvShow) {
      const extRes = await fetch(
        `https://api.themoviedb.org/3/tv/${tvShow.id}/external_ids?api_key=${tmdbApiKey}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (extRes.ok) {
        const extData = await extRes.json();
        tvdbId = extData.tvdb_id;
      }
    }

    if (tvdbId) {
      const fanartUrl = `https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${fanartApiKey}`;
      const fRes = await fetch(fanartUrl, { signal: AbortSignal.timeout(5000) });
      if (fRes.ok) {
        const d = await fRes.json();
        const rawPosters = [...(d.tvposter || []), ...(d.seasonposter || [])];
        return rawPosters.slice(0, 8).map((p, idx) => ({
          id: `fanart-tv-${p.id || idx}`,
          source: 'Fanart.tv',
          title: query,
          imageUrl: p.url,
          thumbnailUrl: p.url,
          year: null,
          format: 'Official Fanart Poster',
        }));
      }
    }

    // Try movie search
    const movieSearchRes = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (movieSearchRes.ok) {
      const mData = await movieSearchRes.json();
      const movie = mData.results?.[0];
      if (movie) {
        const fanartUrl = `https://webservice.fanart.tv/v3/movies/${movie.id}?api_key=${fanartApiKey}`;
        const fRes = await fetch(fanartUrl, { signal: AbortSignal.timeout(5000) });
        if (fRes.ok) {
          const d = await fRes.json();
          const rawPosters = Array.isArray(d.movieposter) ? d.movieposter : [];
          return rawPosters.slice(0, 8).map((p, idx) => ({
            id: `fanart-movie-${p.id || idx}`,
            source: 'Fanart.tv',
            title: query,
            imageUrl: p.url,
            thumbnailUrl: p.url,
            year: movie.release_date?.split('-')[0] || null,
            format: 'Official Fanart Poster',
          }));
        }
      }
    }
  } catch (err) {
    console.warn('[fetchFanartPosters error]:', err.message);
  }
  return [];
}

async function fetchJikan(query) {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=6&sfw=true`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    throw new Error(`Jikan returned status ${res.status}`);
  }

  const json = await res.json();
  const list = json?.data || [];

  return list.map((item) => {
    const title = item.title_english || item.title || item.title_japanese || 'Anime';
    const imageUrl =
      item.images?.jpg?.large_image_url ||
      item.images?.webp?.large_image_url ||
      item.images?.jpg?.image_url;
    return {
      id: `jikan-${item.mal_id}`,
      source: 'Jikan',
      title,
      imageUrl,
      thumbnailUrl: item.images?.jpg?.small_image_url || imageUrl,
      year: item.year || (item.aired?.from ? new Date(item.aired.from).getFullYear() : null),
      format: item.type || 'Anime',
    };
  }).filter((item) => !!item.imageUrl);
}

async function fetchKitsu(query) {
  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=6`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    throw new Error(`Kitsu returned status ${res.status}`);
  }

  const json = await res.json();
  const list = json?.data || [];

  return list.map((item) => {
    const attrs = item.attributes || {};
    const title = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || 'Anime';
    const poster = attrs.posterImage || {};
    const imageUrl = poster.original || poster.large || poster.medium;
    return {
      id: `kitsu-${item.id}`,
      source: 'Kitsu',
      title,
      imageUrl,
      thumbnailUrl: poster.small || poster.medium || imageUrl,
      year: attrs.startDate ? new Date(attrs.startDate).getFullYear() : null,
      format: attrs.subtype || 'Anime',
    };
  }).filter((item) => !!item.imageUrl);
}
