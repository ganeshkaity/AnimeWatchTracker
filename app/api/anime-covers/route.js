import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();

    if (!query) {
      return NextResponse.json({ success: true, results: [] });
    }

    const aniListPromise = fetchAniList(query);
    const jikanPromise = fetchJikan(query);

    const [aniSettled, jikanSettled] = await Promise.allSettled([
      aniListPromise,
      jikanPromise,
    ]);

    const aniResults = aniSettled.status === 'fulfilled' ? aniSettled.value : [];
    let jikanResults = jikanSettled.status === 'fulfilled' ? jikanSettled.value : [];

    // Resilient fallback: If Jikan failed (e.g. MAL 504 gateway error or rate limit),
    // fetch from Kitsu as a seamless secondary provider so the user always has 8-10 results.
    if (jikanResults.length === 0) {
      try {
        jikanResults = await fetchKitsu(query);
      } catch (kitsuErr) {
        console.warn('Kitsu fallback error:', kitsuErr.message);
      }
    }

    // Interleave or combine results
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
    console.error('Anime covers search API error:', err);
    return NextResponse.json({ success: false, error: err.message, results: [] }, { status: 500 });
  }
}

async function fetchAniList(query) {
  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 6) {
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
