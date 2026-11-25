import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let cachedUpcomingAnimes = null;
let cacheTime = 0;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatStartDate(startDate) {
  if (!startDate || !startDate.year) return 'TBA';
  const m = startDate.month ? MONTHS[startDate.month - 1] : '';
  const d = startDate.day ? ` ${startDate.day}` : '';
  return m ? `${m}${d}, ${startDate.year}` : `${startDate.year}`;
}

function isFutureAniListDate(startDate) {
  if (!startDate || !startDate.year) return true; // TBA upcoming
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const curD = now.getDate();

  if (startDate.year > curY) return true;
  if (startDate.year < curY) return false;
  if (!startDate.month) return true;
  if (startDate.month > curM) return true;
  if (startDate.month < curM) return false;
  if (!startDate.day) return true;
  return startDate.day > curD;
}

export async function GET() {
  const now = Date.now();
  if (cachedUpcomingAnimes && (now - cacheTime < CACHE_DURATION_MS)) {
    return NextResponse.json({
      success: true,
      animes: cachedUpcomingAnimes,
      cached: true,
      updatedAt: cacheTime,
    });
  }

  // 1. Primary: AniList GraphQL (NOT_YET_RELEASED sorted by popularity)
  try {
    const query = `
      query {
        Page(page: 1, perPage: 25) {
          media(status: NOT_YET_RELEASED, sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
            id
            title {
              english
              romaji
            }
            coverImage {
              extraLarge
              large
            }
            bannerImage
            description(asHtml: false)
            format
            episodes
            genres
            startDate {
              year
              month
              day
            }
            siteUrl
          }
        }
      }
    `;

    const aniRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(9000),
    });

    if (aniRes.ok) {
      const data = await aniRes.json();
      const list = data?.data?.Page?.media || [];
      const futureList = list.filter((a) => isFutureAniListDate(a.startDate));
      if (futureList.length > 0) {
        const formatted = futureList.slice(0, 10).map((a) => ({
          id: a.id,
          title: a.title?.english || a.title?.romaji || 'Untitled Anime',
          romajiTitle: a.title?.romaji || '',
          poster: a.coverImage?.extraLarge || a.coverImage?.large || '',
          banner: a.bannerImage || '',
          overview: (a.description || '').replace(/<[^>]*>/g, '').trim(),
          format: a.format || 'TV',
          episodes: a.episodes || null,
          genres: Array.isArray(a.genres) ? a.genres.slice(0, 4) : [],
          year: a.startDate?.year ? String(a.startDate.year) : '',
          releaseDate: formatStartDate(a.startDate),
          url: a.siteUrl || `https://anilist.co/anime/${a.id}`,
        }));

        cachedUpcomingAnimes = formatted;
        cacheTime = now;

        return NextResponse.json({
          success: true,
          animes: formatted,
          cached: false,
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    console.warn('[Upcoming Animes] AniList failed, falling back to Jikan:', err.message);
  }

  // 2. Fallback: Jikan API
  try {
    const jikanRes = await fetch('https://api.jikan.moe/v4/seasons/upcoming?limit=20', {
      signal: AbortSignal.timeout(9000),
    });
    if (jikanRes.ok) {
      const jData = await jikanRes.json();
      const list = Array.isArray(jData?.data) ? jData.data : [];
      const todayIso = new Date().toISOString().slice(0, 10);
      const futureList = list.filter((a) => !a.aired?.from || a.aired.from.slice(0, 10) > todayIso);
      const formatted = futureList.slice(0, 10).map((a) => ({
        id: a.mal_id,
        title: a.title_english || a.title || 'Untitled Anime',
        romajiTitle: a.title || '',
        poster: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
        banner: '',
        overview: a.synopsis || '',
        format: a.type || 'TV',
        episodes: a.episodes || null,
        genres: Array.isArray(a.genres) ? a.genres.slice(0, 4).map((g) => g.name) : [],
        year: a.year ? String(a.year) : '',
        releaseDate: a.aired?.string ? a.aired.string.split(' to ')[0] : 'TBA',
        url: a.url || `https://myanimelist.net/anime/${a.mal_id}`,
      }));

      cachedUpcomingAnimes = formatted;
      cacheTime = now;

      return NextResponse.json({
        success: true,
        animes: formatted,
        cached: false,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.error('[Upcoming Animes API Error]', err);
  }

  return NextResponse.json(
    { success: false, error: 'Failed to fetch upcoming animes', animes: cachedUpcomingAnimes || [] },
    { status: 500 }
  );
}
