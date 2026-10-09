import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';
const DEFAULT_FANART_KEY = 'd2d31f9ecabea050fc7d68aa3146015f';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const query = searchParams.get('q') || searchParams.get('query');

    if (!id && !query) {
      return NextResponse.json(
        { success: false, error: 'Anime ID or search query is required' },
        { status: 400 }
      );
    }

    const tmdbApiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;
    const fanartApiKey = process.env.FANART_API_KEY || DEFAULT_FANART_KEY;

    // 1. Fetch AniList Anime details
    const anilistItem = await fetchAniListAnimeDetails(id, query);

    const titleEnglish = anilistItem?.title?.english || '';
    const titleRomaji = anilistItem?.title?.romaji || '';
    const titleNative = anilistItem?.title?.native || '';
    const displayTitle = titleEnglish || titleRomaji || titleNative || query || 'Anime';
    const cleanSearchQuery = (titleEnglish || titleRomaji || displayTitle).trim();

    const anilistCover =
      anilistItem?.coverImage?.extraLarge ||
      anilistItem?.coverImage?.large ||
      anilistItem?.coverImage?.medium ||
      null;

    const anilistBanner = anilistItem?.bannerImage || null;
    const genres = Array.isArray(anilistItem?.genres) ? anilistItem.genres : [];
    const year = anilistItem?.startDate?.year ? String(anilistItem.startDate.year) : '';
    const episodes = anilistItem?.episodes || null;
    const overview = anilistItem?.description
      ? anilistItem.description.replace(/<[^>]*>?/gm, '').trim()
      : '';
    const rating = anilistItem?.averageScore
      ? Number((anilistItem.averageScore / 10).toFixed(1))
      : null;

    // 2. Query TMDB & Fanart.tv in parallel for rich Title Art/Logos, Wide Banners, and Posters
    const [tmdbMedia, fanartMedia] = await Promise.allSettled([
      fetchTmdbMedia(cleanSearchQuery, tmdbApiKey),
      fetchFanartMedia(cleanSearchQuery, tmdbApiKey, fanartApiKey),
    ]);

    const tmdbData = tmdbMedia.status === 'fulfilled' ? tmdbMedia.value : null;
    const fanartData = fanartMedia.status === 'fulfilled' ? fanartMedia.value : null;

    // 3. Collect & Prioritize Logos (Title Art)
    // Fanart.tv official clearlogos / hdtvlogos are top priority, followed by TMDB logos
    const allLogos = [];
    const seenLogos = new Set();

    if (fanartData?.logos) {
      for (const item of fanartData.logos) {
        if (item.url && !seenLogos.has(item.url)) {
          seenLogos.add(item.url);
          allLogos.push({
            url: item.url,
            source: 'Fanart.tv',
            lang: item.lang || '',
            id: item.id || '',
          });
        }
      }
    }

    if (tmdbData?.logos) {
      for (const item of tmdbData.logos) {
        if (item.url && !seenLogos.has(item.url)) {
          seenLogos.add(item.url);
          allLogos.push({
            url: item.url,
            source: 'TMDB',
            width: item.width,
            height: item.height,
          });
        }
      }
    }

    // 4. Collect & Prioritize Wide Banners / Backgrounds (16:9)
    // AniList banner first, then Fanart.tv showbackgrounds & banners, then TMDB backdrops
    const allBanners = [];
    const seenBanners = new Set();

    if (anilistBanner) {
      seenBanners.add(anilistBanner);
      allBanners.push({
        url: anilistBanner,
        source: 'AniList',
        title: 'AniList Official Banner',
      });
    }

    if (fanartData?.banners) {
      for (const item of fanartData.banners) {
        if (item.url && !seenBanners.has(item.url)) {
          seenBanners.add(item.url);
          allBanners.push({
            url: item.url,
            source: 'Fanart.tv',
            title: item.type || 'Fanart Background',
          });
        }
      }
    }

    if (tmdbData?.backdrops) {
      for (const item of tmdbData.backdrops) {
        if (item.url && !seenBanners.has(item.url)) {
          seenBanners.add(item.url);
          allBanners.push({
            url: item.url,
            source: 'TMDB',
            width: item.width,
            height: item.height,
          });
        }
      }
    }

    // 5. Collect & Prioritize Posters (2:3)
    // AniList cover first ("use the existing anilist cover picture"), then Fanart.tv, then TMDB
    const allPosters = [];
    const seenPosters = new Set();

    if (anilistCover) {
      seenPosters.add(anilistCover);
      allPosters.push({
        url: anilistCover,
        source: 'AniList',
        title: 'AniList Official Cover',
      });
    }

    if (fanartData?.posters) {
      for (const item of fanartData.posters) {
        if (item.url && !seenPosters.has(item.url)) {
          seenPosters.add(item.url);
          allPosters.push({
            url: item.url,
            source: 'Fanart.tv',
            title: item.type || 'Fanart Poster',
          });
        }
      }
    }

    if (tmdbData?.posters) {
      for (const item of tmdbData.posters) {
        if (item.url && !seenPosters.has(item.url)) {
          seenPosters.add(item.url);
          allPosters.push({
            url: item.url,
            source: 'TMDB',
            width: item.width,
            height: item.height,
          });
        }
      }
    }

    // Pick top defaults
    const defaultLogo = allLogos.length > 0 ? allLogos[0].url : '';
    const defaultBanner = allBanners.length > 0 ? allBanners[0].url : '';
    const defaultPoster = anilistCover || (allPosters.length > 0 ? allPosters[0].url : '');

    return NextResponse.json({
      success: true,
      anime: {
        id: anilistItem?.id || id || null,
        title: displayTitle,
        englishTitle: titleEnglish,
        romajiTitle: titleRomaji,
        nativeTitle: titleNative,
        year,
        episodes,
        totalSeasons: 1,
        rating,
        overview,
        genres,
        cast: tmdbData?.cast || [],
        videos: tmdbData?.videos || [],
        coverUrl: defaultPoster,
        posterUrl: defaultPoster,
        bannerUrl: defaultBanner,
        backdropUrl: defaultBanner,
        logoUrl: defaultLogo,
        images: {
          covers: allPosters,
          posters: allPosters,
          banners: allBanners,
          backdrops: allBanners,
          logos: allLogos,
        },
      },
    });
  } catch (err) {
    console.error('[anime/details] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error while fetching anime details' },
      { status: 500 }
    );
  }
}

async function fetchAniListAnimeDetails(id, query) {
  let gqlQuery;
  let variables;

  if (id && !isNaN(Number(id))) {
    gqlQuery = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
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
          episodes
          status
          genres
          averageScore
          description(asHtml: false)
        }
      }
    `;
    variables = { id: parseInt(id, 10) };
  } else {
    gqlQuery = `
      query ($search: String) {
        Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
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
          episodes
          status
          genres
          averageScore
          description(asHtml: false)
        }
      }
    `;
    variables = { search: query };
  }

  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query: gqlQuery, variables }),
    signal: AbortSignal.timeout(7000),
  });

  if (!res.ok) {
    throw new Error(`AniList returned status ${res.status}`);
  }

  const json = await res.json();
  return json?.data?.Media || null;
}

async function fetchTmdbMedia(query, apiKey) {
  if (!query) return null;

  try {
    // 1. Search TV show first
    const tvSearchRes = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    const tvData = await tvSearchRes.json();
    const tvShow = tvData.results?.[0];

    if (tvShow) {
      const fullRes = await fetch(
        `https://api.themoviedb.org/3/tv/${tvShow.id}?api_key=${apiKey}&include_image_language=en,ja,null&append_to_response=images,credits,videos`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (fullRes.ok) {
        const fullData = await fullRes.json();
        const imgData = fullData.images || {};
        const cast = Array.isArray(fullData.credits?.cast)
          ? fullData.credits.cast.slice(0, 25).map((c) => ({
              id: c.id,
              name: c.name,
              character: c.character || 'Cast',
              profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
            }))
          : [];
        const videos = Array.isArray(fullData.videos?.results)
          ? fullData.videos.results
              .filter((v) => v.site === 'YouTube')
              .slice(0, 10)
              .map((v) => ({
                id: v.id,
                key: v.key,
                name: v.name,
                site: v.site,
                type: v.type,
              }))
          : [];

        return {
          tmdbId: tvShow.id,
          type: 'tv',
          cast,
          videos,
          logos: Array.isArray(imgData.logos)
            ? imgData.logos.slice(0, 15).map((img) => ({
              url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
              width: img.width,
              height: img.height,
            }))
            : [],
          backdrops: Array.isArray(imgData.backdrops)
            ? imgData.backdrops.slice(0, 20).map((img) => ({
              url: `https://image.tmdb.org/t/p/original${img.file_path}`,
              width: img.width,
              height: img.height,
            }))
            : [],
          posters: Array.isArray(imgData.posters)
            ? imgData.posters.slice(0, 20).map((img) => ({
              url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
              width: img.width,
              height: img.height,
            }))
            : [],
        };
      }
    }

    // 2. If not found or movie format, search Movie
    const movieSearchRes = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    const movieData = await movieSearchRes.json();
    const movie = movieData.results?.[0];

    if (movie) {
      const fullRes = await fetch(
        `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${apiKey}&include_image_language=en,ja,null&append_to_response=images,credits,videos`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (fullRes.ok) {
        const fullData = await fullRes.json();
        const imgData = fullData.images || {};
        const cast = Array.isArray(fullData.credits?.cast)
          ? fullData.credits.cast.slice(0, 25).map((c) => ({
              id: c.id,
              name: c.name,
              character: c.character || 'Cast',
              profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
            }))
          : [];
        const videos = Array.isArray(fullData.videos?.results)
          ? fullData.videos.results
              .filter((v) => v.site === 'YouTube')
              .slice(0, 10)
              .map((v) => ({
                id: v.id,
                key: v.key,
                name: v.name,
                site: v.site,
                type: v.type,
              }))
          : [];

        return {
          tmdbId: movie.id,
          type: 'movie',
          cast,
          videos,
          logos: Array.isArray(imgData.logos)
            ? imgData.logos.slice(0, 15).map((img) => ({
              url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
              width: img.width,
              height: img.height,
            }))
            : [],
          backdrops: Array.isArray(imgData.backdrops)
            ? imgData.backdrops.slice(0, 20).map((img) => ({
              url: `https://image.tmdb.org/t/p/original${img.file_path}`,
              width: img.width,
              height: img.height,
            }))
            : [],
          posters: Array.isArray(imgData.posters)
            ? imgData.posters.slice(0, 20).map((img) => ({
              url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
              width: img.width,
              height: img.height,
            }))
            : [],
        };
      }
    }
  } catch (err) {
    console.warn('[TMDB Media Fetch Error]:', err.message);
  }

  return null;
}

async function fetchFanartMedia(query, tmdbApiKey, fanartApiKey) {
  if (!query) return null;

  try {
    // A. Check TMDB TV -> get TVDB ID for Fanart TV
    const tvSearchRes = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    const tvData = await tvSearchRes.json();
    const tvShow = tvData.results?.[0];

    let tvdbId = null;
    if (tvShow) {
      const extRes = await fetch(
        `https://api.themoviedb.org/3/tv/${tvShow.id}/external_ids?api_key=${tmdbApiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (extRes.ok) {
        const extData = await extRes.json();
        tvdbId = extData.tvdb_id;
      }
    }

    // B. Check TMDB Movie -> get TMDB ID for Fanart Movies
    let tmdbMovieId = null;
    const movieSearchRes = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (movieSearchRes.ok) {
      const mData = await movieSearchRes.json();
      if (mData.results?.[0]) {
        tmdbMovieId = mData.results[0].id;
      }
    }

    // Fetch from Fanart TV if tvdbId is found
    if (tvdbId) {
      const fanartUrl = `https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${fanartApiKey}`;
      const fRes = await fetch(fanartUrl, { signal: AbortSignal.timeout(6000) });
      if (fRes.ok) {
        const d = await fRes.json();
        const rawLogos = [...(d.hdtvlogo || []), ...(d.clearlogo || [])];
        const rawBanners = [
          ...(d.showbackground || []),
          ...(d.show4kbackground || []),
          ...(d.tvbanner || []),
          ...(d.seasonbanner || []),
        ];
        const rawPosters = [...(d.tvposter || []), ...(d.seasonposter || [])];

        return {
          logos: rawLogos.map((l) => ({ url: l.url, lang: l.lang, id: l.id })),
          banners: rawBanners.map((b) => ({ url: b.url, type: 'Fanart Background', id: b.id })),
          posters: rawPosters.map((p) => ({ url: p.url, type: 'Fanart Poster', id: p.id })),
        };
      }
    }

    // Fallback to Fanart Movies if tmdbMovieId is found
    if (tmdbMovieId) {
      const fanartUrl = `https://webservice.fanart.tv/v3/movies/${tmdbMovieId}?api_key=${fanartApiKey}`;
      const fRes = await fetch(fanartUrl, { signal: AbortSignal.timeout(6000) });
      if (fRes.ok) {
        const d = await fRes.json();
        const rawLogos = [...(d.hdmovielogo || []), ...(d.movielogo || [])];
        const rawBanners = [
          ...(d.moviebackground || []),
          ...(d.movie4kbackground || []),
          ...(d.moviebanner || []),
        ];
        const rawPosters = Array.isArray(d.movieposter) ? d.movieposter : [];

        return {
          logos: rawLogos.map((l) => ({ url: l.url, lang: l.lang, id: l.id })),
          banners: rawBanners.map((b) => ({ url: b.url, type: 'Fanart Movie Backdrop', id: b.id })),
          posters: rawPosters.map((p) => ({ url: p.url, type: 'Fanart Movie Poster', id: p.id })),
        };
      }
    }
  } catch (err) {
    console.warn('[Fanart Media Fetch Error]:', err.message);
  }

  return null;
}
