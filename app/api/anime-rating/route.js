import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || !query.trim()) {
      return NextResponse.json({ success: false, error: 'Query parameter q is required' }, { status: 400 });
    }

    const cleanQuery = query.trim();

    // ── 1. Primary: Query Jikan v4 (MyAnimeList) ─────────────────────────────
    try {
      const jikanUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanQuery)}&limit=3&sfw=true`;
      const jikanRes = await fetch(jikanUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });

      if (jikanRes.ok) {
        const jikanData = await jikanRes.json();
        const results = jikanData?.data || [];

        if (results.length > 0) {
          const item = results[0];
          const rawScore = item.score ? parseFloat(item.score) : null;
          const rating = rawScore ? Math.round(rawScore * 10) / 10 : null;

          return NextResponse.json({
            success: true,
            title: item.title_english || item.title || cleanQuery,
            japaneseTitle: item.title_japanese || '',
            rating: rating || 8.0,
            score: rawScore || 8.0,
            scoredBy: item.scored_by || 0,
            popularity: item.popularity || 0,
            members: item.members || 0,
            rank: item.rank || null,
            favorites: item.favorites || 0,
            status: item.status || 'Finished Airing',
            episodes: item.episodes || null,
            synopsis: item.synopsis || '',
            url: item.url || '',
            source: 'MyAnimeList'
          });
        }
      }
    } catch (jikanErr) {
      console.warn('[anime-rating] Jikan fetch failed, attempting AniList fallback:', jikanErr.message);
    }

    // ── 2. Fallback: AniList GraphQL API ──────────────────────────────────────
    try {
      const anilistQuery = `
        query ($search: String) {
          Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id
            title {
              romaji
              english
              native
            }
            averageScore
            meanScore
            popularity
            favourites
            status
            episodes
            siteUrl
            description
          }
        }
      `;

      const aniRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: anilistQuery,
          variables: { search: cleanQuery }
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (aniRes.ok) {
        const aniData = await aniRes.json();
        const media = aniData?.data?.Media;

        if (media) {
          const avg = media.averageScore || media.meanScore;
          const rating = avg ? Math.round((avg / 10) * 10) / 10 : 8.0;

          return NextResponse.json({
            success: true,
            title: media.title?.english || media.title?.romaji || cleanQuery,
            japaneseTitle: media.title?.native || '',
            rating: rating,
            score: rating,
            scoredBy: null,
            popularity: media.popularity || 0,
            members: media.popularity || 0,
            rank: null,
            favorites: media.favourites || 0,
            status: media.status || 'FINISHED',
            episodes: media.episodes || null,
            synopsis: media.description || '',
            url: media.siteUrl || '',
            source: 'AniList'
          });
        }
      }
    } catch (aniErr) {
      console.warn('[anime-rating] AniList fetch failed:', aniErr.message);
    }

    return NextResponse.json(
      { success: false, error: `Could not find anime matching "${cleanQuery}" on MyAnimeList or AniList.` },
      { status: 404 }
    );

  } catch (err) {
    console.error('[anime-rating route error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
