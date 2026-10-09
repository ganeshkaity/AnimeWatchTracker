import { NextResponse } from 'next/server';
import { toFanartBigPreview, toFanartPreview, toFanartFull } from '../../../lib/fanartUtils';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';
const DEFAULT_FANART_KEY = 'd2d31f9ecabea050fc7d68aa3146015f';

// Helper to extract TMDB Watch Providers by country preference (IN, then US, then GB, then first available)
function parseWatchProviders(results) {
  if (!results || typeof results !== 'object') {
    return { needPlan: [], rent: [], buy: [], free: [], link: '' };
  }

  const country = results.IN || results.US || results.GB || results[Object.keys(results)[0]] || {};
  const mapProvider = (p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : null,
  });

  return {
    needPlan: Array.isArray(country.flatrate) ? country.flatrate.map(mapProvider) : [],
    rent: Array.isArray(country.rent) ? country.rent.map(mapProvider) : [],
    buy: Array.isArray(country.buy) ? country.buy.map(mapProvider) : [],
    free: Array.isArray(country.free || country.ads) ? (country.free || country.ads).map(mapProvider) : [],
    link: country.link || '',
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
    const type = (searchParams.get('type') || 'movie').toLowerCase();
    const hintTmdbId = searchParams.get('tmdbId');
    const hintAnilistId = searchParams.get('anilistId');

    if (!id && !query) {
      return NextResponse.json(
        { success: false, error: 'Media ID or query is required' },
        { status: 400 }
      );
    }

    const tmdbApiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;
    const fanartApiKey = process.env.FANART_API_KEY || DEFAULT_FANART_KEY;

    // ── 1. MOVIE: ONLY FETCH FROM TMDB ──
    if (type === 'movie') {
      const tmdbId = hintTmdbId || id.replace(/^tmdb-/, '');
      const tmdbUrl = `https://api.themoviedb.org/3/movie/${encodeURIComponent(tmdbId)}?api_key=${tmdbApiKey}&language=en-US&include_image_language=en,null&append_to_response=credits,images,videos,keywords,watch/providers`;

      const res = await fetch(tmdbUrl, { headers: { 'Accept': 'application/json' }, next: { revalidate: 86400 } });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: `TMDB Movie error (${res.status})` }, { status: res.status });
      }

      const d = await res.json();
      const releaseYear = d.release_date ? d.release_date.split('-')[0] : '';
      const genres = Array.isArray(d.genres) ? d.genres.map((g) => g.name) : [];
      const directors = d.credits?.crew ? d.credits.crew.filter((p) => p.job === 'Director').map((p) => p.name) : [];

      // Cast with w300 photos as required
      const cast = Array.isArray(d.credits?.cast)
        ? d.credits.cast.slice(0, 30).map((p) => ({
          id: p.id,
          name: p.name,
          character: p.character || '',
          profileUrl: p.profile_path ? `https://image.tmdb.org/t/p/w300${p.profile_path}` : null,
          order: p.order ?? 999,
        }))
        : [];

      // Images (posters, backdrops, logos)
      const images = {
        posters: Array.isArray(d.images?.posters)
          ? d.images.posters.slice(0, 30).map((img) => ({
            url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
            previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
            fullUrl: `https://image.tmdb.org/t/p/original${img.file_path}`,
            width: img.width,
            height: img.height,
            source: 'TMDB',
            mediaType: 'poster',
          }))
          : [],
        backdrops: Array.isArray(d.images?.backdrops)
          ? d.images.backdrops.slice(0, 30).map((img) => ({
            url: `https://image.tmdb.org/t/p/original${img.file_path}`,
            previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
            width: img.width,
            height: img.height,
            source: 'TMDB',
            mediaType: 'backdrop',
          }))
          : [],
        logos: Array.isArray(d.images?.logos)
          ? d.images.logos.slice(0, 25).map((img) => ({
            url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
            previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
            fullUrl: `https://image.tmdb.org/t/p/original${img.file_path}`,
            width: img.width,
            height: img.height,
            source: 'TMDB',
            mediaType: 'logo',
          }))
          : [],
        artworks: [],
      };

      // Videos (YouTube)
      const videos = Array.isArray(d.videos?.results)
        ? d.videos.results
          .filter((v) => v.site === 'YouTube' && v.key)
          .map((v) => ({
            id: v.id,
            name: v.name,
            key: v.key,
            site: v.site,
            type: v.type || 'Trailer',
            official: Boolean(v.official),
          }))
        : [];

      const watchProviders = parseWatchProviders(d['watch/providers']?.results);

      const movieDetails = {
        id: `watchlist-${d.id}`,
        tmdbId: d.id,
        contentType: 'movie',
        title: d.title || d.original_title || 'Untitled Movie',
        originalTitle: d.original_title || '',
        tagline: d.tagline || '',
        overview: d.overview || '',
        releaseDate: d.release_date || '',
        year: releaseYear,
        runtime: d.runtime || 0,
        genres,
        rating: d.vote_average ? Number(d.vote_average.toFixed(1)) : 0,
        voteCount: d.vote_count || 0,
        posterUrl: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
        backdropUrl: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
        logoUrl: images.logos?.[0]?.url || null,
        language: d.original_language || 'en',
        productionCountries: Array.isArray(d.production_countries) ? d.production_countries.map((c) => c.name) : [],
        directors,
        cast,
        crew: Array.isArray(d.credits?.crew) ? d.credits.crew.slice(0, 20).map((c) => ({ id: c.id, name: c.name, role: c.job || 'Crew' })) : [],
        images,
        videos,
        watchProviders,
        status: d.status || 'Released',
      };

      return NextResponse.json({ success: true, details: movieDetails });
    }

    // ── 2. WEB-SERIES: ONLY FETCH FROM TMDB ──
    if (type === 'web-series' || type === 'series' || type === 'tv') {
      const tmdbId = hintTmdbId || id.replace(/^tmdb-/, '');
      const tmdbUrl = `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}?api_key=${tmdbApiKey}&language=en-US&include_image_language=en,null&append_to_response=credits,images,videos,keywords,watch/providers`;

      const res = await fetch(tmdbUrl, { headers: { 'Accept': 'application/json' }, next: { revalidate: 86400 } });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: `TMDB TV error (${res.status})` }, { status: res.status });
      }

      const d = await res.json();
      const releaseYear = d.first_air_date ? d.first_air_date.split('-')[0] : '';
      const genres = Array.isArray(d.genres) ? d.genres.map((g) => g.name) : [];
      const creators = Array.isArray(d.created_by) ? d.created_by.map((c) => c.name) : [];

      // Cast with w300 photos as required
      const cast = Array.isArray(d.credits?.cast)
        ? d.credits.cast.slice(0, 30).map((p) => ({
          id: p.id,
          name: p.name,
          character: p.character || '',
          profileUrl: p.profile_path ? `https://image.tmdb.org/t/p/w300${p.profile_path}` : null,
          order: p.order ?? 999,
        }))
        : [];

      // Images (posters, backdrops, logos)
      const images = {
        posters: Array.isArray(d.images?.posters)
          ? d.images.posters.slice(0, 30).map((img) => ({
            url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
            previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
            fullUrl: `https://image.tmdb.org/t/p/original${img.file_path}`,
            width: img.width,
            height: img.height,
            source: 'TMDB',
            mediaType: 'poster',
          }))
          : [],
        backdrops: Array.isArray(d.images?.backdrops)
          ? d.images.backdrops.slice(0, 30).map((img) => ({
            url: `https://image.tmdb.org/t/p/original${img.file_path}`,
            previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
            width: img.width,
            height: img.height,
            source: 'TMDB',
            mediaType: 'backdrop',
          }))
          : [],
        logos: Array.isArray(d.images?.logos)
          ? d.images.logos.slice(0, 25).map((img) => ({
            url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
            previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
            fullUrl: `https://image.tmdb.org/t/p/original${img.file_path}`,
            width: img.width,
            height: img.height,
            source: 'TMDB',
            mediaType: 'logo',
          }))
          : [],
        artworks: [],
      };

      // Videos (YouTube)
      const videos = Array.isArray(d.videos?.results)
        ? d.videos.results
          .filter((v) => v.site === 'YouTube' && v.key)
          .map((v) => ({
            id: v.id,
            name: v.name,
            key: v.key,
            site: v.site,
            type: v.type || 'Trailer',
            official: Boolean(v.official),
          }))
        : [];

      const watchProviders = parseWatchProviders(d['watch/providers']?.results);

      // Fetch seasons and episode details for web-series
      const rawSeasons = Array.isArray(d.seasons) ? d.seasons : [];
      const validSeasons = rawSeasons.filter((s) => s.season_number > 0);
      const targetSeasons = validSeasons.length > 0 ? validSeasons : rawSeasons;

      const seasonsWithEpisodes = await Promise.all(
        targetSeasons.map(async (s) => {
          try {
            const sRes = await fetch(
              `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}/season/${s.season_number}?api_key=${tmdbApiKey}&language=en-US`,
              { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } }
            );

            if (!sRes.ok) {
              return {
                id: s.id,
                seasonNumber: s.season_number,
                name: s.name || `Season ${s.season_number}`,
                overview: s.overview || '',
                episodeCount: s.episode_count || 0,
                airDate: s.air_date || '',
                posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
                episodes: [],
              };
            }

            const sData = await sRes.json();
            const epList = (sData.episodes || []).map((ep) => ({
              id: ep.id,
              episodeNumber: ep.episode_number,
              seasonNumber: ep.season_number,
              name: ep.name || `Episode ${ep.episode_number}`,
              overview: ep.overview || '',
              airDate: ep.air_date || '',
              runtime: ep.runtime || 0,
              voteAverage: ep.vote_average ? Number(ep.vote_average.toFixed(1)) : null,
              voteCount: ep.vote_count || 0,
              stillUrl: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null,
            }));

            return {
              id: s.id,
              seasonNumber: s.season_number,
              name: s.name || `Season ${s.season_number}`,
              overview: sData.overview || s.overview || '',
              episodeCount: epList.length || s.episode_count || 0,
              airDate: sData.air_date || s.air_date || '',
              posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
              episodes: epList,
            };
          } catch (sErr) {
            console.warn(`[Details API] Failed to fetch season ${s.season_number}:`, sErr);
            return {
              id: s.id,
              seasonNumber: s.season_number,
              name: s.name || `Season ${s.season_number}`,
              overview: s.overview || '',
              episodeCount: s.episode_count || 0,
              airDate: s.air_date || '',
              posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
              episodes: [],
            };
          }
        })
      );

      const totalEpisodesCount = seasonsWithEpisodes.reduce((acc, s) => acc + (s.episodes?.length || s.episodeCount || 0), 0);

      const seriesDetails = {
        id: `watchlist-${d.id}`,
        tmdbId: d.id,
        contentType: 'web-series',
        title: d.name || d.original_name || 'Untitled Series',
        originalTitle: d.original_name || '',
        tagline: d.tagline || '',
        overview: d.overview || '',
        releaseDate: d.first_air_date || '',
        year: releaseYear,
        seasonsCount: d.number_of_seasons || seasonsWithEpisodes.length,
        episodesCount: d.number_of_episodes || totalEpisodesCount,
        seasons: seasonsWithEpisodes,
        genres,
        rating: d.vote_average ? Number(d.vote_average.toFixed(1)) : 0,
        voteCount: d.vote_count || 0,
        posterUrl: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
        backdropUrl: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
        logoUrl: images.logos?.[0]?.url || null,
        language: d.original_language || 'en',
        productionCountries: Array.isArray(d.production_countries) ? d.production_countries.map((c) => c.name) : [],
        directors: creators,
        cast,
        crew: Array.isArray(d.credits?.crew) ? d.credits.crew.slice(0, 20).map((c) => ({ id: c.id, name: c.name, role: c.job || 'Crew' })) : [],
        images,
        videos,
        watchProviders,
        status: d.status || 'Returning Series',
      };

      return NextResponse.json({ success: true, details: seriesDetails });
    }

    // ── 3. ANIME, MANGA, WEBTOON, AUDIO-STORIES, MANHWA: FETCH TMDB + ANILIST + JIKAN/KITSU + FANART ──
    const isMangaFamily = ['manga', 'manhwa', 'manwah', 'webtoon'].includes(type);
    const anilistMediaType = isMangaFamily ? 'MANGA' : 'ANIME';
    const searchQuery = query || (id ? id.replace(/^(anilist-|jikan-|tmdb-|kitsu-|fanart-)/, '') : '');

    // Step A: Fetch AniList details
    const anilistPromise = fetchAniListFull(hintAnilistId || id, searchQuery, anilistMediaType);
    // Step B: Search/Fetch TMDB for matching media & logos/cast/providers
    const tmdbPromise = fetchTmdbRichAnimeData(hintTmdbId, searchQuery, tmdbApiKey, isMangaFamily);
    // Step C: Fetch Jikan details
    const jikanPromise = fetchJikanFull(searchQuery, isMangaFamily ? 'manga' : 'anime');

    const [aniSettled, tmdbSettled, jikanSettled] = await Promise.allSettled([
      anilistPromise,
      tmdbPromise,
      jikanPromise,
    ]);

    const aniData = aniSettled.status === 'fulfilled' ? aniSettled.value : null;
    const tmdbData = tmdbSettled.status === 'fulfilled' ? tmdbSettled.value : null;
    const jikanData = jikanSettled.status === 'fulfilled' ? jikanSettled.value : null;

    // Step D: Fetch Fanart TV with TMDB ID or TVDB ID
    const effectiveTmdbId = tmdbData?.tmdbId || hintTmdbId;
    let fanartData = null;
    if (effectiveTmdbId || searchQuery) {
      try {
        fanartData = await fetchFanartFull(effectiveTmdbId, searchQuery, tmdbApiKey, fanartApiKey);
      } catch (fErr) {
        console.warn('Fanart fetch warning:', fErr.message);
      }
    }

    // Combine Titles
    const primaryTitle =
      aniData?.titleEnglish ||
      aniData?.titleRomaji ||
      tmdbData?.title ||
      jikanData?.title ||
      searchQuery ||
      'Untitled';
    const originalTitle =
      aniData?.titleNative ||
      aniData?.titleRomaji ||
      tmdbData?.originalTitle ||
      jikanData?.originalTitle ||
      '';

    // Combine Overview & Description
    const overview =
      aniData?.description ||
      tmdbData?.overview ||
      jikanData?.overview ||
      '';

    // Combine Genres
    const genresSet = new Set([
      ...(aniData?.genres || []),
      ...(tmdbData?.genres || []),
      ...(jikanData?.genres || []),
    ]);
    const genres = Array.from(genresSet).filter(Boolean);

    // Combine Year & Date
    const year =
      aniData?.year ||
      tmdbData?.year ||
      jikanData?.year ||
      '';
    const releaseDate =
      aniData?.releaseDate ||
      tmdbData?.releaseDate ||
      jikanData?.releaseDate ||
      '';

    // Combine Rating
    const rating =
      aniData?.rating ||
      tmdbData?.rating ||
      jikanData?.rating ||
      0;

    // ── Logos: Prioritize Fanart + TMDB ──
    const combinedLogos = [];
    const seenLogos = new Set();

    // Fanart Clearlogos first (with toFanartBigPreview as requested)
    if (fanartData?.logos && Array.isArray(fanartData.logos)) {
      for (const l of fanartData.logos) {
        if (l.url && !seenLogos.has(l.url)) {
          seenLogos.add(l.url);
          combinedLogos.push({
            url: toFanartBigPreview(l.url),
            previewUrl: toFanartBigPreview(l.url),
            fullUrl: toFanartFull(l.url),
            source: 'Fanart.tv',
            mediaType: 'logo',
          });
        }
      }
    }

    // TMDB Logos next (w500 stored, w300 preview)
    if (tmdbData?.images?.logos && Array.isArray(tmdbData.images.logos)) {
      for (const l of tmdbData.images.logos) {
        if (l.url && !seenLogos.has(l.url)) {
          seenLogos.add(l.url);
          combinedLogos.push({
            url: l.url,
            previewUrl: l.previewUrl || l.url,
            fullUrl: l.fullUrl || l.url,
            source: 'TMDB',
            mediaType: 'logo',
          });
        }
      }
    }

    // ── Posters: AniList, Fanart, TMDB, Jikan ──
    const combinedPosters = [];
    const seenPosters = new Set();

    if (aniData?.posterUrl && !seenPosters.has(aniData.posterUrl)) {
      seenPosters.add(aniData.posterUrl);
      combinedPosters.push({
        url: aniData.posterUrl,
        previewUrl: aniData.posterUrl,
        source: 'AniList',
        mediaType: 'poster',
      });
    }

    if (fanartData?.posters && Array.isArray(fanartData.posters)) {
      for (const p of fanartData.posters) {
        if (p.url && !seenPosters.has(p.url)) {
          seenPosters.add(p.url);
          combinedPosters.push({
            url: toFanartBigPreview(p.url),
            previewUrl: toFanartBigPreview(p.url),
            fullUrl: toFanartFull(p.url),
            source: 'Fanart.tv',
            mediaType: 'poster',
          });
        }
      }
    }

    if (tmdbData?.images?.posters && Array.isArray(tmdbData.images.posters)) {
      for (const p of tmdbData.images.posters) {
        if (p.url && !seenPosters.has(p.url)) {
          seenPosters.add(p.url);
          combinedPosters.push({
            url: p.url,
            previewUrl: p.previewUrl || p.url,
            source: 'TMDB',
            mediaType: 'poster',
          });
        }
      }
    }

    if (jikanData?.posterUrl && !seenPosters.has(jikanData.posterUrl)) {
      seenPosters.add(jikanData.posterUrl);
      combinedPosters.push({
        url: jikanData.posterUrl,
        source: 'Jikan (MAL)',
        mediaType: 'poster',
      });
    }

    // ── Backdrops / Banners: AniList banner, Fanart showbackgrounds, TMDB backdrops ──
    const combinedBackdrops = [];
    const seenBackdrops = new Set();

    if (aniData?.backdropUrl && !seenBackdrops.has(aniData.backdropUrl)) {
      seenBackdrops.add(aniData.backdropUrl);
      combinedBackdrops.push({
        url: aniData.backdropUrl,
        source: 'AniList',
        mediaType: 'backdrop',
      });
    }

    if (fanartData?.backdrops && Array.isArray(fanartData.backdrops)) {
      for (const b of fanartData.backdrops) {
        if (b.url && !seenBackdrops.has(b.url)) {
          seenBackdrops.add(b.url);
          combinedBackdrops.push({
            url: toFanartFull(b.url),
            previewUrl: toFanartBigPreview(b.url),
            source: 'Fanart.tv',
            mediaType: 'backdrop',
          });
        }
      }
    }

    if (tmdbData?.images?.backdrops && Array.isArray(tmdbData.images.backdrops)) {
      for (const b of tmdbData.images.backdrops) {
        if (b.url && !seenBackdrops.has(b.url)) {
          seenBackdrops.add(b.url);
          combinedBackdrops.push(b);
        }
      }
    }

    // ── Artworks: Fanart characterart / clearart ──
    const combinedArtworks = [];
    if (fanartData?.artworks && Array.isArray(fanartData.artworks)) {
      for (const a of fanartData.artworks) {
        combinedArtworks.push({
          url: toFanartBigPreview(a.url),
          fullUrl: toFanartFull(a.url),
          source: 'Fanart.tv',
          mediaType: 'artwork',
        });
      }
    }

    // ── Cast: with TMDB w300 photos & Fanart bigpreview & AniList character/actor photos ──
    const combinedCast = [];
    const seenCast = new Set();

    // 1. TMDB Cast (use w300 as specified)
    if (tmdbData?.cast && Array.isArray(tmdbData.cast)) {
      for (const c of tmdbData.cast) {
        if (c.name && !seenCast.has(c.name.toLowerCase())) {
          seenCast.add(c.name.toLowerCase());
          combinedCast.push(c);
        }
      }
    }

    // 2. AniList Cast & Voice Actors
    if (aniData?.characters && Array.isArray(aniData.characters)) {
      for (const c of aniData.characters) {
        const actorName = c.voiceActor?.name || c.name;
        if (actorName && !seenCast.has(actorName.toLowerCase())) {
          seenCast.add(actorName.toLowerCase());
          combinedCast.push({
            id: c.id,
            name: actorName,
            character: c.name || '',
            profileUrl: c.voiceActor?.image || c.image || null,
            source: 'AniList',
          });
        }
      }
    }

    // ── Videos & Trailers: TMDB + Jikan ──
    const combinedVideos = [];
    const seenVideos = new Set();

    if (tmdbData?.videos && Array.isArray(tmdbData.videos)) {
      for (const v of tmdbData.videos) {
        if (v.key && !seenVideos.has(v.key)) {
          seenVideos.add(v.key);
          combinedVideos.push(v);
        }
      }
    }

    if (jikanData?.trailerKey && !seenVideos.has(jikanData.trailerKey)) {
      seenVideos.add(jikanData.trailerKey);
      combinedVideos.push({
        id: `jikan-trailer`,
        name: `${primaryTitle} Official Trailer`,
        key: jikanData.trailerKey,
        site: 'YouTube',
        type: 'Trailer',
        official: true,
      });
    }

    // ── Watch Providers: TMDB (Need Plan, Rent, Buy, Free to watch) ──
    const watchProviders = tmdbData?.watchProviders || {
      needPlan: [],
      rent: [],
      buy: [],
      free: [],
      link: '',
    };

    const details = {
      id: `watchlist-${effectiveTmdbId || aniData?.id || Date.now()}`,
      tmdbId: effectiveTmdbId || null,
      anilistId: aniData?.id || null,
      contentType: type,
      title: primaryTitle,
      englishTitle: aniData?.titleEnglish || tmdbData?.title || '',
      romajiTitle: aniData?.titleRomaji || '',
      originalTitle,
      overview,
      year,
      releaseDate,
      genres,
      rating,
      posterUrl: combinedPosters[0]?.url || null,
      backdropUrl: combinedBackdrops[0]?.url || combinedPosters[0]?.url || null,
      logoUrl: combinedLogos[0]?.url || null,
      cast: combinedCast.slice(0, 30),
      images: {
        posters: combinedPosters,
        backdrops: combinedBackdrops,
        logos: combinedLogos,
        artworks: combinedArtworks,
      },
      videos: combinedVideos,
      watchProviders,
      status: aniData?.status || tmdbData?.status || 'Planning',
      episodesCount: aniData?.episodes || tmdbData?.episodesCount || null,
      chaptersCount: aniData?.chapters || null,
    };

    return NextResponse.json({ success: true, details });
  } catch (err) {
    console.error('[Watchlist Details API Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error while fetching details' },
      { status: 500 }
    );
  }
}

// ── Full AniList Query ──
async function fetchAniListFull(anilistId, query, mediaType) {
  const isIdLookup = anilistId && !String(anilistId).startsWith('anilist-') && !isNaN(Number(anilistId));
  const cleanId = String(anilistId || '').replace(/^anilist-/, '');

  const gqlQuery = `
    query ($id: Int, $search: String, $type: MediaType) {
      Media(id: $id, search: $search, type: $type) {
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
          month
          day
        }
        averageScore
        description
        genres
        status
        episodes
        chapters
        characters(sort: ROLE, perPage: 12) {
          edges {
            role
            node {
              id
              name {
                full
              }
              image {
                large
              }
            }
            voiceActors(language: JAPANESE) {
              id
              name {
                full
              }
              image {
                large
              }
            }
          }
        }
      }
    }
  `;

  try {
    const variables = {};
    if (cleanId && !isNaN(Number(cleanId))) {
      variables.id = Number(cleanId);
    } else {
      variables.search = query;
      variables.type = mediaType;
    }

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query: gqlQuery, variables }),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.data?.Media;
    if (!m) return null;

    const characters = (m.characters?.edges || []).map((e) => ({
      id: e.node?.id,
      name: e.node?.name?.full,
      image: e.node?.image?.large,
      role: e.role,
      voiceActor: e.voiceActors?.[0]
        ? {
          id: e.voiceActors[0].id,
          name: e.voiceActors[0].name?.full,
          image: e.voiceActors[0].image?.large,
        }
        : null,
    }));

    const dateStr = m.startDate?.year
      ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, '0')}-${String(m.startDate.day || 1).padStart(2, '0')}`
      : '';

    return {
      id: m.id,
      titleEnglish: m.title?.english,
      titleRomaji: m.title?.romaji,
      titleNative: m.title?.native,
      description: m.description ? m.description.replace(/<[^>]*>?/gm, '').trim() : '',
      genres: m.genres || [],
      year: m.startDate?.year ? String(m.startDate.year) : '',
      releaseDate: dateStr,
      rating: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 0,
      posterUrl: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null,
      backdropUrl: m.bannerImage || null,
      episodes: m.episodes || null,
      chapters: m.chapters || null,
      status: m.status || 'FINISHED',
      characters,
    };
  } catch {
    return null;
  }
}

// ── TMDB Anime/Show Match with w300 Cast Photos & Providers ──
async function fetchTmdbRichAnimeData(tmdbId, query, tmdbApiKey, isManga) {
  try {
    let resolvedId = tmdbId;
    let mediaType = isManga ? 'movie' : 'tv';

    if (!resolvedId && query) {
      // Search TMDB TV first, then Movie
      const searchRes = await fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
        { next: { revalidate: 86400 } }
      );
      if (searchRes.ok) {
        const sData = await searchRes.json();
        if (sData.results?.[0]?.id) {
          resolvedId = sData.results[0].id;
          mediaType = 'tv';
        }
      }
      if (!resolvedId) {
        const movieSearchRes = await fetch(
          `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
          { next: { revalidate: 86400 } }
        );
        if (movieSearchRes.ok) {
          const mData = await movieSearchRes.json();
          if (mData.results?.[0]?.id) {
            resolvedId = mData.results[0].id;
            mediaType = 'movie';
          }
        }
      }
    }

    if (!resolvedId) return null;

    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const detUrl = `https://api.themoviedb.org/3/${endpoint}/${resolvedId}?api_key=${tmdbApiKey}&include_image_language=en,ja,null&append_to_response=credits,images,videos,watch/providers`;

    const res = await fetch(detUrl, { headers: { 'Accept': 'application/json' }, next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const d = await res.json();

    // Cast with w300 profile photos as required
    const cast = Array.isArray(d.credits?.cast)
      ? d.credits.cast.slice(0, 25).map((p) => ({
        id: p.id,
        name: p.name,
        character: p.character || '',
        profileUrl: p.profile_path ? `https://image.tmdb.org/t/p/w300${p.profile_path}` : null,
      }))
      : [];

    const images = {
      posters: Array.isArray(d.images?.posters)
        ? d.images.posters.slice(0, 25).map((img) => ({
          url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
          previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
          fullUrl: `https://image.tmdb.org/t/p/original${img.file_path}`,
          source: 'TMDB',
          mediaType: 'poster',
        }))
        : [],
      backdrops: Array.isArray(d.images?.backdrops)
        ? d.images.backdrops.slice(0, 25).map((img) => ({
          url: `https://image.tmdb.org/t/p/original${img.file_path}`,
          previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
          source: 'TMDB',
          mediaType: 'backdrop',
        }))
        : [],
      logos: Array.isArray(d.images?.logos)
        ? d.images.logos.slice(0, 20).map((img) => ({
          url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
          previewUrl: `https://image.tmdb.org/t/p/w300${img.file_path}`,
          fullUrl: `https://image.tmdb.org/t/p/original${img.file_path}`,
          source: 'TMDB',
          mediaType: 'logo',
        }))
        : [],
    };

    const videos = Array.isArray(d.videos?.results)
      ? d.videos.results
        .filter((v) => v.site === 'YouTube' && v.key)
        .map((v) => ({
          id: v.id,
          name: v.name,
          key: v.key,
          site: v.site,
          type: v.type || 'Trailer',
          official: Boolean(v.official),
        }))
      : [];

    const watchProviders = parseWatchProviders(d['watch/providers']?.results);

    return {
      tmdbId: d.id,
      title: d.name || d.title,
      originalTitle: d.original_name || d.original_title || '',
      overview: d.overview || '',
      year: (d.first_air_date || d.release_date || '').split('-')[0],
      releaseDate: d.first_air_date || d.release_date || '',
      rating: d.vote_average ? Number(d.vote_average.toFixed(1)) : 0,
      genres: Array.isArray(d.genres) ? d.genres.map((g) => g.name) : [],
      cast,
      images,
      videos,
      watchProviders,
      status: d.status,
      episodesCount: d.number_of_episodes || null,
    };
  } catch {
    return null;
  }
}

// ── Fanart.tv Rich Graphics Fetch (Logos + Backgrounds + Posters + Artworks) ──
async function fetchFanartFull(tmdbId, query, tmdbApiKey, fanartApiKey) {
  try {
    let resolvedId = tmdbId;
    let isTv = true;

    if (!resolvedId && query) {
      const searchRes = await fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1`,
        { next: { revalidate: 86400 } }
      );
      if (searchRes.ok) {
        const sData = await searchRes.json();
        resolvedId = sData.results?.[0]?.id;
      }
    }

    if (!resolvedId) return null;

    // Try TV endpoint first, fallback to Movie endpoint
    let fRes = await fetch(`https://webservice.fanart.tv/v3/tv/${resolvedId}?api_key=${fanartApiKey}`, {
      next: { revalidate: 86400 },
    });
    if (!fRes.ok) {
      fRes = await fetch(`https://webservice.fanart.tv/v3/movies/${resolvedId}?api_key=${fanartApiKey}`, {
        next: { revalidate: 86400 },
      });
      isTv = false;
    }
    if (!fRes.ok) return null;

    const data = await fRes.json();
    const logos = [
      ...(data.hdtvlogo || []),
      ...(data.clearlogo || []),
      ...(data.hdclearart || []),
      ...(data.movielogo || []),
    ];
    const posters = [...(data.tvposter || []), ...(data.movieposter || [])];
    const backdrops = [...(data.showbackground || []), ...(data.moviebackground || [])];
    const artworks = [...(data.characterart || []), ...(data.hdclearart || [])];

    return {
      logos,
      posters,
      backdrops,
      artworks,
    };
  } catch {
    return null;
  }
}

// ── Jikan MAL Fetch ──
async function fetchJikanFull(query, endpoint) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/${endpoint}?q=${encodeURIComponent(query)}&limit=1`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const j = data.data?.[0];
    if (!j) return null;

    const trailerKey = j.trailer?.youtube_id || (j.trailer?.url ? j.trailer.url.split('v=')[1]?.split('&')[0] : null);

    return {
      title: j.title_english || j.title,
      originalTitle: j.title_japanese || '',
      overview: j.synopsis ? j.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim() : '',
      rating: j.score ? Number(j.score.toFixed(1)) : 0,
      year: j.year ? String(j.year) : (j.aired?.from ? j.aired.from.split('-')[0] : ''),
      releaseDate: j.aired?.from ? j.aired.from.split('T')[0] : '',
      genres: Array.isArray(j.genres) ? j.genres.map((g) => g.name) : [],
      posterUrl: j.images?.webp?.large_image_url || j.images?.jpg?.large_image_url || null,
      trailerKey,
    };
  } catch {
    return null;
  }
}
