import {
  getLocalMovies,
  getLocalAnimes,
  getLocalWebseries,
  getLocalManga,
  getLocalWatchlist
} from './localStore';

/**
 * Clean and normalize a media title for robust comparison
 */
export function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/\(\d{4}\)|\[\d{4}\]/g, '') // remove (2024), [2024]
    .replace(/[^\w\s]/gi, '') // remove punctuation
    .replace(/\s+/g, ' ') // collapse spaces
    .trim();
}

/**
 * Check if a title or tmdbId already exists in the user's library across any category
 * @param {Object} params
 * @param {string} params.title - Title being entered
 * @param {string|number} [params.tmdbId] - TMDB ID if selected
 * @param {string} [params.targetType] - 'anime' | 'movie' | 'webseries' | 'manga' | 'watchlist'
 * @param {Object} [params.customLibraries] - optional pre-loaded arrays { movies, animes, webseries, mangas, watchlist }
 * @returns {{ isDuplicate: boolean, match: Object|null }}
 */
export function checkDuplicateMedia({
  title = '',
  tmdbId = null,
  targetType = null,
  customLibraries = null,
}) {
  const normTitle = normalizeTitle(title);
  if (!normTitle && !tmdbId) {
    return { isDuplicate: false, match: null };
  }

  // Gather libraries
  let movies = customLibraries?.movies;
  let animes = customLibraries?.animes;
  let webseries = customLibraries?.webseries;
  let mangas = customLibraries?.mangas;
  let watchlist = customLibraries?.watchlist;

  if (typeof window !== 'undefined') {
    if (!movies) movies = getLocalMovies() || [];
    if (!animes) animes = getLocalAnimes() || [];
    if (!webseries) webseries = getLocalWebseries() || [];
    if (!mangas) mangas = getLocalManga() || [];
    if (!watchlist) watchlist = getLocalWatchlist() || [];
  } else {
    movies = movies || [];
    animes = animes || [];
    webseries = webseries || [];
    mangas = mangas || [];
    watchlist = watchlist || [];
  }

  const collections = [
    { type: 'Movie', list: movies },
    { type: 'Anime', list: animes },
    { type: 'Web-series', list: webseries },
    { type: 'Manga', list: mangas },
    { type: 'Watchlist', list: watchlist },
  ];

  for (const col of collections) {
    for (const item of col.list) {
      if (!item) continue;

      // 1. Check exact TMDB ID match
      if (tmdbId && item.tmdbId && String(tmdbId) === String(item.tmdbId)) {
        return {
          isDuplicate: true,
          match: {
            id: item.id,
            title: item.title || item.name || 'Untitled',
            type: col.type,
            status: item.status || (item.completed ? 'Completed' : (item.watchStatus || 'In Library')),
            posterUrl: item.posterUrl || item.posterPath || item.coverUrl || item.thumbnailBase64 || null,
            year: item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : ''),
          },
        };
      }

      // 2. Check normalized title
      const itemNorm = normalizeTitle(item.title || item.name || item.originalTitle || '');
      if (!itemNorm) continue;

      if (normTitle === itemNorm) {
        return {
          isDuplicate: true,
          match: {
            id: item.id,
            title: item.title || item.name || 'Untitled',
            type: col.type,
            status: item.status || (item.completed ? 'Completed' : (item.watchStatus || 'In Library')),
            posterUrl: item.posterUrl || item.posterPath || item.coverUrl || item.thumbnailBase64 || null,
            year: item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : ''),
          },
        };
      }

      // 3. Close subtitle / alternative title match if length is significant
      if (normTitle.length >= 6 && itemNorm.length >= 6) {
        if (normTitle === itemNorm || (normTitle.length === itemNorm.length && (normTitle.includes(itemNorm) || itemNorm.includes(normTitle)))) {
          return {
            isDuplicate: true,
            match: {
              id: item.id,
              title: item.title || item.name || 'Untitled',
              type: col.type,
              status: item.status || (item.completed ? 'Completed' : (item.watchStatus || 'In Library')),
              posterUrl: item.posterUrl || item.posterPath || item.coverUrl || item.thumbnailBase64 || null,
              year: item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : ''),
            },
          };
        }
      }
    }
  }

  return { isDuplicate: false, match: null };
}

