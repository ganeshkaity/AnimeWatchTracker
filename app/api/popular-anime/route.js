import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let cachedPopular = null;
let cacheTime = 0;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes in-memory cache

export async function GET() {
  const now = Date.now();
  if (cachedPopular && (now - cacheTime < CACHE_DURATION_MS)) {
    return NextResponse.json({ success: true, anime: cachedPopular, cached: true });
  }

  // ── 1. Primary: AniList GraphQL Trending Query ─────────────────────────────
  try {
    const query = `
      query {
        Page(page: 1, perPage: 10) {
          media(sort: TRENDING_DESC, type: ANIME) {
            id
            title {
              english
              romaji
              native
            }
            coverImage {
              large
              extraLarge
            }
            bannerImage
            averageScore
            popularity
            episodes
            genres
            studios(isMain: true) {
              nodes {
                name
              }
            }
            seasonYear
            description
          }
        }
      }
    `;

    const aniRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000)
    });

    if (aniRes.ok) {
      const data = await aniRes.json();
      const mediaList = data?.data?.Page?.media || [];

      if (mediaList.length > 0) {
        const mapped = mediaList.slice(0, 10).map((item, idx) => {
          const title = item.title?.english || item.title?.romaji || 'Unknown Anime';
          const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.5';
          const studio = item.studios?.nodes?.[0]?.name || 'Animation Studio';

          return {
            id: `anilist-${item.id}`,
            title,
            romajiTitle: item.title?.romaji || '',
            image: item.coverImage?.extraLarge || item.coverImage?.large || '',
            banner: item.bannerImage || item.coverImage?.extraLarge || '',
            rating: score,
            rank: idx + 1,
            episodes: item.episodes ? `${item.episodes} EP` : 'Ongoing',
            episodeCount: item.episodes || 0,
            studio,
            genres: item.genres?.slice(0, 2) || ['Action', 'Fantasy'],
            year: item.seasonYear || new Date().getFullYear(),
            description: (item.description || '').replace(/<[^>]+>/g, '').slice(0, 160),
            source: 'AniList',
            siteUrl: `https://anilist.co/anime/${item.id}`
          };
        });

        cachedPopular = mapped;
        cacheTime = now;
        return NextResponse.json({ success: true, anime: mapped, cached: false });
      }
    }
  } catch (aniErr) {
    console.warn('[popular-anime] AniList fetch failed, attempting Jikan fallback:', aniErr.message);
  }

  // ── 2. Fallback: Jikan v4 (MyAnimeList) Top Airing / Popular ────────────────
  try {
    const jikanRes = await fetch('https://api.jikan.moe/v4/top/anime?filter=airing&limit=10', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (jikanRes.ok) {
      const data = await jikanRes.json();
      const list = data?.data || [];

      if (list.length > 0) {
        const mapped = list.slice(0, 10).map((item, idx) => {
          const title = item.title_english || item.title || 'Unknown Anime';
          const score = item.score ? item.score.toFixed(1) : '8.5';
          const studio = item.studios?.[0]?.name || 'Animation Studio';

          return {
            id: `mal-${item.mal_id}`,
            title,
            romajiTitle: item.title || '',
            image: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || '',
            banner: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || '',
            rating: score,
            rank: idx + 1,
            episodes: item.episodes ? `${item.episodes} EP` : 'Ongoing',
            episodeCount: item.episodes || 0,
            studio,
            genres: item.genres?.slice(0, 2).map(g => g.name) || ['Action'],
            year: item.year || new Date().getFullYear(),
            description: (item.synopsis || '').replace(/<[^>]+>/g, '').slice(0, 160),
            source: 'MyAnimeList',
            siteUrl: item.url || ''
          };
        });

        cachedPopular = mapped;
        cacheTime = now;
        return NextResponse.json({ success: true, anime: mapped, cached: false });
      }
    }
  } catch (jikanErr) {
    console.error('[popular-anime] Jikan fallback failed:', jikanErr.message);
  }

  if (cachedPopular) {
    return NextResponse.json({ success: true, anime: cachedPopular, cached: true });
  }

  return NextResponse.json({ success: false, error: 'Could not retrieve popular anime of the week' }, { status: 500 });
}
