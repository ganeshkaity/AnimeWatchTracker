/**
 * Centralized Rating Utility
 * 
 * Determines effective rating with strict priority:
 * 1. User manual rating (manually rated by user: userRating, customRating, manualRating, userCustomRating, or isManualRating === true)
 * 2. IMDb rating (imdbRating, omdb.imdbRating)
 * 3. TMDB rating / malRating / fallback (rating, tmdbRating, score, vote_average)
 */

export function getEffectiveRating(item) {
  if (!item) return null;

  // 1. Manually rated by user
  const manual = item.userRating ?? item.customRating ?? item.manualRating ?? item.userCustomRating;
  if (manual !== undefined && manual !== null && manual !== '' && !isNaN(Number(manual)) && Number(manual) > 0) {
    const num = Number(manual);
    return {
      value: num % 1 === 0 ? num.toFixed(1) : num.toFixed(1),
      numeric: num,
      source: 'manual',
      label: 'USER'
    };
  }

  if (item.isManualRating && item.rating && !isNaN(Number(item.rating)) && Number(item.rating) > 0) {
    const num = Number(item.rating);
    return {
      value: num.toFixed(1),
      numeric: num,
      source: 'manual',
      label: 'USER'
    };
  }

  // 2. IMDb rating (if available)
  const rawImdb = item.imdbRating || item.omdb?.imdbRating;
  if (rawImdb && rawImdb !== 'N/A' && !isNaN(Number(rawImdb)) && Number(rawImdb) > 0) {
    const num = Number(rawImdb);
    return {
      value: num.toFixed(1),
      numeric: num,
      source: 'imdb',
      label: 'IMDb'
    };
  }

  // 3. Fallback: TMDB / MAL / Default rating
  const fallback = item.rating ?? item.tmdbRating ?? item.score ?? item.vote_average ?? item.malRating;
  if (fallback && fallback !== 'N/A' && !isNaN(Number(fallback)) && Number(fallback) > 0) {
    const num = Number(fallback);
    return {
      value: num.toFixed(1),
      numeric: num,
      source: 'tmdb',
      label: 'TMDB'
    };
  }

  return null;
}

export function formatDisplayRating(item, fallbackValue = null) {
  if (!item) return fallbackValue ? String(fallbackValue) : null;
  if (typeof item === 'number' || (typeof item === 'string' && !isNaN(Number(item)) && item !== '')) {
    return Number(item).toFixed(1);
  }
  const resolved = getEffectiveRating(item);
  if (resolved) return resolved.value;
  return fallbackValue ? String(fallbackValue) : null;
}

