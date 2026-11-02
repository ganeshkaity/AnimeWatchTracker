/**
 * Age Rating Utilities for Indian standard certifications (CBFC / Indian Streaming)
 * Standard ratings: U, U/A 7+, U/A 13+, U/A 16+, A, S
 */

export function normalizeIndianRating(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim().toUpperCase().replace(/\s+/g, ' ');

  // Exact standard Indian classifications
  if (clean === 'U') return 'U';
  if (['UA', 'U/A'].includes(clean)) return 'U/A';
  if (['UA 7+', 'U/A 7+', 'UA7+', 'U/A7+', '7+'].includes(clean)) return 'U/A 7+';
  if (['UA 13+', 'U/A 13+', 'UA13+', 'U/A13+', '13+'].includes(clean)) return 'U/A 13+';
  if (['UA 16+', 'U/A 16+', 'UA16+', 'U/A16+', '16+'].includes(clean)) return 'U/A 16+';
  if (clean === 'A' || clean === '18+') return 'A';
  if (clean === 'S') return 'S';

  // Substring detection for variations like "U/A 16+", "CBFC UA 13+"
  if (clean.includes('16')) return 'U/A 16+';
  if (clean.includes('13')) return 'U/A 13+';
  if (clean.includes('7')) return 'U/A 7+';
  if (clean.includes('UA') || clean.includes('U/A')) return 'U/A';
  if (clean === 'R' || clean.includes('ADULT')) return 'A';

  return clean;
}

export function mapUsToIndianRating(usRating) {
  if (!usRating || typeof usRating !== 'string') return null;
  const clean = usRating.trim().toUpperCase();

  if (['G', 'TV-Y', 'TV-G'].includes(clean)) return 'U';
  if (['PG', 'TV-Y7', 'TV-PG'].includes(clean)) return 'U/A 7+';
  if (['PG-13', 'TV-14'].includes(clean)) return 'U/A 13+';
  if (['R', 'NC-17', 'TV-MA'].includes(clean)) return 'A';

  return null;
}

export function extractIndianAgeRating(tmdbData, isMovie = true) {
  if (!tmdbData) return null;

  // 1. Check Indian certification in release_dates (Movies / TV)
  if (tmdbData.release_dates?.results) {
    const inEntry = tmdbData.release_dates.results.find((r) => r.iso_3166_1 === 'IN');
    if (inEntry?.release_dates?.length) {
      for (const rd of inEntry.release_dates) {
        if (rd.certification && rd.certification.trim()) {
          const norm = normalizeIndianRating(rd.certification);
          if (norm) return norm;
        }
      }
    }
  }

  // 2. Check Indian rating in content_ratings (TV / Anime / Webseries)
  if (tmdbData.content_ratings?.results) {
    const inEntry = tmdbData.content_ratings.results.find((r) => r.iso_3166_1 === 'IN');
    if (inEntry?.rating && inEntry.rating.trim()) {
      const norm = normalizeIndianRating(inEntry.rating);
      if (norm) return norm;
    }
  }

  // 3. Fallback: Check US rating in release_dates or content_ratings
  if (tmdbData.release_dates?.results) {
    const usEntry = tmdbData.release_dates.results.find((r) => r.iso_3166_1 === 'US');
    if (usEntry?.release_dates?.length) {
      for (const rd of usEntry.release_dates) {
        if (rd.certification && rd.certification.trim()) {
          const mapped = mapUsToIndianRating(rd.certification);
          if (mapped) return mapped;
        }
      }
    }
  }

  if (tmdbData.content_ratings?.results) {
    const usEntry = tmdbData.content_ratings.results.find((r) => r.iso_3166_1 === 'US');
    if (usEntry?.rating && usEntry.rating.trim()) {
      const mapped = mapUsToIndianRating(usEntry.rating);
      if (mapped) return mapped;
    }
  }

  return null;
}

