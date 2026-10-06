import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim();

    if (!query) {
      return NextResponse.json({ success: true, results: [] });
    }

    let results = [];

    // 1. Try AniList Manga GraphQL
    try {
      results = await searchAniListManga(query);
    } catch (aniErr) {
      console.warn('[manga/search] AniList error:', aniErr.message);
    }

    // 2. Fallback to Jikan Manga if AniList returned 0 results
    if (results.length === 0) {
      try {
        results = await searchJikanManga(query);
      } catch (jikanErr) {
        console.warn('[manga/search] Jikan fallback error:', jikanErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      query,
      results,
    });
  } catch (err) {
    console.error('[manga/search] Global search error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error while searching manga' },
      { status: 500 }
    );
  }
}

async function searchAniListManga(query) {
  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
          id
          idMal
          title {
            english
            romaji
            native
          }
          coverImage {
            extraLarge
            large
            medium
          }
          bannerImage
          startDate {
            year
          }
          format
          chapters
          volumes
          status
          genres
          averageScore
          description(asHtml: false)
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
    const mainTitle = item.title?.english || item.title?.romaji || item.title?.native || 'Manga';
    const posterUrl = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || null;
    const rating = item.averageScore ? Number((item.averageScore / 10).toFixed(1)) : null;

    return {
      id: item.id,
      aniListId: item.id,
      malId: item.idMal || null,
      title: mainTitle,
      englishTitle: item.title?.english || '',
      romajiTitle: item.title?.romaji || '',
      nativeTitle: item.title?.native || '',
      year: item.startDate?.year ? String(item.startDate.year) : '',
      format: item.format || 'MANGA',
      chapters: item.chapters || null,
      volumes: item.volumes || null,
      status: item.status || '',
      rating,
      posterUrl,
      backdropUrl: item.bannerImage || null,
      genres: Array.isArray(item.genres) ? item.genres : [],
      overview: item.description ? item.description.replace(/<[^>]*>?/gm, '').trim() : '',
    };
  });
}

async function searchJikanManga(query) {
  const url = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=8&sfw=true`;
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
    const mainTitle = item.title_english || item.title || 'Manga';
    const posterUrl =
      item.images?.webp?.large_image_url ||
      item.images?.jpg?.large_image_url ||
      item.images?.jpg?.image_url ||
      null;

    const genres = Array.isArray(item.genres) ? item.genres.map((g) => g.name) : [];

    return {
      id: item.mal_id,
      aniListId: null,
      malId: item.mal_id,
      title: mainTitle,
      englishTitle: item.title_english || '',
      romajiTitle: item.title || '',
      nativeTitle: item.title_japanese || '',
      year: item.published?.prop?.from?.year ? String(item.published.prop.from.year) : '',
      format: item.type || 'Manga',
      chapters: item.chapters || null,
      volumes: item.volumes || null,
      status: item.status || '',
      rating: item.score ? Number(item.score.toFixed(1)) : null,
      posterUrl,
      backdropUrl: null,
      genres,
      overview: item.synopsis || '',
    };
  });
}
