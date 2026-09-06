import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let cachedTopRated = null;
let cacheTime = 0;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24-hour server cache

const FAMOUS_TOP_EPISODES = {
  'attack on titan': { ep: 'Ep 54', title: 'Hero' },
  'shingeki no kyojin': { ep: 'Ep 54', title: 'Hero' },
  'fullmetal alchemist': { ep: 'Ep 63', title: 'The Other Side of the Gateway' },
  'fma': { ep: 'Ep 63', title: 'The Other Side of the Gateway' },
  'steins;gate': { ep: 'Ep 23', title: 'Open the Steins Gate' },
  'hunter x hunter': { ep: 'Ep 131', title: 'Anger × And × Light' },
  'frieren': { ep: 'Ep 26', title: 'Height of Magic' },
  'sousou no frieren': { ep: 'Ep 26', title: 'Height of Magic' },
  'bleach': { ep: 'Ep 7', title: 'BORN IN THE DARK' },
  'demon slayer': { ep: 'Ep 19', title: 'Hinokami' },
  'kimetsu no yaiba': { ep: 'Ep 19', title: 'Hinokami' },
  'vinland saga': { ep: 'Ep 24', title: 'End of the Prologue' },
  'jujutsu kaisen': { ep: 'Ep 17', title: 'Thunderclap, Part 2' },
  'gintama': { ep: 'Ep 305', title: 'Sworn Enemy' },
  'code geass': { ep: 'Ep 25', title: 'Re;' },
  'mob psycho 100': { ep: 'Ep 5', title: 'Discord ~Choices~' },
  'one piece': { ep: 'Ep 1015', title: 'Straw Hat Luffy' },
  'death note': { ep: 'Ep 25', title: 'Silence' },
  'monster': { ep: 'Ep 73', title: 'The Nameless Monster' },
  'violet evergarden': { ep: 'Ep 10', title: 'A Loved One Will Always Watch Over You' },
  'cyberpunk': { ep: 'Ep 10', title: 'My Moon, My Man' },
  'chainsaw man': { ep: 'Ep 8', title: 'Gunfire' },
  'solo leveling': { ep: 'Ep 12', title: 'Arise' },
  'clannad': { ep: 'Ep 18', title: 'The Ends of the Earth' },
  'oshi no ko': { ep: 'Ep 1', title: 'Mother and Children' },
  'bocchi the rock': { ep: 'Ep 8', title: 'Bocchi the Rock' },
  'haikyuu': { ep: 'Ep 24', title: 'The Absolute Limit' },
  'cowboy bebop': { ep: 'Ep 26', title: 'The Real Folk Blues' },
  'gurren lagann': { ep: 'Ep 26', title: 'Never Forget This Second' },
  'evangelion': { ep: 'Ep 24', title: 'The Beginning of the End' },
};

function getTopEpisodeForShow(showTitle, totalEpisodes) {
  const cleanTitle = (showTitle || '').toLowerCase().trim();
  for (const [key, epData] of Object.entries(FAMOUS_TOP_EPISODES)) {
    if (cleanTitle.includes(key)) {
      return {
        episodeLabel: epData.ep,
        episodeTitle: epData.title,
        episodeName: `${epData.ep} - ${epData.title}`
      };
    }
  }

  // Fallback for any other anime
  const epNum = totalEpisodes && totalEpisodes > 1 ? Math.min(totalEpisodes, Math.max(1, Math.round(totalEpisodes * 0.85))) : 1;
  const epLabel = `Ep ${epNum}`;
  const epTitle = totalEpisodes && totalEpisodes > 1 ? 'Climax Episode' : 'Special Feature';
  return {
    episodeLabel: epLabel,
    episodeTitle: epTitle,
    episodeName: `${epLabel} - ${epTitle}`
  };
}

export async function GET() {
  const now = Date.now();
  if (cachedTopRated && (now - cacheTime < CACHE_DURATION_MS)) {
    return NextResponse.json({ success: true, anime: cachedTopRated, cached: true, updatedAt: cacheTime });
  }

  // ── 1. Primary: AniList GraphQL Top Rated Query ─────────────────────────────
  try {
    const query = `
      query {
        Page(page: 1, perPage: 20) {
          media(sort: SCORE_DESC, type: ANIME, isAdult: false, format_in: [TV, TV_SHORT, MOVIE, OVA, ONA]) {
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
            meanScore
            popularity
            episodes
            genres
            format
            seasonYear
            status
            studios(isMain: true) {
              nodes {
                name
              }
            }
            description(asHtml: false)
            siteUrl
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
      signal: AbortSignal.timeout(9000)
    });

    if (aniRes.ok) {
      const data = await aniRes.json();
      const mediaList = data?.data?.Page?.media || [];

      if (mediaList.length > 0) {
        const parsed = mediaList.map((item, index) => {
          const mainTitle = item.title?.english || item.title?.romaji || item.title?.native || 'Unknown Title';
          const subTitle = item.title?.english && item.title?.romaji ? item.title.romaji : '';
          const scorePercent = item.averageScore || item.meanScore || 0;
          const rating = scorePercent ? (scorePercent / 10).toFixed(1) : '9.0';
          const studioName = item.studios?.nodes?.[0]?.name || 'Animation Studio';
          const cleanDesc = (item.description || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\n+/g, ' ')
            .trim();

          const epData = getTopEpisodeForShow(mainTitle, item.episodes);

          return {
            id: `top-rated-${item.id}`,
            rawId: item.id,
            rank: index + 1,
            title: epData.episodeName, // Primary name is the Episode Name
            episodeName: epData.episodeName,
            episodeLabel: epData.episodeLabel,
            episodeTitle: epData.episodeTitle,
            animeTitle: mainTitle,
            seriesTitle: mainTitle,
            subTitle: mainTitle,
            image: item.coverImage?.extraLarge || item.coverImage?.large || '',
            banner: item.bannerImage || '',
            rating: rating,
            score: scorePercent,
            episodes: epData.episodeLabel,
            episodeCount: item.episodes || 0,
            type: item.format || 'TV',
            year: item.seasonYear || '',
            genres: Array.isArray(item.genres) ? item.genres.slice(0, 3) : [],
            studio: studioName,
            status: item.status || 'FINISHED',
            description: cleanDesc,
            siteUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`
          };
        });

        cachedTopRated = parsed;
        cacheTime = now;
        return NextResponse.json({ success: true, anime: parsed, source: 'anilist', updatedAt: now });
      }
    }
  } catch (aniErr) {
    console.warn('[TopRated API] AniList query failed, attempting Jikan fallback:', aniErr.message);
  }

  // ── 2. Fallback: Jikan (MyAnimeList) API ─────────────────────────────────────
  try {
    const jikanRes = await fetch('https://api.jikan.moe/v4/top/anime?limit=20', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(9000)
    });

    if (jikanRes.ok) {
      const jikanData = await jikanRes.json();
      const jikanList = jikanData?.data || [];

      if (jikanList.length > 0) {
        const parsed = jikanList.map((item, index) => {
          const mainTitle = item.title_english || item.title || 'Unknown Title';
          const subTitle = item.title_japanese || item.title || '';
          const rating = item.score ? item.score.toFixed(1) : '9.0';
          const studioName = item.studios?.[0]?.name || 'Animation Studio';
          const cleanDesc = (item.synopsis || '')
            .replace(/\n+/g, ' ')
            .trim();

          const epData = getTopEpisodeForShow(mainTitle, item.episodes);

          return {
            id: `top-rated-mal-${item.mal_id}`,
            rawId: item.mal_id,
            rank: item.rank || index + 1,
            title: epData.episodeName,
            episodeName: epData.episodeName,
            episodeLabel: epData.episodeLabel,
            episodeTitle: epData.episodeTitle,
            animeTitle: mainTitle,
            seriesTitle: mainTitle,
            subTitle: mainTitle,
            image: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || '',
            banner: item.trailer?.images?.maximum_image_url || '',
            rating: rating,
            score: Math.round((item.score || 9) * 10),
            episodes: epData.episodeLabel,
            episodeCount: item.episodes || 0,
            type: item.type || 'TV',
            year: item.year || '',
            genres: Array.isArray(item.genres) ? item.genres.map(g => g.name).slice(0, 3) : [],
            studio: studioName,
            status: item.status || 'Finished Airing',
            description: cleanDesc,
            siteUrl: item.url || `https://myanimelist.net/anime/${item.mal_id}`
          };
        });

        cachedTopRated = parsed;
        cacheTime = now;
        return NextResponse.json({ success: true, anime: parsed, source: 'jikan', updatedAt: now });
      }
    }
  } catch (jikanErr) {
    console.error('[TopRated API] Jikan fallback also failed:', jikanErr.message);
  }

  // ── 3. Return last cached data if available ─────────────────────────────────
  if (cachedTopRated) {
    return NextResponse.json({ success: true, anime: cachedTopRated, fallback: true });
  }

  return NextResponse.json({ success: false, error: 'Could not fetch top rated anime' }, { status: 500 });
}
