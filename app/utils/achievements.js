import {
  getLocalMovies,
  getLocalAnimes,
  getLocalWebseries,
  getLocalManga,
  getLocalWatchlist,
  getLocalMovieGroups,
} from './localStore';

export const BADGE_DEFINITIONS = [
  {
    id: 'century_movies',
    title: 'Century Club',
    icon: '🎬',
    category: 'Movies',
    rarity: 'Legendary',
    description: 'Add 100 movies to your personal library',
    target: 100,
    check: (data) => data.movies.length,
  },
  {
    id: 'film_connoisseur',
    title: 'Film Connoisseur',
    icon: '🍿',
    category: 'Movies',
    rarity: 'Epic',
    description: 'Watch and complete 25 movies',
    target: 25,
    check: (data) => data.movies.filter((m) => m.watched || m.completed || m.watchStatus === 'Completed' || (m.watchProgress && m.watchProgress >= 95)).length,
  },
  {
    id: 'otaku_master',
    title: 'Otaku Master',
    icon: '🗾',
    category: 'Anime',
    rarity: 'Legendary',
    description: 'Track 50 anime series in your collection',
    target: 50,
    check: (data) => data.animes.length,
  },
  {
    id: 'shonen_warrior',
    title: 'Shonen Warrior',
    icon: '⚔️',
    category: 'Anime',
    rarity: 'Rare',
    description: 'Add 10 Action anime to your catalog',
    target: 10,
    check: (data) => data.animes.filter((a) => {
      const g = Array.isArray(a.genres) ? a.genres : (typeof a.genres === 'string' ? a.genres.split(',') : []);
      return g.some((genre) => typeof genre === 'string' && genre.toLowerCase().includes('action'));
    }).length,
  },
  {
    id: 'manga_scholar',
    title: 'Manga Scholar',
    icon: '📚',
    category: 'Manga',
    rarity: 'Rare',
    description: 'Read & track 15 manga or webtoon series',
    target: 15,
    check: (data) => data.mangas.length,
  },
  {
    id: 'binge_legend',
    title: 'Binge Legend',
    icon: '📺',
    category: 'Series',
    rarity: 'Epic',
    description: 'Track 10 web-series across seasons',
    target: 10,
    check: (data) => data.webseries.length,
  },
  {
    id: 'grand_archivist',
    title: 'Grand Archivist',
    icon: '👑',
    category: 'Collector',
    rarity: 'Mythic',
    description: 'Amass 100 total titles across all categories',
    target: 100,
    check: (data) => data.movies.length + data.animes.length + data.webseries.length + data.mangas.length,
  },
  {
    id: 'curator',
    title: 'Franchise Curator',
    icon: '🗂️',
    category: 'Organization',
    rarity: 'Uncommon',
    description: 'Create 2 or more custom Movie Groups',
    target: 2,
    check: (data) => data.movieGroups.length,
  },
  {
    id: 'watchlist_hoarder',
    title: 'Watchlist Curator',
    icon: '📌',
    category: 'Watchlist',
    rarity: 'Rare',
    description: 'Save 20 titles to your Plan to Watch list',
    target: 20,
    check: (data) => data.watchlist.length,
  },
  {
    id: 'star_reviewer',
    title: 'Master Critic',
    icon: '⭐',
    category: 'Rating',
    rarity: 'Rare',
    description: 'Rate 15 or more movies, anime, or series',
    target: 15,
    check: (data) => {
      const all = [...data.movies, ...data.animes, ...data.webseries, ...data.watchlist];
      return all.filter((it) => (Number(it.rating) || Number(it.score) || 0) > 0).length;
    },
  },
  {
    id: 'completionist',
    title: '100% Completionist',
    icon: '🏆',
    category: 'Progress',
    rarity: 'Epic',
    description: 'Complete 15 titles at 100% progress',
    target: 15,
    check: (data) => {
      const watchedM = data.movies.filter((m) => m.watched || m.completed || (m.watchProgress && m.watchProgress >= 95)).length;
      const watchedA = data.animes.filter((a) => a.watched || a.completed || (a.progressPercent && a.progressPercent >= 100)).length;
      const watchedW = data.webseries.filter((w) => w.watched || w.isWatched || (w.progressPercent && w.progressPercent >= 100)).length;
      return watchedM + watchedA + watchedW;
    },
  },
  {
    id: 'midnight_binger',
    title: 'Night Owl Binger',
    icon: '🌙',
    category: 'Special',
    rarity: 'Special',
    description: 'Active late night in the quiet hours (12 AM - 5 AM)',
    target: 1,
    check: () => {
      const hr = new Date().getHours();
      return (hr >= 0 && hr < 5) ? 1 : 0;
    },
  },
];

export function calculateAchievements() {
  let movies = [];
  let animes = [];
  let webseries = [];
  let mangas = [];
  let watchlist = [];
  let movieGroups = [];

  if (typeof window !== 'undefined') {
    movies = getLocalMovies() || [];
    animes = getLocalAnimes() || [];
    webseries = getLocalWebseries() || [];
    mangas = getLocalManga() || [];
    watchlist = getLocalWatchlist() || [];
    movieGroups = getLocalMovieGroups() || [];
  }

  const data = { movies, animes, webseries, mangas, watchlist, movieGroups };

  let unlockedCount = 0;
  const badges = BADGE_DEFINITIONS.map((b) => {
    const current = Math.max(0, b.check(data) || 0);
    const unlocked = current >= b.target;
    if (unlocked) unlockedCount++;
    const progressPercent = Math.min(100, Math.round((current / b.target) * 100));

    return {
      ...b,
      current,
      unlocked,
      progressPercent,
    };
  });

  // Calculate Rank / Tier
  let rank = 'Novice Collector';
  let rankLevel = 1;
  let nextRankTarget = 3;

  if (unlockedCount >= 10) {
    rank = 'Legendary Otaku';
    rankLevel = 5;
    nextRankTarget = BADGE_DEFINITIONS.length;
  } else if (unlockedCount >= 7) {
    rank = 'Grand Cinephile';
    rankLevel = 4;
    nextRankTarget = 10;
  } else if (unlockedCount >= 4) {
    rank = 'Seasoned Watcher';
    rankLevel = 3;
    nextRankTarget = 7;
  } else if (unlockedCount >= 2) {
    rank = 'Dedicated Explorer';
    rankLevel = 2;
    nextRankTarget = 4;
  }

  return {
    badges,
    totalBadges: BADGE_DEFINITIONS.length,
    unlockedCount,
    lockedCount: BADGE_DEFINITIONS.length - unlockedCount,
    rank,
    rankLevel,
    nextRankTarget,
  };
}

