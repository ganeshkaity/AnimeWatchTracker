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
          Page(page: 1, perPage: 10) {
            media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
              id
              format
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
              coverImage {
                extraLarge
                large
                medium
              }
            }
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
        const mediaList = aniData?.data?.Page?.media || [];

        if (mediaList.length > 0) {
          const sLower = cleanQuery.toLowerCase();

          // 1. Check for exact title match that isn't a one-shot
          let media = mediaList.find(m =>
            (m.title?.romaji?.toLowerCase() === sLower || m.title?.english?.toLowerCase() === sLower) &&
            m.format !== 'ONE_SHOT'
          );

          // 2. Exact match even if one-shot if it has chapters
          if (!media) {
            media = mediaList.find(m =>
              (m.title?.romaji?.toLowerCase() === sLower || m.title?.english?.toLowerCase() === sLower) &&
              (m.format === 'MANGA' || (m.chapters && m.chapters > 1))
            );
          }

          // 3. Serialized manga with highest popularity
          if (!media) {
            const serializations = mediaList.filter(m => m.format === 'MANGA' || m.format === 'NOVEL');
            if (serializations.length > 0) {
              serializations.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
              media = serializations[0];
            }
          }

          // 4. Fallback to first item
          if (!media) {
            media = mediaList[0];
          }

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
            imageUrl: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || '',
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
            genres: [],
            synopsis: attr.synopsis || '',
            imageUrl: attr.posterImage?.large || attr.posterImage?.original || attr.posterImage?.medium || '',
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
            genres: Array.isArray(item.genres) ? item.genres.map(g => g.name) : [],
            synopsis: item.synopsis || '',
            imageUrl: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
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
