import { NextResponse } from 'next/server';
import { toFanartBigPreview } from '../../../lib/fanartUtils';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';
const DEFAULT_FANART_KEY = 'd2d31f9ecabea050fc7d68aa3146015f';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
    const type = (searchParams.get('type') || 'movie').toLowerCase();

    if (!query) {
      return NextResponse.json({ success: true, results: [] });
    }

    const tmdbApiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;
    const fanartApiKey = process.env.FANART_API_KEY || DEFAULT_FANART_KEY;

    // ── 1. Movies & Web-Series: FETCH ONLY FROM TMDB ──
    if (type === 'movie') {
      const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&language=en-US&query=${encodeURIComponent(query)}&page=1&include_adult=true`;
      const res = await fetch(tmdbUrl, { headers: { 'Accept': 'application/json' }, next: { revalidate: 3600 } });
      if (!res.ok) {
        return NextResponse.json({ success: true, results: [] });
      }
      const data = await res.json();
      const results = (data.results || []).map((m) => ({
        id: String(m.id),
        tmdbId: m.id,
        contentType: 'movie',
        title: m.title || m.original_title || 'Untitled Movie',
        originalTitle: m.original_title || '',
        year: m.release_date ? m.release_date.split('-')[0] : '',
        releaseDate: m.release_date || '',
        rating: m.vote_average ? Number(m.vote_average.toFixed(1)) : 0,
        voteCount: m.vote_count || 0,
        overview: m.overview || '',
        posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : null,
        backdropUrl: m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : null,
        source: 'TMDB',
      }));
      return NextResponse.json({ success: true, results });
    }

    if (type === 'web-series' || type === 'series' || type === 'tv') {
      const tmdbUrl = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&language=en-US&query=${encodeURIComponent(query)}&page=1&include_adult=true`;
      const res = await fetch(tmdbUrl, { headers: { 'Accept': 'application/json' }, next: { revalidate: 3600 } });
      if (!res.ok) {
        return NextResponse.json({ success: true, results: [] });
      }
      const data = await res.json();
      const results = (data.results || []).map((t) => ({
        id: String(t.id),
        tmdbId: t.id,
        contentType: 'web-series',
        title: t.name || t.original_name || 'Untitled Series',
        originalTitle: t.original_name || '',
        year: t.first_air_date ? t.first_air_date.split('-')[0] : '',
        releaseDate: t.first_air_date || '',
        rating: t.vote_average ? Number(t.vote_average.toFixed(1)) : 0,
        voteCount: t.vote_count || 0,
        overview: t.overview || '',
        posterUrl: t.poster_path ? `https://image.tmdb.org/t/p/w300${t.poster_path}` : null,
        backdropUrl: t.backdrop_path ? `https://image.tmdb.org/t/p/original${t.backdrop_path}` : null,
        source: 'TMDB',
      }));
      return NextResponse.json({ success: true, results });
    }

    // ── 2. Anime, Manga, Webtoon, Manhwa, Audio-Stories: FETCH FROM TMDB + AniList + Jikan/Kitsu + Fanart ──
    const isMangaFamily = ['manga', 'manhwa', 'manwah', 'webtoon'].includes(type);
    const aniListType = isMangaFamily ? 'MANGA' : 'ANIME';

    const aniListPromise = fetchAniListSearch(query, aniListType);
    const jikanPromise = fetchJikanSearch(query, isMangaFamily ? 'manga' : 'anime');
    const tmdbSearchPromise = fetchTmdbMultiSearch(query, tmdbApiKey, type);
    const fanartPromise = fetchFanartSearch(query, tmdbApiKey, fanartApiKey, isMangaFamily);

    const [aniSettled, jikanSettled, tmdbSettled, fanartSettled] = await Promise.allSettled([
      aniListPromise,
      jikanPromise,
      tmdbSearchPromise,
      fanartPromise,
    ]);

    const aniResults = aniSettled.status === 'fulfilled' ? aniSettled.value : [];
    let jikanResults = jikanSettled.status === 'fulfilled' ? jikanSettled.value : [];
    const tmdbResults = tmdbSettled.status === 'fulfilled' ? tmdbSettled.value : [];
    const fanartResults = fanartSettled.status === 'fulfilled' ? fanartSettled.value : [];

    // Fallback: If Jikan failed, try Kitsu
    if (jikanResults.length === 0) {
      try {
        jikanResults = await fetchKitsuSearch(query, isMangaFamily ? 'manga' : 'anime');
      } catch (kErr) {
        // quiet fallback
      }
    }

    // Deduplicate & combine results cleanly
    const combined = [];
    const seenTitles = new Set();

    const addResult = (item) => {
      if (!item || !item.title) return;
      const normalized = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenTitles.has(normalized)) return;
      seenTitles.add(normalized);
      combined.push({
        ...item,
        contentType: type,
      });
    };

    // Prioritize high-quality primary anime/manga sources first, followed by TMDB & Fanart
    const maxItems = Math.max(aniResults.length, tmdbResults.length, jikanResults.length, fanartResults.length);
    for (let i = 0; i < maxItems; i++) {
      if (aniResults[i]) addResult(aniResults[i]);
      if (tmdbResults[i]) addResult(tmdbResults[i]);
      if (jikanResults[i]) addResult(jikanResults[i]);
      if (fanartResults[i]) addResult(fanartResults[i]);
    }

    return NextResponse.json({
      success: true,
      results: combined,
      count: combined.length,
      providers: {
        aniList: aniResults.length,
        tmdb: tmdbResults.length,
        jikan: jikanResults.length,
        fanart: fanartResults.length,
      },
    });
  } catch (err) {
    console.error('[Watchlist Search API Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error while searching media' },
      { status: 500 }
    );
  }
}

// ── AniList GraphQL Search ──
async function fetchAniListSearch(query, mediaType) {
  const gqlQuery = `
    query ($search: String, $type: MediaType) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: $type, sort: SEARCH_MATCH) {
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
          bannerImage
          startDate {
            year
          }
          averageScore
          description
          genres
          format
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query: gqlQuery, variables: { search: query, type: mediaType } }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const media = data?.data?.Page?.media || [];
    return media.map((m) => {
      const displayTitle = m.title?.english || m.title?.romaji || m.title?.native || 'Untitled';
      return {
        id: `anilist-${m.id}`,
        anilistId: m.id,
        title: displayTitle,
        originalTitle: m.title?.native || m.title?.romaji || '',
        year: m.startDate?.year ? String(m.startDate.year) : '',
        rating: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 0,
        overview: m.description ? m.description.replace(/<[^>]*>?/gm, '').trim() : '',
        posterUrl: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null,
        backdropUrl: m.bannerImage || null,
        genres: m.genres || [],
        source: 'AniList',
      };
    });
  } catch {
    return [];
  }
}

// ── Jikan MAL Search ──
async function fetchJikanSearch(query, endpoint) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/${endpoint}?q=${encodeURIComponent(query)}&limit=6`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((j) => ({
      id: `jikan-${j.mal_id}`,
      malId: j.mal_id,
      title: j.title_english || j.title || 'Untitled',
      originalTitle: j.title_japanese || j.title || '',
      year: j.year ? String(j.year) : (j.aired?.from ? j.aired.from.split('-')[0] : (j.published?.from ? j.published.from.split('-')[0] : '')),
      rating: j.score ? Number(j.score.toFixed(1)) : 0,
      overview: j.synopsis ? j.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim() : '',
      posterUrl: j.images?.webp?.large_image_url || j.images?.jpg?.large_image_url || null,
      source: 'Jikan (MAL)',
      trailerUrl: j.trailer?.url || null,
    }));
  } catch {
    return [];
  }
}

// ── Kitsu Fallback Search ──
async function fetchKitsuSearch(query, endpoint) {
  try {
    const res = await fetch(`https://kitsu.io/api/edge/${endpoint}?filter[text]=${encodeURIComponent(query)}&page[limit]=6`, {
      headers: { 'Accept': 'application/vnd.api+json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((k) => {
      const a = k.attributes || {};
      return {
        id: `kitsu-${k.id}`,
        title: a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Untitled',
        originalTitle: a.titles?.ja_jp || '',
        year: a.startDate ? a.startDate.split('-')[0] : '',
        rating: a.averageRating ? Number((parseFloat(a.averageRating) / 10).toFixed(1)) : 0,
        overview: a.synopsis || '',
        posterUrl: a.posterImage?.large || a.posterImage?.original || null,
        backdropUrl: a.coverImage?.large || a.coverImage?.original || null,
        source: 'Kitsu',
      };
    });
  } catch {
    return [];
  }
}

// ── TMDB Multi / Animation Search ──
async function fetchTmdbMultiSearch(query, tmdbApiKey, contentType) {
  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&language=en-US&query=${encodeURIComponent(query)}&page=1&include_adult=true`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
      .map((r) => ({
        id: `tmdb-${r.id}`,
        tmdbId: r.id,
        title: r.title || r.name || 'Untitled',
        originalTitle: r.original_title || r.original_name || '',
        year: (r.release_date || r.first_air_date || '').split('-')[0],
        rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 0,
        overview: r.overview || '',
        posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : null,
        backdropUrl: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
        source: 'TMDB',
        isTv: r.media_type === 'tv',
      }));
  } catch {
    return [];
  }
}

// ── Fanart Search using TMDB Search Match ──
async function fetchFanartSearch(query, tmdbApiKey, fanartApiKey, isManga) {
  try {
    // Find matching TMDB ID first
    const tmdbRes = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
      { next: { revalidate: 3600 } }
    );
    if (!tmdbRes.ok) return [];
    const tmdbData = await tmdbRes.json();
    const show = tmdbData.results?.[0];
    if (!show?.id) return [];

    const fanartRes = await fetch(
      `https://webservice.fanart.tv/v3/tv/${show.id}?api_key=${fanartApiKey}`,
      { next: { revalidate: 3600 } }
    );
    if (!fanartRes.ok) return [];
    const fData = await fanartRes.json();

    const posters = fData.tvposter || fData.movieposter || [];
    const logos = fData.hdtvlogo || fData.clearlogo || fData.hdclearart || [];

    const results = [];
    if (posters.length > 0) {
      results.push({
        id: `fanart-${show.id}`,
        tmdbId: show.id,
        title: show.name || query,
        originalTitle: show.original_name || '',
        year: show.first_air_date ? show.first_air_date.split('-')[0] : '',
        overview: show.overview || '',
        posterUrl: posters[0]?.url ? toFanartBigPreview(posters[0].url) : null,
        logoUrl: logos[0]?.url ? toFanartBigPreview(logos[0].url) : null,
        source: 'Fanart.tv',
      });
    }
    return results;
  } catch {
    return [];
  }
}
