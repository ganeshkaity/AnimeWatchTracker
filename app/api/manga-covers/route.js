import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();

    if (!query) {
      return NextResponse.json({ success: true, results: [] });
    }

    const aniListPromise = fetchAniListManga(query);
    const jikanPromise = fetchJikanManga(query);

    const [aniSettled, jikanSettled] = await Promise.allSettled([
      aniListPromise,
      jikanPromise,
    ]);

    const aniResults = aniSettled.status === 'fulfilled' ? aniSettled.value : [];
    let jikanResults = jikanSettled.status === 'fulfilled' ? jikanSettled.value : [];

    // Fallback to Kitsu if Jikan failed or timed out
    if (jikanResults.length === 0) {
      try {
        jikanResults = await fetchKitsuManga(query);
      } catch (kitsuErr) {
        console.warn('[manga-covers] Kitsu fallback error:', kitsuErr.message);
      }
    }

    // Interleave results
    const results = [];
    const maxLen = Math.max(aniResults.length, jikanResults.length);
    for (let i = 0; i < maxLen; i++) {
      if (aniResults[i]) results.push(aniResults[i]);
      if (jikanResults[i]) results.push(jikanResults[i]);
    }

    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      results,
      providers: {
        aniList: aniResults.length,
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
      source: 'AniList',
      siteUrl: `https://anilist.co/manga/${item.id}`,
    };
  });
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
      source: 'Kitsu',
      siteUrl: `https://kitsu.io/manga/${item.id}`,
    };
  });
}
