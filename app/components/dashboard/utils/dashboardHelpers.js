import React from 'react';
import { getLocalEpisodes } from '../../../utils/localStore';
import { toFanartBigPreview } from '../../../lib/fanartUtils';

export const GRADIENTS = [
  "from-violet-600 to-indigo-700",
  "from-purple-600 to-pink-600",
  "from-amber-500 to-rose-600",
  "from-emerald-500 to-teal-700",
  "from-cyan-600 to-blue-700",
];

export const YoutubeLogo = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000" />
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF" />
  </svg>
);

export const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-');        // Replace multiple - with single -
};

export const getInitials = (title) => {
  if (!title || typeof title !== 'string') return '';
  return title.split(' ').slice(0, 2).map(w => w ? w[0] : '').join('').toUpperCase();
};

export const getDeterministicRating = (id, rating) => {
  if (rating && !isNaN(parseFloat(rating)) && parseFloat(rating) > 0) {
    return parseFloat(rating).toFixed(1);
  }
  // Generate pseudo-random rating between 8.0 and 9.8 based on id string hash
  let hash = 0;
  const str = id || 'default';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const min = 8.0;
  const random = min + (Math.abs(hash) % 19) * 0.1;
  return random.toFixed(1);
};

export const getAnimeProgressPercent = (anime) => {
  if (!anime) return 0;
  try {
    const localEps = getLocalEpisodes(anime.id);
    if (Array.isArray(localEps) && localEps.length > 0) {
      const watched = localEps.filter(e => !!e.isWatched).length;
      return Math.round((watched / localEps.length) * 100);
    }
  } catch (e) {}
  return Math.round(anime.progressPercent || 0);
};

export const resolveHeroImg = (urlOrPath) => {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  if (urlOrPath.startsWith('http') || urlOrPath.startsWith('data:')) return urlOrPath;
  return `/api/image?path=${encodeURIComponent(urlOrPath)}`;
};

export const getAnimeFolderCover = (a) => {
  if (!a) return '';
  let cover = '';
  if (a.thumbnailBase64) {
    cover = (a.thumbnailBase64.startsWith('http') || a.thumbnailBase64.startsWith('data:'))
      ? a.thumbnailBase64
      : `/api/image?path=${encodeURIComponent(a.thumbnailBase64)}`;
  } else if (a.thumbnailPath) {
    cover = `/api/image?path=${encodeURIComponent(a.thumbnailPath)}`;
  } else {
    cover = a.coverImage || a.coverUrl || a.image || '';
  }
  return toFanartBigPreview(cover);
};

export const getMangaFolderCover = (m) => {
  if (!m) return '';
  let cover = '';
  if (m.thumbnailBase64) {
    cover = (m.thumbnailBase64.startsWith('http') || m.thumbnailBase64.startsWith('data:'))
      ? m.thumbnailBase64
      : `/api/image?path=${encodeURIComponent(m.thumbnailBase64)}`;
  } else if (m.thumbnailPath) {
    cover = `/api/image?path=${encodeURIComponent(m.thumbnailPath)}`;
  } else {
    cover = m.coverUrl || m.banner || m.image || '';
  }
  return toFanartBigPreview(cover);
};

export const GENRES_LIST = [
  "All", "Action", "Adventure", "Comedy", "Crime", "Demons", "Detective", "Drama",
  "Ecchi", "Fantasy", "Game", "Harem", "Historical", "Horror", "Isekai", "Josei",
  "Magic", "Martial Arts", "Mecha", "Military", "Music", "Mystery", "Mythology",
  "Parody", "Police", "Post-Apocalyptic", "Psychological", "Reincarnation", "Reverse Harem",
  "Romance", "Samurai", "School", "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life",
  "Space", "Sports", "Super Power", "Supernatural", "Suspense", "Survival", "Thriller",
  "Time Travel", "Vampires"
];

export const getHeroSlides = (animesList = [], mangasList = [], audioStoriesList = [], moviesList = [], webseriesList = []) => {
  const formattedAnimes = (animesList || []).map(anime => {
    let genres = [];
    if (Array.isArray(anime.genres)) {
      genres = [...anime.genres];
    } else if (typeof anime.genres === 'string' && anime.genres.trim()) {
      genres = anime.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');

    const totalSeasons = anime.totalSeasons ? Number(anime.totalSeasons) : 1;
    const totalEpisodes = anime.totalEpisodes ? Number(anime.totalEpisodes) : (anime.episodeCount || 0);
    const scannedCount = anime.episodeCount || 0;
    let epDisplay = `${totalEpisodes} EP`;
    if (scannedCount > 0 && scannedCount !== totalEpisodes) {
      epDisplay = `${scannedCount}/${totalEpisodes} EP`;
    }
    const pct = getAnimeProgressPercent(anime);

    const animePoster = anime.posterUrl || anime.coverUrl || anime.coverImage || resolveHeroImg(anime.thumbnailBase64) || resolveHeroImg(anime.thumbnailPath) || null;
    const animeBanner = anime.bannerUrl || anime.backdropUrl || animePoster || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop';

    return {
      id: anime.id,
      mediaType: 'anime',
      isManga: false,
      isAudio: false,
      isMovie: false,
      isWebseries: false,
      title: (anime?.title || 'UNTITLED ANIME').toString().toUpperCase(),
      japaneseTitle: anime.japaneseTitle || 'LOCAL LIBRARY',
      logoUrl: anime.logoUrl || null,
      poster: animePoster,
      banner: animeBanner,
      rating: getDeterministicRating(anime.id, anime.rating),
      episodes: epDisplay,
      totalSeasons: totalSeasons,
      totalEpisodes: totalEpisodes,
      year: anime.year || new Date(anime.createdAt || Date.now()).getFullYear().toString(),
      quality: anime.quality || '1080p HD',
      language: anime.language || 'SUB / DUB',
      studio: anime.studio || 'Tracked Folder',
      genres: validGenres.length > 0 ? validGenres : ['Anime'],
      description: anime.description || `Local tracked anime folder from path: ${anime.folderPath || ''}`,
      progressPercent: pct,
      inProgress: pct > 0 && pct < 100,
      lastActivity: new Date(anime.lastOpenedAt || anime.updatedAt || anime.createdAt || 0).getTime(),
      createdAt: new Date(anime.createdAt || anime.addedAt || 0).getTime(),
    };
  });

  const formattedMangas = (mangasList || []).map(manga => {
    let genres = [];
    if (Array.isArray(manga.genres)) {
      genres = [...manga.genres];
    } else if (typeof manga.genres === 'string' && manga.genres.trim()) {
      genres = manga.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');

    const totalChapters = manga.totalChapters ? Number(manga.totalChapters) : (manga.chapterCount || 0);
    const completedChapters = manga.completedChapters || 0;
    let chDisplay = `${totalChapters} Chapters`;
    if (completedChapters > 0 && completedChapters !== totalChapters) {
      chDisplay = `${completedChapters}/${totalChapters} Ch.`;
    }
    const pct = Number(manga.progressPercent || 0);
    const inProgress = (pct > 0 && pct < 100) || manga.status === 'reading' || (completedChapters > 0 && !manga.isWatched);

    const mangaPoster = manga.posterUrl || manga.coverUrl || resolveHeroImg(manga.thumbnailBase64) || resolveHeroImg(manga.thumbnailPath) || null;
    const mangaBanner = manga.bannerUrl || manga.backdropUrl || mangaPoster || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=1600&auto=format&fit=crop';

    return {
      id: manga.id,
      mediaType: 'manga',
      isManga: true,
      isAudio: false,
      isMovie: false,
      isWebseries: false,
      title: (manga?.title || 'UNTITLED MANGA').toString().toUpperCase(),
      japaneseTitle: manga.japaneseTitle || 'LOCAL MANGA',
      logoUrl: manga.logoUrl || null,
      poster: mangaPoster,
      banner: mangaBanner,
      rating: getDeterministicRating(manga.id, manga.rating),
      episodes: chDisplay,
      totalSeasons: 0,
      totalEpisodes: totalChapters,
      year: manga.year || new Date(manga.createdAt || Date.now()).getFullYear().toString(),
      quality: 'Digital Manga',
      language: 'Reader PDF',
      studio: 'Manga Library',
      genres: validGenres.length > 0 ? validGenres : ['Manga', 'Comics'],
      description: manga.description || `Local tracked manga directory from path: ${manga.folderPath || ''}`,
      progressPercent: pct,
      inProgress,
      lastActivity: new Date(manga.lastOpenedAt || manga.updatedAt || manga.createdAt || 0).getTime(),
      createdAt: new Date(manga.createdAt || manga.addedAt || 0).getTime(),
    };
  });

  const formattedAudioStories = (audioStoriesList || []).map(story => {
    let genres = [];
    if (Array.isArray(story.genres)) {
      genres = [...story.genres];
    } else if (typeof story.genres === 'string' && story.genres.trim()) {
      genres = story.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');
    const totalTracks = story.totalTracks || story.trackCount || 0;
    const completedTracks = story.completedTracks || 0;
    const trackDisplay = completedTracks > 0
      ? `${completedTracks}/${totalTracks} Tracks`
      : `${totalTracks} Tracks`;
    const pct = Number(story.progressPercent || 0);
    const inProgress = (pct > 0 && pct < 100) || story.status === 'listening' || completedTracks > 0;

    return {
      id: story.id,
      mediaType: 'audioStory',
      isManga: false,
      isAudio: true,
      isMovie: false,
      isWebseries: false,
      title: (story?.title || 'UNTITLED AUDIO STORY').toString().toUpperCase(),
      japaneseTitle: story.japaneseTitle || 'LOCAL AUDIO STORY',
      logoUrl: story.logoUrl || null,
      banner: story.bannerUrl || story.backdropUrl || story.thumbnailBase64 || (story.thumbnailPath ? `/api/image?path=${encodeURIComponent(story.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1600&auto=format&fit=crop',
      rating: getDeterministicRating(story.id, story.rating),
      episodes: trackDisplay,
      totalSeasons: 0,
      totalEpisodes: totalTracks,
      year: story.year || new Date(story.createdAt || Date.now()).getFullYear().toString(),
      quality: 'Audio Story',
      language: 'Local Audio',
      studio: story.studio || 'Audio Library',
      genres: validGenres.length > 0 ? validGenres : ['Audio Story'],
      description: story.description || story.synopsis || `Local tracked audio story from path: ${story.folderPath || ''}`,
      progressPercent: pct,
      inProgress,
      lastActivity: new Date(story.lastOpenedAt || story.updatedAt || story.createdAt || 0).getTime(),
    };
  });

  const formattedMovies = (moviesList || []).map(movie => {
    let genres = [];
    if (Array.isArray(movie.genres)) {
      genres = [...movie.genres];
    } else if (typeof movie.genres === 'string' && movie.genres.trim()) {
      genres = movie.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');
    const pct = Number(movie.watchProgress || 0);
    const inProgress = (pct > 0 && pct < 95) || movie.watchStatus === 'Watching';
    const runtimeStr = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : 'Feature Film';

    const moviePoster = movie.posterUrl || movie.posterPath || resolveHeroImg(movie.thumbnailBase64) || null;
    const movieBanner = movie.backdropUrl || movie.posterUrl || moviePoster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1600&auto=format&fit=crop';

    return {
      id: movie.id,
      mediaType: 'movie',
      isManga: false,
      isAudio: false,
      isMovie: true,
      isWebseries: false,
      title: (movie?.title || 'UNTITLED MOVIE').toString().toUpperCase(),
      logoUrl: movie.logoUrl || null,
      poster: moviePoster,
      banner: movieBanner,
      rating: movie.rating ? parseFloat(movie.rating).toFixed(1) : getDeterministicRating(movie.id, 8.5),
      episodes: runtimeStr,
      totalSeasons: 0,
      totalEpisodes: 1,
      year: movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : '2026'),
      quality: '4K Ultra HD',
      language: (movie.language || 'English').toUpperCase(),
      studio: (movie.productionCountries && movie.productionCountries[0]) || 'Cinema',
      genres: validGenres.length > 0 ? validGenres : ['Movie'],
      description: movie.overview || `Local tracked movie file: ${movie.localFileName || ''}`,
      progressPercent: pct,
      inProgress,
      lastActivity: new Date(movie.lastWatchedAt || movie.lastOpenedAt || movie.updatedAt || movie.addedAt || 0).getTime(),
      createdAt: new Date(movie.addedAt || movie.createdAt || 0).getTime(),
    };
  });

  const formattedWebseries = (webseriesList || []).map(series => {
    let genres = [];
    if (Array.isArray(series.genres)) {
      genres = [...series.genres];
    } else if (typeof series.genres === 'string' && series.genres.trim()) {
      genres = series.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');

    const totalSeasons = series.totalSeasons ? Number(series.totalSeasons) : (Array.isArray(series.seasons) ? series.seasons.length : 1);
    const totalEpisodes = series.totalEpisodes ? Number(series.totalEpisodes) : (series.episodeCount || 0);
    const scannedCount = series.episodeCount || (Array.isArray(series.episodes) ? series.episodes.length : 0);
    let epDisplay = totalEpisodes > 0 ? `${totalEpisodes} EP` : (scannedCount > 0 ? `${scannedCount} EP` : 'TV Series');
    if (scannedCount > 0 && totalEpisodes > 0 && scannedCount !== totalEpisodes) {
      epDisplay = `${scannedCount}/${totalEpisodes} EP`;
    }

    const pct = Number(series.progressPercent || 0);
    const isCompleted = Boolean(series.watched || series.isWatched || series.watchStatus === 'Completed' || pct >= 100);
    const inProgress = !isCompleted && (
      (pct > 0 && pct < 100) ||
      series.watchStatus === 'Watching' ||
      Boolean(series.lastWatchedAt) ||
      Boolean(series.lastWatchedEpisode)
    );

    const seriesPoster = series.posterUrl || series.coverUrl || series.posterPath || resolveHeroImg(series.thumbnailBase64) || resolveHeroImg(series.thumbnailPath) || null;
    const seriesBanner = series.backdropUrl || series.bannerUrl || seriesPoster || 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?q=80&w=1600&auto=format&fit=crop';

    return {
      id: series.id,
      mediaType: 'webseries',
      isManga: false,
      isAudio: false,
      isMovie: false,
      isWebseries: true,
      title: (series?.title || 'UNTITLED SERIES').toString().toUpperCase(),
      japaneseTitle: series.originalTitle || series.title || 'WEB SERIES',
      logoUrl: series.logoUrl || null,
      poster: seriesPoster,
      banner: seriesBanner,
      rating: series.rating ? parseFloat(series.rating).toFixed(1) : getDeterministicRating(series.id, 8.8),
      episodes: epDisplay,
      totalSeasons: totalSeasons,
      totalEpisodes: totalEpisodes || scannedCount,
      year: series.year || (series.releaseDate ? series.releaseDate.split('-')[0] : '2026'),
      quality: '4K Ultra HD',
      language: (series.language || 'English').toUpperCase(),
      studio: (series.productionCountries && series.productionCountries[0]) || 'Web Series',
      genres: validGenres.length > 0 ? validGenres : ['Web Series', 'Drama'],
      description: series.overview || series.description || `Local tracked web series: ${series.folderPath || ''}`,
      progressPercent: pct,
      inProgress,
      lastActivity: new Date(series.lastWatchedAt || series.lastOpenedAt || series.updatedAt || series.addedAt || series.createdAt || 0).getTime(),
      createdAt: new Date(series.addedAt || series.createdAt || 0).getTime(),
    };
  });

  if (formattedAnimes.length === 0 && formattedMangas.length === 0 && formattedMovies.length === 0 && formattedWebseries.length === 0) {
    return [{
      id: 'placeholder',
      mediaType: 'anime',
      isManga: false,
      isAudio: false,
      isMovie: false,
      isWebseries: false,
      title: 'WELCOME TO WATCHANIME',
      japaneseTitle: 'トラッカーへようこそ',
      banner: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
      rating: '10.0',
      episodes: '0 / 0',
      year: '2026',
      quality: '4K Ultra HD',
      language: 'LOCAL',
      studio: 'Antigravity',
      genres: ['Library', 'Media', 'System'],
      description: 'Your premium personal anime, manga & movies tracking workspace. Add your local media folders and files to get started!'
    }];
  }

  // Group watching or reading (in-progress) and recently added items (up to 12 total, maximum 6-6 division, excluding audio stories from hero banner slider)
  const allItems = [...formattedAnimes, ...formattedMangas, ...formattedMovies, ...formattedWebseries];

  const MAX_TOTAL = 12;
  const MAX_DIVISION = 6;

  // 1. Watching / reading items (inProgress) sorted by latest activity
  const watchingOrReading = allItems
    .filter(item => item.inProgress)
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  const selectedWatching = watchingOrReading.slice(0, MAX_DIVISION);

  // 2. Recently added items (not already in selectedWatching) sorted by creation/added date
  const candidatesAdded = allItems
    .filter(item => !selectedWatching.some(w => w.id === item.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const selectedAdded = candidatesAdded.slice(0, MAX_DIVISION);

  let combined = [...selectedWatching, ...selectedAdded];

  // 3. If combined is under 12, backfill remaining slots up to 12 from other available items
  if (combined.length < MAX_TOTAL) {
    const remaining = allItems
      .filter(item => !combined.some(c => c.id === item.id))
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0) || parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
    combined = [...combined, ...remaining.slice(0, MAX_TOTAL - combined.length)];
  }

  return combined.slice(0, MAX_TOTAL);
};
