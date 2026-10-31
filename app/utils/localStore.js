/**
 * localStore.js — All localStorage I/O for offline support
 * Keys used:
 *   watchanime_user_id        — the anonymous userId (UUID)
 *   watchanime_settings       — { vlcPath, defaultPlayer }
 *   watchanime_animes         — JSON array of anime objects
 *   watchanime_episodes_{id}  — JSON array of episode objects for that animeId
 *   watchanime_notes          — JSON array of note objects
 *   watchanime_dirty_queue    — JSON array of pending write ops
 */

const KEYS = {
  USER_ID: 'watchanime_user_id',
  SETTINGS: 'watchanime_settings',
  ANIMES: 'watchanime_animes',
  EPISODES: (animeId) => `watchanime_episodes_${animeId}`,
  MANGAS: 'watchanime_mangas',
  CHAPTERS: (mangaId) => `watchanime_chapters_${mangaId}`,
  AUDIO_STORIES: 'watchanime_audio_stories',
  AUDIO_TRACKS: (storyId) => `watchanime_audio_tracks_${storyId}`,
  MOVIES: 'watchanime_movies',
  WEBSERIES: 'watchanime_webseries',
  WEBSERIES_EPISODES: (seriesId) => `watchanime_webseries_episodes_${seriesId}`,
  WATCHLIST: 'watchanime_watchlist',
  MOVIE_GROUPS: 'watchanime_movie_groups',
  VAULT_PIN: 'watchanime_vault_pin',
  VAULT_ITEMS: 'watchanime_vault_items',
  NOTES: 'watchanime_notes',
  DIRTY_QUEUE: 'watchanime_dirty_queue',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function read(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function sanitizeItemForStorage(item, isAggressive = false) {
  if (!item || typeof item !== 'object') return item;
  const copy = { ...item };

  // Drop large data URI base64 strings if a remote URL exists, to stay well below localStorage limits
  for (const k of Object.keys(copy)) {
    if (typeof copy[k] === 'string' && copy[k].startsWith('data:')) {
      if (copy[k].length > 1000 && (copy.posterUrl || copy.posterPath || copy.coverUrl || copy.backdropUrl || copy.thumbnailPath)) {
        delete copy[k];
      } else if (copy[k].length > 50000 || isAggressive) {
        delete copy[k];
      }
    }
  }

  // Compress seasons array for watchlist items in localStorage so thousands of episodes don't blow up quota
  if (Array.isArray(copy.seasons)) {
    if (isAggressive) {
      delete copy.seasons;
    } else {
      copy.seasons = copy.seasons.map(s => ({
        id: s.id,
        name: s.name,
        seasonNumber: s.seasonNumber,
        episodeCount: s.episodes?.length || s.episodeCount || 0,
        airDate: s.airDate,
        posterUrl: s.posterUrl,
      }));
    }
  }

  // Limit cast array in localStorage summary
  if (Array.isArray(copy.cast)) {
    if (isAggressive) {
      delete copy.cast;
    } else if (copy.cast.length > 8) {
      copy.cast = copy.cast.slice(0, 8).map(c => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profileUrl: c.profileUrl || c.profile_path,
      }));
    }
  }

  // Limit images gallery array in localStorage summary
  if (copy.images && typeof copy.images === 'object') {
    if (isAggressive) {
      delete copy.images;
    } else {
      copy.images = {
        backdrops: Array.isArray(copy.images.backdrops) ? copy.images.backdrops.slice(0, 3) : [],
        posters: Array.isArray(copy.images.posters) ? copy.images.posters.slice(0, 3) : [],
        logos: Array.isArray(copy.images.logos) ? copy.images.logos.slice(0, 2) : [],
        artworks: Array.isArray(copy.images.artworks) ? copy.images.artworks.slice(0, 2) : [],
      };
    }
  }

  // Drop large video trailers list in summary
  if (Array.isArray(copy.videos) && (isAggressive || copy.videos.length > 3)) {
    copy.videos = copy.videos.slice(0, 2);
  }

  if (isAggressive && copy.overview && copy.overview.length > 300) {
    copy.overview = copy.overview.slice(0, 300) + '...';
  }

  return copy;
}

function sanitizeForStorage(val, isAggressive = false) {
  if (!val) return val;
  if (Array.isArray(val)) {
    return val.map(i => sanitizeItemForStorage(i, isAggressive));
  }
  if (typeof val === 'object') {
    return sanitizeItemForStorage(val, isAggressive);
  }
  return val;
}

function clearTemporaryCaches() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('cached_omdb_') || k.startsWith('cached_top_rated_') || k.startsWith('watchanime_img_cache_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
  } catch (_) {}
}

function write(key, value) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // If quota exceeded, clean disposable caches and retry with sanitization
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.number === -2147024882 || String(e).includes('quota'))) {
      clearTemporaryCaches();
      try {
        const sanitized = sanitizeForStorage(value, false);
        localStorage.setItem(key, JSON.stringify(sanitized));
        return;
      } catch (retryErr) {
        // Retry with aggressive sanitization
        try {
          const aggressive = sanitizeForStorage(value, true);
          localStorage.setItem(key, JSON.stringify(aggressive));
          return;
        } catch (aggErr) {
          // If still failing and value is a long array, save the latest 30 items
          try {
            if (Array.isArray(value) && value.length > 20) {
              const trimmed = sanitizeForStorage(value.slice(0, 30), true);
              localStorage.setItem(key, JSON.stringify(trimmed));
              return;
            }
          } catch (_) {}
          console.warn('localStore quota exceeded, unable to persist key:', key);
          return;
        }
      }
    }
    console.error('localStore write error:', e);
  }
}

// ─── User ID ─────────────────────────────────────────────────────────────────

export function getUserId() {
  return 'myjsqwvDn5bugIr8W8oRiAtjpRJ3';
}

export function setUserId(uid) {
  write(KEYS.USER_ID, uid);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getLocalSettings() {
  return read(KEYS.SETTINGS) || { vlcPath: '', defaultPlayer: 'ask' };
}

export function setLocalSettings(settings) {
  write(KEYS.SETTINGS, settings);
}

// ─── Anime Library ────────────────────────────────────────────────────────────

export function getLocalAnimes() {
  return read(KEYS.ANIMES) || [];
}

export function setLocalAnimes(animes) {
  write(KEYS.ANIMES, animes);
}

export function getLocalAnime(animeId) {
  const animes = getLocalAnimes();
  return animes.find(a => a.id === animeId) || null;
}

export function upsertLocalAnime(anime) {
  const animes = getLocalAnimes();
  const idx = animes.findIndex(a => a.id === anime.id);
  if (idx >= 0) {
    animes[idx] = { ...animes[idx], ...anime };
  } else {
    animes.unshift(anime);
  }
  setLocalAnimes(animes);
}

export function deleteLocalAnime(animeId) {
  const animes = getLocalAnimes().filter(a => a.id !== animeId);
  setLocalAnimes(animes);
  // Also remove episodes
  if (typeof window !== 'undefined') {
    localStorage.removeItem(KEYS.EPISODES(animeId));
  }
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

export function getLocalEpisodes(animeId) {
  return read(KEYS.EPISODES(animeId)) || [];
}

export function setLocalEpisodes(animeId, episodes) {
  write(KEYS.EPISODES(animeId), episodes);
}

export function upsertLocalEpisode(animeId, episode) {
  const episodes = getLocalEpisodes(animeId);
  const idx = episodes.findIndex(e => e.id === episode.id);
  if (idx >= 0) {
    episodes[idx] = { ...episodes[idx], ...episode };
  } else {
    episodes.push(episode);
  }
  setLocalEpisodes(animeId, episodes);
}

export function deleteLocalEpisode(animeId, episodeId) {
  const episodes = getLocalEpisodes(animeId).filter(e => e.id !== episodeId);
  setLocalEpisodes(animeId, episodes);
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export function getLocalNotes() {
  return read(KEYS.NOTES) || [];
}

export function setLocalNotes(notes) {
  write(KEYS.NOTES, notes);
}

export function getLocalNote(noteId) {
  return getLocalNotes().find(n => n.id === noteId) || null;
}

export function upsertLocalNote(note) {
  const notes = getLocalNotes();
  const idx = notes.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    notes[idx] = { ...notes[idx], ...note };
  } else {
    notes.unshift(note);
  }
  setLocalNotes(notes);
}

export function deleteLocalNote(noteId) {
  const notes = getLocalNotes().filter(n => n.id !== noteId);
  setLocalNotes(notes);
}

// ─── Manga Library ────────────────────────────────────────────────────────────

export function getLocalMangas() {
  return read(KEYS.MANGAS) || [];
}

export function setLocalMangas(mangas) {
  write(KEYS.MANGAS, mangas);
}

export function getLocalManga(mangaId) {
  const mangas = getLocalMangas();
  return mangas.find(m => m.id === mangaId) || null;
}

export function upsertLocalManga(manga) {
  const mangas = getLocalMangas();
  const idx = mangas.findIndex(m => m.id === manga.id);
  if (idx >= 0) {
    mangas[idx] = { ...mangas[idx], ...manga };
  } else {
    mangas.unshift(manga);
  }
  setLocalMangas(mangas);
}

export function deleteLocalManga(mangaId) {
  const mangas = getLocalMangas().filter(m => m.id !== mangaId);
  setLocalMangas(mangas);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(KEYS.CHAPTERS(mangaId));
  }
}

// ─── Manga Chapters ───────────────────────────────────────────────────────────

export function getLocalChapters(mangaId) {
  return read(KEYS.CHAPTERS(mangaId)) || [];
}

export function setLocalChapters(mangaId, chapters) {
  write(KEYS.CHAPTERS(mangaId), chapters);
}

export function upsertLocalChapter(mangaId, chapter) {
  const chapters = getLocalChapters(mangaId);
  const idx = chapters.findIndex(c => c.id === chapter.id);
  if (idx >= 0) {
    chapters[idx] = { ...chapters[idx], ...chapter };
  } else {
    chapters.push(chapter);
  }
  setLocalChapters(mangaId, chapters);
}

export function deleteLocalChapter(mangaId, chapterId) {
  const chapters = getLocalChapters(mangaId).filter(c => c.id !== chapterId);
  setLocalChapters(mangaId, chapters);
}

// ─── Audio Stories Library ───────────────────────────────────────────────────

export function getLocalAudioStories() {
  return read(KEYS.AUDIO_STORIES) || [];
}

export function setLocalAudioStories(stories) {
  write(KEYS.AUDIO_STORIES, stories);
}

export function getLocalAudioStory(storyId) {
  const stories = getLocalAudioStories();
  return stories.find(s => s.id === storyId) || null;
}

export function upsertLocalAudioStory(story) {
  const stories = getLocalAudioStories();
  const idx = stories.findIndex(s => s.id === story.id);
  if (idx >= 0) {
    stories[idx] = { ...stories[idx], ...story };
  } else {
    stories.unshift(story);
  }
  setLocalAudioStories(stories);
}

export function deleteLocalAudioStory(storyId) {
  const stories = getLocalAudioStories().filter(s => s.id !== storyId);
  setLocalAudioStories(stories);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(KEYS.AUDIO_TRACKS(storyId));
  }
}

// ─── Audio Story Tracks ───────────────────────────────────────────────────────

export function getLocalAudioTracks(storyId) {
  return read(KEYS.AUDIO_TRACKS(storyId)) || [];
}

export function setLocalAudioTracks(storyId, tracks) {
  write(KEYS.AUDIO_TRACKS(storyId), tracks);
}

export function upsertLocalAudioTrack(storyId, track) {
  const tracks = getLocalAudioTracks(storyId);
  const idx = tracks.findIndex(t => t.id === track.id);
  if (idx >= 0) {
    tracks[idx] = { ...tracks[idx], ...track };
  } else {
    tracks.push(track);
  }
  setLocalAudioTracks(storyId, tracks);
}

export function deleteLocalAudioTrack(storyId, trackId) {
  const tracks = getLocalAudioTracks(storyId).filter(t => t.id !== trackId);
  setLocalAudioTracks(storyId, tracks);
}

// ─── Movies Library ──────────────────────────────────────────────────────────

export function getLocalMovies() {
  return read(KEYS.MOVIES) || [];
}

export function setLocalMovies(movies) {
  write(KEYS.MOVIES, movies);
}

export function getLocalMovie(movieId) {
  const movies = getLocalMovies();
  return movies.find(m => m.id === movieId || String(m.tmdbId) === String(movieId)) || null;
}

export function upsertLocalMovie(movie) {
  const movies = getLocalMovies();
  const idx = movies.findIndex(m => m.id === movie.id || (movie.tmdbId && m.tmdbId === movie.tmdbId));
  if (idx >= 0) {
    movies[idx] = { ...movies[idx], ...movie };
  } else {
    movies.unshift(movie);
  }
  setLocalMovies(movies);
}

export function deleteLocalMovie(movieId) {
  const movies = getLocalMovies().filter(m => m.id !== movieId && String(m.tmdbId) !== String(movieId));
  setLocalMovies(movies);
}

// ─── Webseries Library ────────────────────────────────────────────────────────

export function getLocalWebseries() {
  return read(KEYS.WEBSERIES) || [];
}

export function setLocalWebseries(seriesList) {
  write(KEYS.WEBSERIES, seriesList);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('webseries_store_updated'));
  }
}

export function getLocalWebseriesItem(seriesId) {
  const list = getLocalWebseries();
  return list.find(s => s.id === seriesId || String(s.tmdbId) === String(seriesId)) || null;
}

export function upsertLocalWebseries(series) {
  const list = getLocalWebseries();
  const idx = list.findIndex(s => s.id === series.id || (series.tmdbId && s.tmdbId === series.tmdbId));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...series };
  } else {
    list.unshift(series);
  }
  setLocalWebseries(list);
}

export function deleteLocalWebseries(seriesId) {
  const list = getLocalWebseries().filter(s => s.id !== seriesId && String(s.tmdbId) !== String(seriesId));
  setLocalWebseries(list);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(KEYS.WEBSERIES_EPISODES(seriesId));
  }
}

// ─── Webseries Episodes ───────────────────────────────────────────────────────

export function getLocalWebseriesEpisodes(seriesId) {
  return read(KEYS.WEBSERIES_EPISODES(seriesId)) || [];
}

export function setLocalWebseriesEpisodes(seriesId, episodes) {
  write(KEYS.WEBSERIES_EPISODES(seriesId), episodes);
}

export function upsertLocalWebseriesEpisode(seriesId, episode) {
  const episodes = getLocalWebseriesEpisodes(seriesId);
  const idx = episodes.findIndex(e => e.id === episode.id);
  if (idx >= 0) {
    episodes[idx] = { ...episodes[idx], ...episode };
  } else {
    episodes.push(episode);
  }
  setLocalWebseriesEpisodes(seriesId, episodes);
}

export function deleteLocalWebseriesEpisode(seriesId, episodeId) {
  const episodes = getLocalWebseriesEpisodes(seriesId).filter(e => e.id !== episodeId);
  setLocalWebseriesEpisodes(seriesId, episodes);
}

// ─── Watchlist Library ────────────────────────────────────────────────────────

export function getLocalWatchlist() {
  return read(KEYS.WATCHLIST) || [];
}

export function setLocalWatchlist(items) {
  write(KEYS.WATCHLIST, sanitizeForStorage(items, false));
}

export function getLocalWatchlistItem(id) {
  const items = getLocalWatchlist();
  return items.find(m => m.id === id || m.slug === id || String(m.tmdbId) === String(id) || String(m.anilistId) === String(id)) || null;
}

export function upsertLocalWatchlist(item) {
  const items = getLocalWatchlist();
  const sanitizedItem = sanitizeItemForStorage(item, false);
  const idx = items.findIndex(m => m.id === item.id || (item.tmdbId && m.tmdbId === item.tmdbId && m.contentType === item.contentType));
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...sanitizedItem };
  } else {
    items.unshift(sanitizedItem);
  }
  setLocalWatchlist(items);
}

export function deleteLocalWatchlist(id) {
  const items = getLocalWatchlist().filter(m => m.id !== id && String(m.tmdbId) !== String(id));
  setLocalWatchlist(items);
}

// ─── Movie Groups ─────────────────────────────────────────────────────────────

export function getLocalMovieGroups() {
  return read(KEYS.MOVIE_GROUPS) || [];
}

export function setLocalMovieGroups(groups) {
  write(KEYS.MOVIE_GROUPS, groups);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movie_groups_updated'));
  }
}

export function getLocalMovieGroup(idOrSlug) {
  const groups = getLocalMovieGroups();
  return groups.find(g => g.id === idOrSlug || g.slug === idOrSlug) || null;
}

export function upsertLocalMovieGroup(group) {
  const groups = getLocalMovieGroups();
  const idx = groups.findIndex(g => g.id === group.id || (group.slug && g.slug === group.slug));
  if (idx >= 0) {
    groups[idx] = { ...groups[idx], ...group, updatedAt: new Date().toISOString() };
  } else {
    groups.unshift({ ...group, createdAt: group.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  setLocalMovieGroups(groups);
}

export function deleteLocalMovieGroup(groupId) {
  const groups = getLocalMovieGroups().filter(g => g.id !== groupId && g.slug !== groupId);
  setLocalMovieGroups(groups);
}

// ─── Secret Vault / Hidden Shelf ───────────────────────────────────────────────

export function getVaultPin() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(KEYS.VAULT_PIN) || null;
  } catch {
    return null;
  }
}

export function setVaultPin(pin) {
  if (typeof window === 'undefined') return;
  try {
    if (!pin) {
      localStorage.removeItem(KEYS.VAULT_PIN);
    } else {
      localStorage.setItem(KEYS.VAULT_PIN, String(pin).trim());
    }
    window.dispatchEvent(new CustomEvent('vault_pin_updated'));
  } catch (err) {
    console.error('Failed to set vault pin:', err);
  }
}

export function getVaultItems() {
  return read(KEYS.VAULT_ITEMS) || [];
}

export function setVaultItems(items) {
  write(KEYS.VAULT_ITEMS, items || []);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vault_items_updated'));
  }
}

export function isItemInVault(itemId) {
  if (!itemId) return false;
  const items = getVaultItems();
  return items.some(it => it.id === itemId);
}

export function toggleVaultItem(item) {
  if (!item || !item.id) return false;
  const items = getVaultItems();
  const exists = items.some(it => it.id === item.id);
  let updated;
  if (exists) {
    updated = items.filter(it => it.id !== item.id);
  } else {
    updated = [
      ...items,
      {
        id: item.id,
        mediaType: item.mediaType || item.type || item.contentType || 'movie',
        title: item.title || item.name || 'Untitled',
        posterUrl: item.posterUrl || item.posterPath || item.coverUrl || item.thumbnailBase64 || null,
        rating: item.rating || item.score || null,
        year: item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : ''),
        runtime: item.runtime || null,
        addedAt: new Date().toISOString(),
      }
    ];
  }
  setVaultItems(updated);
  return !exists;
}

// ─── Dirty Queue (pending Firestore writes) ────────────────────────────────────

/**
 * A dirty op looks like:
 * { type: 'SET_ANIME' | 'DELETE_ANIME' | 'SET_EPISODE' | 'DELETE_EPISODE' | 'SET_NOTE' | 'DELETE_NOTE' | 'SET_SETTINGS',
 *   payload: {...}  }
 */
export function getDirtyQueue() {
  return read(KEYS.DIRTY_QUEUE) || [];
}

export function addToDirtyQueue(op) {
  const queue = getDirtyQueue();
  // Deduplicate: replace existing op of same type+id
  const key = op.dedupeKey;
  const filtered = key ? queue.filter(q => q.dedupeKey !== key) : queue;
  filtered.push(op);
  write(KEYS.DIRTY_QUEUE, filtered);
}

export function clearDirtyQueue() {
  write(KEYS.DIRTY_QUEUE, []);
}

export function removeDirtyOp(dedupeKey) {
  const queue = getDirtyQueue().filter(q => q.dedupeKey !== dedupeKey);
  write(KEYS.DIRTY_QUEUE, queue);
}
