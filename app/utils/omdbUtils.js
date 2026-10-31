/**
 * omdbUtils.js — Helper utilities for cleaning titles and fetching OMDB data
 */

/**
 * Strips special characters (e.g. ':', '_', ';', '-', etc.) and common release tags
 * so OMDB queries match clean content titles.
 * E.g. "bahubali: the conclusion" -> "bahubali the conclusion"
 */
export function cleanTitleForOmdb(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  return rawTitle
    .replace(/\s*\(\d{4}\).*/i, '')
    .replace(/\s*\[.*?\].*/g, '')
    .replace(/\s*-\s*Season\s*\d+.*/i, '')
    .replace(/\s*Season\s*\d+.*/i, '')
    .replace(/[:_;,\-–—/\\|~#@!*?()[\]{}"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch ratings, awards, box office, and rotten tomatoes from OMDB via /api/omdb
 */
export async function fetchOmdbData({ title, year, imdbId, type }) {
  const cleanTitle = cleanTitleForOmdb(title);
  if (!cleanTitle && !imdbId) {
    return { success: false, error: 'Title or IMDb ID required' };
  }

  const params = new URLSearchParams();
  if (cleanTitle) params.set('title', cleanTitle);
  if (year) params.set('year', String(year).trim());
  if (imdbId) params.set('imdbId', String(imdbId).trim());
  if (type) params.set('type', String(type).trim());

  try {
    const res = await fetch(`/api/omdb?${params.toString()}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[fetchOmdbData] Network error:', err);
    return { success: false, error: err.message || 'Network error fetching OMDB data' };
  }
}

