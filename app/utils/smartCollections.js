export const SMART_COLLECTION_DEFINITIONS = [
  {
    id: 'smart-masterpieces',
    name: 'Top Rated Masterpieces',
    badge: '★ 8.5+',
    icon: 'Star',
    gradient: 'from-amber-500 to-yellow-600',
    description: 'Critically acclaimed movies with 8.5+ rating in your collection',
    filter: (m) => (Number(m.rating) || Number(m.score) || 0) >= 8.5,
  },
  {
    id: 'smart-epics',
    name: 'Epic Features (>2 Hours)',
    badge: '120m+',
    icon: 'Clock',
    gradient: 'from-purple-600 to-indigo-700',
    description: 'Immersive cinematic experiences with 2+ hours runtime',
    filter: (m) => (Number(m.runtime) || 0) >= 120,
  },
  {
    id: 'smart-quick-bites',
    name: 'Quick Watches (<90 Mins)',
    badge: 'Under 90m',
    icon: 'Zap',
    gradient: 'from-cyan-500 to-blue-600',
    description: 'Short features and movies under 90 minutes',
    filter: (m) => (Number(m.runtime) || 0) > 0 && (Number(m.runtime) || 0) <= 90,
  },
  {
    id: 'smart-completed',
    name: 'Hall of Fame (Completed)',
    badge: '100% Watched',
    icon: 'CheckCircle2',
    gradient: 'from-emerald-500 to-teal-700',
    description: 'Every movie you have fully watched and completed',
    filter: (m) => Boolean(m.watched || m.completed || m.watchStatus === 'Completed' || (m.watchProgress && m.watchProgress >= 95)),
  },
  {
    id: 'smart-in-progress',
    name: 'In-Progress Queue',
    badge: 'Continue',
    icon: 'Play',
    gradient: 'from-orange-500 to-rose-600',
    description: 'Movies currently in-progress ready to be resumed',
    filter: (m) => Boolean((m.watchProgress && m.watchProgress > 0 && m.watchProgress < 95) || (m.currentTime && m.currentTime > 60 && (!m.duration || m.currentTime < m.duration * 0.95))),
  },
  {
    id: 'smart-classics',
    name: 'Classic Gems (Pre-2015)',
    badge: 'Pre-2015',
    icon: 'Film',
    gradient: 'from-rose-500 to-pink-600',
    description: 'Beloved films released before 2015 in your vault',
    filter: (m) => {
      const yr = Number(m.year) || (m.releaseDate ? Number(m.releaseDate.split('-')[0]) : 0);
      return yr > 0 && yr < 2015;
    },
  },
];

/**
 * Resolve smart collections with matching items from a list of movies
 */
export function getResolvedSmartCollections(movies = []) {
  return SMART_COLLECTION_DEFINITIONS.map((def) => {
    const matched = (movies || []).filter(def.filter);
    return {
      ...def,
      items: matched,
      count: matched.length,
      isSmartCollection: true,
    };
  }).filter((col) => col.items.length > 0);
}

