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

    const aniListPromise = fetchAniListManga(query);
    const fanartPromise = fetchFanartMangaPosters(query, tmdbApiKey, fanartApiKey);
    const jikanPromise = fetchJikanManga(query);

    const [aniSettled, fanartSettled, jikanSettled] = await Promise.allSettled([
      aniListPromise,
      fanartPromise,
      jikanPromise,
    ]);

    const aniResults = aniSettled.status === 'fulfilled' ? aniSettled.value : [];
    const fanartResults = fanartSettled.status === 'fulfilled' ? fanartSettled.value : [];
    let jikanResults = jikanSettled.status === 'fulfilled' ? jikanSettled.value : [];

    // Fallback to Kitsu if Jikan failed or timed out
    if (jikanResults.length === 0 && fanartResults.length === 0) {
      try {
        jikanResults = await fetchKitsuManga(query);
      } catch (kitsuErr) {
        console.warn('[manga-covers] Kitsu fallback error:', kitsuErr.message);
      }
    }

    // Interleave results with AniList and Fanart prioritized
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
    console.error('[manga-covers] Search error:', err);
    return NextResponse.json({ success: false, error: err.message, results: [] }, { status: 500 });
  }
}

async function fetchAniListManga(query) {
  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
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
          chapters
          volumes
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

  const data = await res.json();
  const list = data?.data?.Page?.media || [];

  return list.map((item) => {
    const title = item.title.english || item.title.romaji || item.title.native || 'Untitled Manga';
    const imageUrl = item.coverImage.extraLarge || item.coverImage.large || item.coverImage.medium;
    return {
      id: `al-manga-${item.id}`,
      rawId: item.id,
      title,
      romajiTitle: item.title.romaji,
      year: item.startDate?.year || 'N/A',
      format: item.format || 'MANGA',
      chapters: item.chapters || null,
      volumes: item.volumes || null,
      imageUrl,
      thumbnailUrl: item.coverImage.medium || imageUrl,
      source: 'AniList',
      siteUrl: `https://anilist.co/manga/${item.id}`,
    };
  });
}

async function fetchFanartMangaPosters(query, tmdbApiKey, fanartApiKey) {
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
          id: `fanart-manga-tv-${p.id || idx}`,
          source: 'Fanart.tv',
          title: query,
          imageUrl: p.url,
          thumbnailUrl: p.url,
          year: null,
          format: 'Fanart Artwork',
        }));
      }
    }
  } catch (err) {
    console.warn('[fetchFanartMangaPosters error]:', err.message);
  }
  return [];
}

async function fetchJikanManga(query) {
  const url = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=8&sfw=true`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    throw new Error(`Jikan returned status ${res.status}`);
  }

  const data = await res.json();
  const list = data?.data || [];

  return list.map((item) => {
    const imageUrl = item.images?.webp?.large_image_url ||
      item.images?.jpg?.large_image_url ||
      item.images?.jpg?.image_url;
    return {
      id: `mal-manga-${item.mal_id}`,
      rawId: item.mal_id,
      title: item.title_english || item.title || 'Untitled Manga',
      romajiTitle: item.title,
      year: item.published?.prop?.from?.year || 'N/A',
      format: item.type || 'Manga',
      chapters: item.chapters || null,
      volumes: item.volumes || null,
      imageUrl,
      thumbnailUrl: item.images?.jpg?.small_image_url || imageUrl,
      source: 'Jikan',
      siteUrl: item.url || `https://myanimelist.net/manga/${item.mal_id}`,
    };
  });
}

async function fetchKitsuManga(query) {
  const url = `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=8`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.api+json' },
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    throw new Error(`Kitsu returned status ${res.status}`);
  }

  const data = await res.json();
  const list = data?.data || [];

  return list.map((item) => {
    const attr = item.attributes || {};
    const imageUrl = attr.posterImage?.large || attr.posterImage?.original || attr.posterImage?.medium;
    return {
      id: `kitsu-manga-${item.id}`,
      rawId: item.id,
      title: attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || 'Untitled Manga',
      year: attr.startDate ? new Date(attr.startDate).getFullYear() : 'N/A',
      format: attr.subtype || 'Manga',
      chapters: attr.chapterCount || null,
      volumes: attr.volumeCount || null,
      imageUrl,
      thumbnailUrl: attr.posterImage?.small || imageUrl,
      source: 'Kitsu',
      siteUrl: `https://kitsu.io/manga/${item.id}`,
    };
  });
}
