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

    // ── 1. Primary: AniList GraphQL API (Type: MANGA) ───────────────────────
    try {
      const anilistQuery = `
        query ($search: String) {
          Media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
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
            chapters
            volumes
            genres
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
        signal: AbortSignal.timeout(5000)
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
            rating: rating || 8.0,
            score: rating || 8.0,
            popularity: media.popularity || 0,
            favorites: media.favourites || 0,
            status: media.status || 'Finished',
            chapters: media.chapters || null,
            volumes: media.volumes || null,
            genres: media.genres || [],
            synopsis: media.description ? media.description.replace(/<[^>]*>?/gm, '') : '',
            url: media.siteUrl || `https://anilist.co/manga/${media.id}`,
            source: 'AniList'
          });
        }
      }
    } catch (aniErr) {
      console.warn('[manga-rating] AniList fetch failed, attempting fallbacks:', aniErr.message);
    }

    // ── 2. Fallback: Kitsu API ───────────────────────────────────────────────
    try {
      const kitsuUrl = `https://kitsu.io/api/edge/manga?filter%5Btext%5D=${encodeURIComponent(cleanQuery)}&page%5Blimit%5D=3`;
      const kitsuRes = await fetch(kitsuUrl, {
        headers: {
          'Accept': 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (kitsuRes.ok) {
        const kitsuData = await kitsuRes.json();
        const items = kitsuData?.data || [];
        if (items.length > 0) {
          const attr = items[0].attributes;
          const rawScore = attr.averageRating ? parseFloat(attr.averageRating) : null;
          const rating = rawScore ? Math.round((rawScore / 10) * 10) / 10 : 8.2;

          return NextResponse.json({
            success: true,
            title: attr.canonicalTitle || attr.titles?.en || cleanQuery,
            japaneseTitle: attr.titles?.ja_jp || '',
            rating: rating,
            score: rating,
            popularity: attr.popularityRank || 0,
            rank: attr.ratingRank ? `#${attr.ratingRank}` : null,
            status: attr.status || 'finished',
            chapters: attr.chapterCount || null,
            volumes: attr.volumeCount || null,
            synopsis: attr.synopsis || '',
            url: `https://kitsu.io/manga/${items[0].id}`,
            source: 'Kitsu / AniList Fallback'
          });
        }
      }
    } catch (kitsuErr) {
      console.warn('[manga-rating] Kitsu fetch failed:', kitsuErr.message);
    }

    // ── 3. Fallback: Jikan v4 (MyAnimeList) ──────────────────────────────────
    try {
      const jikanUrl = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(cleanQuery)}&limit=3&sfw=true`;
      const jikanRes = await fetch(jikanUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
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
            rank: item.rank ? `#${item.rank}` : null,
            status: item.status || 'Publishing',
            chapters: item.chapters || null,
            volumes: item.volumes || null,
            synopsis: item.synopsis || '',
            url: item.url || '',
            source: 'MyAnimeList'
          });
        }
      }
    } catch (jikanErr) {
      console.warn('[manga-rating] Jikan fetch failed:', jikanErr.message);
    }

    return NextResponse.json({
      success: false,
      error: `Could not find manga details for "${cleanQuery}".`
    }, { status: 404 });
  } catch (error) {
    console.error('Error in GET /api/manga-rating:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
