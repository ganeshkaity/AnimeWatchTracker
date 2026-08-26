import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let cachedTrending = null;
let cacheTime = 0;
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes in-memory cache

/**
 * Jikan v4 fallback to fetch authentic anime cover if AniList image is missing
 */
async function fetchJikanCover(query) {
  if (!query) return null;
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`, {
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      const first = data?.data?.[0];
      return first?.images?.jpg?.large_image_url || first?.images?.webp?.large_image_url || null;
    }
  } catch {
    // Non-blocking fallback
  }
  return null;
}

export async function GET() {
  const now = Date.now();
  if (cachedTrending && (now - cacheTime < CACHE_DURATION_MS)) {
    return NextResponse.json({ success: true, trending: cachedTrending, cached: true });
  }

  // ── 1. Primary: AniList GraphQL Multi-Category Trending Query ───────────────
  try {
    const query = `
      query {
        trendingTV: Page(page: 1, perPage: 10) {
          media(sort: TRENDING_DESC, type: ANIME, format: TV) {
            id
            title { english romaji }
            coverImage { extraLarge large medium }
            bannerImage
            averageScore
            episodes
            nextAiringEpisode { episode }
            genres
            seasonYear
          }
        }
        trendingMovies: Page(page: 1, perPage: 6) {
          media(sort: TRENDING_DESC, type: ANIME, format: MOVIE) {
            id
            title { english romaji }
            coverImage { extraLarge large medium }
            bannerImage
            averageScore
            genres
            seasonYear
          }
        }
        trendingHentai: Page(page: 1, perPage: 6) {
          media(sort: TRENDING_DESC, type: ANIME, isAdult: true) {
            id
            title { english romaji }
            coverImage { extraLarge large medium }
            bannerImage
            averageScore
            episodes
            genres
            seasonYear
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
      const tvList = data?.data?.trendingTV?.media || [];
      const movieList = data?.data?.trendingMovies?.media || [];
      const hentaiList = data?.data?.trendingHentai?.media || [];

      // 1. Process TV Trending Episodes (Top 5)
      const mappedTV = tvList.slice(0, 5).map((item) => {
        const englishTitle = item.title?.english || '';
        const romajiTitle = item.title?.romaji || '';
        const animeTitle = englishTitle || romajiTitle || 'Anime Series';
        const epNum = item.nextAiringEpisode?.episode
          ? Math.max(1, item.nextAiringEpisode.episode - 1)
          : (item.episodes ? Math.min(item.episodes, 12) : 1);
        const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.6';

        const coverImg = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || '';

        return {
          id: `trend-tv-${item.id}`,
          rawId: item.id,
          animeTitle,
          englishTitle,
          romajiTitle,
          title: `${animeTitle} • Ep ${epNum}`,
          episode: `Ep ${epNum}`,
          type: 'TV Episode',
          typeBadge: 'TV EP',
          typeColor: 'cyan',
          rating: score,
          image: coverImg,
          banner: item.bannerImage || coverImg,
          genres: item.genres?.slice(0, 2) || ['Action', 'Anime'],
          year: item.seasonYear || new Date().getFullYear(),
          source: 'AniList',
          siteUrl: `https://anilist.co/anime/${item.id}`
        };
      });

      // 2. Process Trending Animation Films (Top 3)
      const mappedMovies = movieList.slice(0, 3).map((item) => {
        const englishTitle = item.title?.english || '';
        const romajiTitle = item.title?.romaji || '';
        const movieTitle = englishTitle || romajiTitle || 'Animation Film';
        const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.8';

        const coverImg = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || '';

        return {
          id: `trend-movie-${item.id}`,
          rawId: item.id,
          animeTitle: movieTitle,
          englishTitle,
          romajiTitle,
          title: `${movieTitle} (Film)`,
          episode: 'Film',
          type: 'Animation Film',
          typeBadge: 'FILM',
          typeColor: 'amber',
          rating: score,
          image: coverImg,
          banner: item.bannerImage || coverImg,
          genres: item.genres?.slice(0, 2) || ['Film', 'Animation'],
          year: item.seasonYear || new Date().getFullYear(),
          source: 'AniList',
          siteUrl: `https://anilist.co/anime/${item.id}`
        };
      });

      // 3. Process Trending Hentai / Adult Episodes (Top 2)
      const mappedHentai = hentaiList.slice(0, 2).map((item) => {
        const englishTitle = item.title?.english || '';
        const romajiTitle = item.title?.romaji || '';
        const hTitle = englishTitle || romajiTitle || 'Adult Anime';
        const epNum = item.episodes ? Math.min(item.episodes, 2) : 1;
        const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '7.9';

        const coverImg = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || '';

        return {
          id: `trend-hentai-${item.id}`,
          rawId: item.id,
          animeTitle: hTitle,
          englishTitle,
          romajiTitle,
          title: `${hTitle} • Ep ${epNum}`,
          episode: `Ep ${epNum}`,
          type: 'Hentai / 18+',
          typeBadge: '18+ EP',
          typeColor: 'rose',
          rating: score,
          image: coverImg,
          banner: item.bannerImage || coverImg,
          genres: ['Hentai', 'Adult'],
          year: item.seasonYear || new Date().getFullYear(),
          source: 'AniList',
          siteUrl: `https://anilist.co/anime/${item.id}`
        };
      });

      // Combine in priority order: TV (5) + Movie (3) + Hentai (2) = 10 items
      const combined = [...mappedTV, ...mappedMovies, ...mappedHentai].slice(0, 10).map((show, idx) => ({
        ...show,
        rank: idx + 1,
        rankPadded: String(idx + 1).padStart(2, '0')
      }));

      // Verify that covers exist, if any cover is empty, fallback to curated high-res poster
      const validatedCombined = combined.map(item => {
        if (!item.image) {
          const fallbackMatch = fallbackTrending.find(f => f.animeTitle.toLowerCase().includes(item.animeTitle.toLowerCase()));
          if (fallbackMatch) {
            return { ...item, image: fallbackMatch.image, banner: fallbackMatch.banner || fallbackMatch.image };
          }
        }
        return item;
      });

      if (validatedCombined.length > 0) {
        cachedTrending = validatedCombined;
        cacheTime = now;
        return NextResponse.json({ success: true, trending: validatedCombined, cached: false });
      }
    }
  } catch (err) {
    console.warn('[trending-today] AniList query error, falling back to curated list:', err.message);
  }

  // ── 2. Curated High-Reliability Fallback with 100% Authentic Anime Cover Art ──
  return NextResponse.json({ success: true, trending: fallbackTrending, cached: false });
}

// ── Verified High-Resolution Authentic Posters & Backdrops from AniList / MAL ──
const fallbackTrending = [
  {
    id: 'trend-tv-1',
    animeTitle: 'Solo Leveling: Arise',
    englishTitle: 'Solo Leveling',
    romajiTitle: 'Ore dake Level Up na Ken',
    title: 'Solo Leveling • Ep 12',
    episode: 'Ep 12',
    type: 'TV Episode',
    typeBadge: 'TV EP',
    typeColor: 'cyan',
    rating: '9.2',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-it355ZgzquUd.png',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37yfQA3ym8PA.jpg',
    genres: ['Action', 'Fantasy'],
    rank: 1,
    rankPadded: '01'
  },
  {
    id: 'trend-tv-2',
    animeTitle: 'Frieren: Beyond Journey\'s End',
    englishTitle: 'Frieren: Beyond Journey\'s End',
    romajiTitle: 'Sousou no Frieren',
    title: 'Frieren • Ep 28',
    episode: 'Ep 28',
    type: 'TV Episode',
    typeBadge: 'TV EP',
    typeColor: 'cyan',
    rating: '9.4',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170068-ijY3tCP8KoWP.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170068-ijY3tCP8KoWP.jpg',
    genres: ['Adventure', 'Drama'],
    rank: 2,
    rankPadded: '02'
  },
  {
    id: 'trend-tv-3',
    animeTitle: 'Bleach: Thousand-Year Blood War',
    englishTitle: 'Bleach: Thousand-Year Blood War',
    romajiTitle: 'BLEACH: Sennen Kessen-hen',
    title: 'Bleach: TYBW • Ep 26',
    episode: 'Ep 26',
    type: 'TV Episode',
    typeBadge: 'TV EP',
    typeColor: 'cyan',
    rating: '9.1',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx116674-p3zK4PUX2Aag.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/116674-l2YlIyJzvGSV.jpg',
    genres: ['Action', 'Supernatural'],
    rank: 3,
    rankPadded: '03'
  },
  {
    id: 'trend-movie-1',
    animeTitle: 'The Boy and the Heron',
    englishTitle: 'The Boy and the Heron',
    romajiTitle: 'Kimitachi wa Dou Ikiru ka',
    title: 'The Boy and the Heron (Film)',
    episode: 'Film',
    type: 'Animation Film',
    typeBadge: 'FILM',
    typeColor: 'amber',
    rating: '9.0',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx109979-BRHXpBkCw4oc.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/109979-eeUPfBXMEflG.jpg',
    genres: ['Film', 'Fantasy'],
    rank: 4,
    rankPadded: '04'
  },
  {
    id: 'trend-tv-4',
    animeTitle: 'Demon Slayer: Kimetsu no Yaiba',
    englishTitle: 'Demon Slayer: Kimetsu no Yaiba',
    romajiTitle: 'Kimetsu no Yaiba',
    title: 'Demon Slayer • Ep 8',
    episode: 'Ep 8',
    type: 'TV Episode',
    typeBadge: 'TV EP',
    typeColor: 'cyan',
    rating: '8.9',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg',
    genres: ['Action', 'Demons'],
    rank: 5,
    rankPadded: '05'
  },
  {
    id: 'trend-movie-2',
    animeTitle: 'Chainsaw Man Movie: Reze Arc',
    englishTitle: 'Chainsaw Man: Reze Arc',
    romajiTitle: 'Chainsaw Man: Reze-hen',
    title: 'Chainsaw Man: Reze Arc (Film)',
    episode: 'Film',
    type: 'Animation Film',
    typeBadge: 'FILM',
    typeColor: 'amber',
    rating: '9.3',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171627-ZN9D7P46yHnw.png',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/171627-7esVHhgw69rn.jpg',
    genres: ['Film', 'Action'],
    rank: 6,
    rankPadded: '06'
  },
  {
    id: 'trend-tv-5',
    animeTitle: 'Kaiju No. 8',
    englishTitle: 'Kaiju No. 8',
    romajiTitle: 'Kaijuu 8-gou',
    title: 'Kaiju No. 8 • Ep 10',
    episode: 'Ep 10',
    type: 'TV Episode',
    typeBadge: 'TV EP',
    typeColor: 'cyan',
    rating: '8.8',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153288-25FBfFJzEQ5O.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/153288-JNsWuMPMAuJL.jpg',
    genres: ['Action', 'Sci-Fi'],
    rank: 7,
    rankPadded: '07'
  },
  {
    id: 'trend-movie-3',
    animeTitle: 'Suzume',
    englishTitle: 'Suzume',
    romajiTitle: 'Suzume no Tojimari',
    title: 'Suzume (Film)',
    episode: 'Film',
    type: 'Animation Film',
    typeBadge: 'FILM',
    typeColor: 'amber',
    rating: '8.9',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx142770-dDaDIRnsv5jN.jpg',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/142770-YgESt2HJXlNg.jpg',
    genres: ['Film', 'Fantasy'],
    rank: 8,
    rankPadded: '08'
  },
  {
    id: 'trend-hentai-1',
    animeTitle: 'Overflow',
    englishTitle: 'Overflow',
    romajiTitle: 'Overflow',
    title: 'Overflow • Ep 8',
    episode: 'Ep 8',
    type: 'Hentai / 18+',
    typeBadge: '18+ EP',
    typeColor: 'rose',
    rating: '8.2',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113417-yofUQOwPXWuE.png',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/113417-GIeryhlioQZB.jpg',
    genres: ['Hentai', 'Romance'],
    rank: 9,
    rankPadded: '09'
  },
  {
    id: 'trend-hentai-2',
    animeTitle: 'Mankitsu Happening',
    englishTitle: 'Mankitsu Happening',
    romajiTitle: 'Mankitsu Happening',
    title: 'Mankitsu Happening • Ep 4',
    episode: 'Ep 4',
    type: 'Hentai / 18+',
    typeBadge: '18+ EP',
    typeColor: 'rose',
    rating: '8.5',
    image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx21222-GxhbPz7klIFw.png',
    banner: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21222-TplI3UsHh8ET.jpg',
    genres: ['Hentai', 'Comedy'],
    rank: 10,
    rankPadded: '10'
  }
];
