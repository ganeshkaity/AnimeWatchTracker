import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Movie ID is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_KEY;
    // Use append_to_response=credits,images,videos,keywords to fetch everything in 1 single fast request
    const tmdbUrl = `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?api_key=${apiKey}&language=en-US&include_image_language=en,null&append_to_response=credits,images,videos,keywords`;

    const res = await fetch(tmdbUrl, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[TMDB Movie Details Error]', res.status, errText);
      return NextResponse.json(
        { success: false, error: `TMDB API error (${res.status})` },
        { status: res.status }
      );
    }

    const d = await res.json();
    const releaseYear = d.release_date ? d.release_date.split('-')[0] : '';
    const genres = Array.isArray(d.genres) ? d.genres.map((g) => g.name) : [];
    const productionCountries = Array.isArray(d.production_countries)
      ? d.production_countries.map((c) => c.name)
      : [];

    const posterUrl = d.poster_path
      ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
      : null;
    const backdropUrl = d.backdrop_path
      ? `https://image.tmdb.org/t/p/original${d.backdrop_path}`
      : null;

    // Directors and Writers
    const directors = d.credits?.crew
      ? d.credits.crew.filter((p) => p.job === 'Director').map((p) => p.name)
      : [];

    // Detailed Cast / Actors with id, image link, character name, actual name
    const cast = Array.isArray(d.credits?.cast)
      ? d.credits.cast.slice(0, 30).map((p) => ({
          id: p.id,
          name: p.name,
          character: p.character || '',
          profileUrl: p.profile_path ? `https://image.tmdb.org/t/p/w300${p.profile_path}` : null,
          order: p.order ?? 999,
        }))
      : [];

    // Detailed Crew with id, image link, role, actual name
    const crew = Array.isArray(d.credits?.crew)
      ? d.credits.crew
          .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id && x.job === c.job) === idx)
          .slice(0, 30)
          .map((c) => ({
            id: c.id,
            name: c.name,
            role: c.job || c.department || 'Crew',
            profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w300${c.profile_path}` : null,
          }))
      : [];

    // More Images: posters, backdrops, logos
    const images = {
      posters: Array.isArray(d.images?.posters)
        ? d.images.posters.slice(0, 30).map((img) => ({
            filePath: img.file_path,
            url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
            width: img.width,
            height: img.height,
            voteAverage: img.vote_average || 0,
          }))
        : [],
      backdrops: Array.isArray(d.images?.backdrops)
        ? d.images.backdrops.slice(0, 30).map((img) => ({
            filePath: img.file_path,
            url: `https://image.tmdb.org/t/p/original${img.file_path}`,
            width: img.width,
            height: img.height,
            voteAverage: img.vote_average || 0,
          }))
        : [],
      logos: Array.isArray(d.images?.logos)
        ? d.images.logos.slice(0, 20).map((img) => ({
            filePath: img.file_path,
            url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
            width: img.width,
            height: img.height,
            voteAverage: img.vote_average || 0,
          }))
        : [],
    };

    // Trailers, Teasers, and Video Links
    const videos = Array.isArray(d.videos?.results)
      ? d.videos.results
          .filter((v) => v.site === 'YouTube' && v.key)
          .map((v) => ({
            id: v.id,
            name: v.name,
            key: v.key,
            site: v.site,
            type: v.type, // 'Trailer', 'Teaser', 'Featurette', 'Clip', etc.
            official: Boolean(v.official),
            publishedAt: v.published_at || '',
          }))
      : [];

    const movieDetails = {
      tmdbId: d.id,
      title: d.title || d.original_title || 'Untitled Movie',
      originalTitle: d.original_title || '',
      tagline: d.tagline || '',
      overview: d.overview || '',
      releaseDate: d.release_date || '',
      year: releaseYear,
      runtime: d.runtime || 0, // in minutes
      genres,
      rating: d.vote_average ? Number(d.vote_average.toFixed(1)) : 0,
      voteCount: d.vote_count || 0,
      posterPath: d.poster_path || '',
      posterUrl,
      backdropPath: d.backdrop_path || '',
      backdropUrl,
      language: d.original_language || 'en',
      productionCountries,
      directors,
      cast,
      crew,
      images,
      videos,
      status: d.status || 'Released',
      imdbId: d.imdb_id || '',
    };

    return NextResponse.json({
      success: true,
      movie: movieDetails,
    });
  } catch (err) {
    console.error('[Movie Details Route Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error while fetching movie details' },
      { status: 500 }
    );
  }
}
