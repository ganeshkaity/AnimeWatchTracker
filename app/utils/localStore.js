/**
 * localStore.js — Hybrid storage engine for WatchAnime
 * 
 * 1. Small preferences, settings, user toggles, recently watched & slider progress:
 *    -> localStorage (fast, synchronous, <50KB)
 * 
 * 2. Media records (Anime, Episodes, Movies, Webseries, Watchlist, Mangas, Audio Stories, Notes, Vault, Dirty Queue):
 *    -> IndexedDB (`watchanime_offline_db`) via mediaIndexedDB.js
 *    -> Synchronous in-memory store hydrated on client boot for 0ms reads and 100% backward compatibility
 */

import {
  idbGetAll,
  idbGet,
  idbPut,
  idbPutBatch,
  idbDelete,
  idbClear,
} from './mediaIndexedDB';

// ─── Keys for Small Preferences (localStorage) ──────────────────────────────
const PREF_KEYS = {
  USER_ID: 'watchanime_user_id',
  SETTINGS: 'watchanime_settings',
  VAULT_PIN: 'watchanime_vault_pin',
  RECENTLY_WATCHED: 'watchanime_recently_watched',
  SLIDER_PROGRESS: 'watchanime_slider_progress',
  MANUAL_OFFLINE: 'watchanime_manual_offline',
};

// ─── In-Memory Store for Media Records ──────────────────────────────────────
const memoryStore = {
  animes: [],
  movies: [],
  webseries: [],
  watchlist: [],
  movie_groups: [],
  mangas: [],
  audio_stories: [],
  notes: [],
  vault_items: [],
  dirty_queue: [],
  anime_episodes: new Map(),
  webseries_episodes: new Map(),
  manga_chapters: new Map(),
  audio_tracks: new Map(),
  isHydrated: false,
};

// ─── localStorage Helpers (Small Preferences Only) ──────────────────────────

function readPref(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePref(key, value) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[localStore] Failed to write preference:', key, err);
  }
}

function readLegacy(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Initial In-Memory Seed & Async IndexedDB Hydration ────────────────────

if (typeof window !== 'undefined') {
  // 1. Instant seed from legacy localStorage if present
  try {
    const an = readLegacy('watchanime_animes');
    if (Array.isArray(an)) memoryStore.animes = an;

    const mv = readLegacy('watchanime_movies');
    if (Array.isArray(mv)) memoryStore.movies = mv;

    const ws = readLegacy('watchanime_webseries');
    if (Array.isArray(ws)) memoryStore.webseries = ws;

    const wl = readLegacy('watchanime_watchlist');
    if (Array.isArray(wl)) memoryStore.watchlist = wl;

    const mg = readLegacy('watchanime_movie_groups');
    if (Array.isArray(mg)) memoryStore.movie_groups = mg;

    const ma = readLegacy('watchanime_mangas');
    if (Array.isArray(ma)) memoryStore.mangas = ma;

    const as = readLegacy('watchanime_audio_stories');
    if (Array.isArray(as)) memoryStore.audio_stories = as;

    const nt = readLegacy('watchanime_notes');
    if (Array.isArray(nt)) memoryStore.notes = nt;

    const vt = readLegacy('watchanime_vault_items');
    if (Array.isArray(vt)) memoryStore.vault_items = vt;

    const dq = readLegacy('watchanime_dirty_queue');
    if (Array.isArray(dq)) memoryStore.dirty_queue = dq;
  } catch (_) {}

  // 2. Hydrate from IndexedDB asynchronously & migrate
  hydrateFromIndexedDB();
}

async function hydrateFromIndexedDB() {
  try {
    const [
      animes,
      movies,
      webseries,
      watchlist,
      movieGroups,
      mangas,
      audioStories,
      notes,
      vaultItems,
      dirtyQueue,
      animeEpisodesList,
      wsEpisodesList,
      mangaChaptersList,
      audioTracksList,
    ] = await Promise.all([
      idbGetAll('animes'),
      idbGetAll('movies'),
      idbGetAll('webseries'),
      idbGetAll('watchlist'),
      idbGetAll('movie_groups'),
      idbGetAll('mangas'),
      idbGetAll('audio_stories'),
      idbGetAll('notes'),
      idbGetAll('vault_items'),
      idbGetAll('dirty_queue'),
      idbGetAll('anime_episodes'),
      idbGetAll('webseries_episodes'),
      idbGetAll('manga_chapters'),
      idbGetAll('audio_tracks'),
    ]);

    // Handle Watchlist
    if (watchlist && watchlist.length > 0) {
      memoryStore.watchlist = watchlist;
    } else if (memoryStore.watchlist.length > 0) {
      await idbPutBatch('watchlist', memoryStore.watchlist);
    }

    // Handle Animes
    if (animes && animes.length > 0) {
      memoryStore.animes = animes;
    } else if (memoryStore.animes.length > 0) {
      await idbPutBatch('animes', memoryStore.animes);
    }

    // Handle Movies
    if (movies && movies.length > 0) {
      memoryStore.movies = movies;
    } else if (memoryStore.movies.length > 0) {
      await idbPutBatch('movies', memoryStore.movies);
    }

    // Handle Webseries
    if (webseries && webseries.length > 0) {
      memoryStore.webseries = webseries;
    } else if (memoryStore.webseries.length > 0) {
      await idbPutBatch('webseries', memoryStore.webseries);
    }

    // Handle Movie Groups
    if (movieGroups && movieGroups.length > 0) {
      memoryStore.movie_groups = movieGroups;
    } else if (memoryStore.movie_groups.length > 0) {
      await idbPutBatch('movie_groups', memoryStore.movie_groups);
    }

    // Handle Mangas
    if (mangas && mangas.length > 0) {
      memoryStore.mangas = mangas;
    } else if (memoryStore.mangas.length > 0) {
      await idbPutBatch('mangas', memoryStore.mangas);
    }

    // Handle Audio Stories
    if (audioStories && audioStories.length > 0) {
      memoryStore.audio_stories = audioStories;
    } else if (memoryStore.audio_stories.length > 0) {
      await idbPutBatch('audio_stories', memoryStore.audio_stories);
    }

    // Handle Notes
    if (notes && notes.length > 0) {
      memoryStore.notes = notes;
    } else if (memoryStore.notes.length > 0) {
      await idbPutBatch('notes', memoryStore.notes);
    }

    // Handle Vault Items
    if (vaultItems && vaultItems.length > 0) {
      memoryStore.vault_items = vaultItems;
    } else if (memoryStore.vault_items.length > 0) {
      await idbPutBatch('vault_items', memoryStore.vault_items);
    }

    // Handle Dirty Queue
    if (dirtyQueue && dirtyQueue.length > 0) {
      memoryStore.dirty_queue = dirtyQueue;
    } else if (memoryStore.dirty_queue.length > 0) {
      await idbPutBatch('dirty_queue', memoryStore.dirty_queue);
    }

    // Handle Episodes / Chapters / Tracks
    if (Array.isArray(animeEpisodesList)) {
      animeEpisodesList.forEach(r => {
        if (r && r.id) memoryStore.anime_episodes.set(String(r.id), r.episodes || []);
      });
    }

    if (Array.isArray(wsEpisodesList)) {
      wsEpisodesList.forEach(r => {
        if (r && r.id) memoryStore.webseries_episodes.set(String(r.id), r.episodes || []);
      });
    }

    if (Array.isArray(mangaChaptersList)) {
      mangaChaptersList.forEach(r => {
        if (r && r.id) memoryStore.manga_chapters.set(String(r.id), r.chapters || []);
      });
    }

    if (Array.isArray(audioTracksList)) {
      audioTracksList.forEach(r => {
        if (r && r.id) memoryStore.audio_tracks.set(String(r.id), r.tracks || []);
      });
    }

    // Migrate any legacy child episode records from localStorage
    if (typeof window !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith('watchanime_episodes_')) {
            const aId = k.replace('watchanime_episodes_', '');
            if (!memoryStore.anime_episodes.has(aId)) {
              const eps = readLegacy(k);
              if (eps) {
                memoryStore.anime_episodes.set(aId, eps);
                idbPut('anime_episodes', { id: aId, episodes: eps });
              }
            }
          } else if (k.startsWith('watchanime_webseries_episodes_')) {
            const wsId = k.replace('watchanime_webseries_episodes_', '');
            if (!memoryStore.webseries_episodes.has(wsId)) {
              const eps = readLegacy(k);
              if (eps) {
                memoryStore.webseries_episodes.set(wsId, eps);
                idbPut('webseries_episodes', { id: wsId, episodes: eps });
              }
            }
          } else if (k.startsWith('watchanime_chapters_')) {
            const mgId = k.replace('watchanime_chapters_', '');
            if (!memoryStore.manga_chapters.has(mgId)) {
              const chs = readLegacy(k);
              if (chs) {
                memoryStore.manga_chapters.set(mgId, chs);
                idbPut('manga_chapters', { id: mgId, chapters: chs });
              }
            }
          } else if (k.startsWith('watchanime_audio_tracks_')) {
            const stId = k.replace('watchanime_audio_tracks_', '');
            if (!memoryStore.audio_tracks.has(stId)) {
              const trs = readLegacy(k);
              if (trs) {
                memoryStore.audio_tracks.set(stId, trs);
                idbPut('audio_tracks', { id: stId, tracks: trs });
              }
            }
          }
        }
      } catch (_) {}

      // Clean up legacy heavy media keys from localStorage to free quota forever
      cleanLegacyLocalStorage();
    }

    memoryStore.isHydrated = true;

    // Dispatch update events for all components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('watchanime_store_hydrated'));
      window.dispatchEvent(new CustomEvent('watchlist_updated'));
      window.dispatchEvent(new CustomEvent('webseries_store_updated'));
      window.dispatchEvent(new CustomEvent('movie_groups_updated'));
      window.dispatchEvent(new CustomEvent('vault_items_updated'));
    }
  } catch (err) {
    console.warn('[localStore] Hydration error:', err);
  }
}

function cleanLegacyLocalStorage() {
  if (typeof window === 'undefined') return;
  try {
    const heavyKeys = [
      'watchanime_animes',
      'watchanime_movies',
      'watchanime_webseries',
      'watchanime_watchlist',
      'watchanime_movie_groups',
      'watchanime_mangas',
      'watchanime_audio_stories',
      'watchanime_notes',
      'watchanime_vault_items',
      'watchanime_dirty_queue',
    ];

    const prefixKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (
        k.startsWith('watchanime_episodes_') ||
        k.startsWith('watchanime_webseries_episodes_') ||
        k.startsWith('watchanime_chapters_') ||
        k.startsWith('watchanime_audio_tracks_') ||
        k.startsWith('cached_omdb_') ||
        k.startsWith('cached_top_rated_') ||
        k.startsWith('watchanime_img_cache_')
      )) {
        prefixKeys.push(k);
      }
    }

    [...heavyKeys, ...prefixKeys].forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
  } catch (_) {}
}

// ─── User ID (localStorage) ──────────────────────────────────────────────────

export function getUserId() {
  return 'myjsqwvDn5bugIr8W8oRiAtjpRJ3';
}

export function setUserId(uid) {
  writePref(PREF_KEYS.USER_ID, uid);
}

// ─── Settings (localStorage) ─────────────────────────────────────────────────

export function getLocalSettings() {
  return readPref(PREF_KEYS.SETTINGS) || { vlcPath: '', defaultPlayer: 'ask' };
}

export function setLocalSettings(settings) {
  writePref(PREF_KEYS.SETTINGS, settings);
}

// ─── Recently Watched (localStorage) ─────────────────────────────────────────

export function getRecentlyWatched() {
  return readPref(PREF_KEYS.RECENTLY_WATCHED) || [];
}

export function setRecentlyWatched(items) {
  writePref(PREF_KEYS.RECENTLY_WATCHED, Array.isArray(items) ? items.slice(0, 50) : []);
}

export function addRecentlyWatched(item) {
  if (!item || !item.id) return;
  const items = getRecentlyWatched();
  const filtered = items.filter(it => it.id !== item.id);
  filtered.unshift({
    id: item.id,
    title: item.title || item.name || '',
    mediaType: item.mediaType || item.type || 'anime',
    posterUrl: item.posterUrl || item.posterPath || item.coverUrl || '',
    progress: item.progress || item.progressPercent || 0,
    currentTime: item.currentTime || 0,
    duration: item.duration || 0,
    episodeNumber: item.episodeNumber || null,
    updatedAt: new Date().toISOString(),
  });
  setRecentlyWatched(filtered);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('recently_watched_updated'));
  }
}

// ─── Slider Progress (localStorage) ──────────────────────────────────────────

export function getAllSliderProgress() {
  return readPref(PREF_KEYS.SLIDER_PROGRESS) || {};
}

export function getSliderProgress(mediaId) {
  if (!mediaId) return null;
  const all = getAllSliderProgress();
  return all[String(mediaId)] || null;
}

export function setSliderProgress(mediaId, progressData) {
  if (!mediaId) return;
  const all = getAllSliderProgress();
  all[String(mediaId)] = {
    currentTime: progressData?.currentTime || 0,
    duration: progressData?.duration || 0,
    progressPercent: progressData?.progressPercent || 0,
    updatedAt: Date.now(),
  };

  // Keep map trimmed to latest 100 entries
  const entries = Object.entries(all);
  if (entries.length > 100) {
    entries.sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
    const trimmed = Object.fromEntries(entries.slice(0, 100));
    writePref(PREF_KEYS.SLIDER_PROGRESS, trimmed);
    return;
  }
  writePref(PREF_KEYS.SLIDER_PROGRESS, all);
}

// ─── Anime Library (IndexedDB) ────────────────────────────────────────────────

export function getLocalAnimes() {
  return memoryStore.animes || [];
}

export function setLocalAnimes(animes) {
  const list = Array.isArray(animes) ? animes : [];
  memoryStore.animes = list;
  idbClear('animes').then(() => idbPutBatch('animes', list));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('animes_updated'));
  }
}

export function getLocalAnime(animeId) {
  const animes = getLocalAnimes();
  return animes.find(a => a.id === animeId) || null;
}

export function upsertLocalAnime(anime) {
  if (!anime || !anime.id) return;
  const animes = [...getLocalAnimes()];
  const idx = animes.findIndex(a => a.id === anime.id);
  if (idx >= 0) {
    animes[idx] = { ...animes[idx], ...anime };
  } else {
    animes.unshift(anime);
  }
  memoryStore.animes = animes;
  idbPut('animes', anime);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('animes_updated'));
  }
}

export function deleteLocalAnime(animeId) {
  if (!animeId) return;
  memoryStore.animes = getLocalAnimes().filter(a => a.id !== animeId);
  memoryStore.anime_episodes.delete(String(animeId));
  idbDelete('animes', animeId);
  idbDelete('anime_episodes', animeId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('animes_updated'));
  }
}

// ─── Anime Episodes (IndexedDB) ───────────────────────────────────────────────

export function getLocalEpisodes(animeId) {
  if (!animeId) return [];
  return memoryStore.anime_episodes.get(String(animeId)) || [];
}

export function setLocalEpisodes(animeId, episodes) {
  if (!animeId) return;
  const list = Array.isArray(episodes) ? episodes : [];
  memoryStore.anime_episodes.set(String(animeId), list);
  idbPut('anime_episodes', { id: String(animeId), episodes: list });
}

export function upsertLocalEpisode(animeId, episode) {
  if (!animeId || !episode || !episode.id) return;
  const episodes = [...getLocalEpisodes(animeId)];
  const idx = episodes.findIndex(e => e.id === episode.id);
  if (idx >= 0) {
    episodes[idx] = { ...episodes[idx], ...episode };
  } else {
    episodes.push(episode);
  }
  setLocalEpisodes(animeId, episodes);
}

export function deleteLocalEpisode(animeId, episodeId) {
  if (!animeId || !episodeId) return;
  const episodes = getLocalEpisodes(animeId).filter(e => e.id !== episodeId);
  setLocalEpisodes(animeId, episodes);
}

// ─── Notes (IndexedDB) ────────────────────────────────────────────────────────

export function getLocalNotes() {
  return memoryStore.notes || [];
}

export function setLocalNotes(notes) {
  const list = Array.isArray(notes) ? notes : [];
  memoryStore.notes = list;
  idbClear('notes').then(() => idbPutBatch('notes', list));
}

export function getLocalNote(noteId) {
  return getLocalNotes().find(n => n.id === noteId) || null;
}

export function upsertLocalNote(note) {
  if (!note || !note.id) return;
  const notes = [...getLocalNotes()];
  const idx = notes.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    notes[idx] = { ...notes[idx], ...note };
  } else {
    notes.unshift(note);
  }
  memoryStore.notes = notes;
  idbPut('notes', note);
}

export function deleteLocalNote(noteId) {
  if (!noteId) return;
  memoryStore.notes = getLocalNotes().filter(n => n.id !== noteId);
  idbDelete('notes', noteId);
}

// ─── Manga Library (IndexedDB) ────────────────────────────────────────────────

export function getLocalMangas() {
  return memoryStore.mangas || [];
}

export function setLocalMangas(mangas) {
  const list = Array.isArray(mangas) ? mangas : [];
  memoryStore.mangas = list;
  idbClear('mangas').then(() => idbPutBatch('mangas', list));
}

export function getLocalManga(mangaId) {
  return getLocalMangas().find(m => m.id === mangaId) || null;
}

export function upsertLocalManga(manga) {
  if (!manga || !manga.id) return;
  const mangas = [...getLocalMangas()];
  const idx = mangas.findIndex(m => m.id === manga.id);
  if (idx >= 0) {
    mangas[idx] = { ...mangas[idx], ...manga };
  } else {
    mangas.unshift(manga);
  }
  memoryStore.mangas = mangas;
  idbPut('mangas', manga);
}

export function deleteLocalManga(mangaId) {
  if (!mangaId) return;
  memoryStore.mangas = getLocalMangas().filter(m => m.id !== mangaId);
  memoryStore.manga_chapters.delete(String(mangaId));
  idbDelete('mangas', mangaId);
  idbDelete('manga_chapters', mangaId);
}

// ─── Manga Chapters (IndexedDB) ───────────────────────────────────────────────

export function getLocalChapters(mangaId) {
  if (!mangaId) return [];
  return memoryStore.manga_chapters.get(String(mangaId)) || [];
}

export function setLocalChapters(mangaId, chapters) {
  if (!mangaId) return;
  const list = Array.isArray(chapters) ? chapters : [];
  memoryStore.manga_chapters.set(String(mangaId), list);
  idbPut('manga_chapters', { id: String(mangaId), chapters: list });
}

export function upsertLocalChapter(mangaId, chapter) {
  if (!mangaId || !chapter || !chapter.id) return;
  const chapters = [...getLocalChapters(mangaId)];
  const idx = chapters.findIndex(c => c.id === chapter.id);
  if (idx >= 0) {
    chapters[idx] = { ...chapters[idx], ...chapter };
  } else {
    chapters.push(chapter);
  }
  setLocalChapters(mangaId, chapters);
}

export function deleteLocalChapter(mangaId, chapterId) {
  if (!mangaId || !chapterId) return;
  const chapters = getLocalChapters(mangaId).filter(c => c.id !== chapterId);
  setLocalChapters(mangaId, chapters);
}

// ─── Audio Stories Library (IndexedDB) ────────────────────────────────────────

export function getLocalAudioStories() {
  return memoryStore.audio_stories || [];
}

export function setLocalAudioStories(stories) {
  const list = Array.isArray(stories) ? stories : [];
  memoryStore.audio_stories = list;
  idbClear('audio_stories').then(() => idbPutBatch('audio_stories', list));
}

export function getLocalAudioStory(storyId) {
  return getLocalAudioStories().find(s => s.id === storyId) || null;
}

export function upsertLocalAudioStory(story) {
  if (!story || !story.id) return;
  const stories = [...getLocalAudioStories()];
  const idx = stories.findIndex(s => s.id === story.id);
  if (idx >= 0) {
    stories[idx] = { ...stories[idx], ...story };
  } else {
    stories.unshift(story);
  }
  memoryStore.audio_stories = stories;
  idbPut('audio_stories', story);
}

export function deleteLocalAudioStory(storyId) {
  if (!storyId) return;
  memoryStore.audio_stories = getLocalAudioStories().filter(s => s.id !== storyId);
  memoryStore.audio_tracks.delete(String(storyId));
  idbDelete('audio_stories', storyId);
  idbDelete('audio_tracks', storyId);
}

// ─── Audio Story Tracks (IndexedDB) ───────────────────────────────────────────

export function getLocalAudioTracks(storyId) {
  if (!storyId) return [];
  return memoryStore.audio_tracks.get(String(storyId)) || [];
}

export function setLocalAudioTracks(storyId, tracks) {
  if (!storyId) return;
  const list = Array.isArray(tracks) ? tracks : [];
  memoryStore.audio_tracks.set(String(storyId), list);
  idbPut('audio_tracks', { id: String(storyId), tracks: list });
}

export function upsertLocalAudioTrack(storyId, track) {
  if (!storyId || !track || !track.id) return;
  const tracks = [...getLocalAudioTracks(storyId)];
  const idx = tracks.findIndex(t => t.id === track.id);
  if (idx >= 0) {
    tracks[idx] = { ...tracks[idx], ...track };
  } else {
    tracks.push(track);
  }
  setLocalAudioTracks(storyId, tracks);
}

export function deleteLocalAudioTrack(storyId, trackId) {
  if (!storyId || !trackId) return;
  const tracks = getLocalAudioTracks(storyId).filter(t => t.id !== trackId);
  setLocalAudioTracks(storyId, tracks);
}

// ─── Movies Library (IndexedDB) ───────────────────────────────────────────────

export function getLocalMovies() {
  return memoryStore.movies || [];
}

export function setLocalMovies(movies) {
  const list = Array.isArray(movies) ? movies : [];
  memoryStore.movies = list;
  idbClear('movies').then(() => idbPutBatch('movies', list));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movies_updated'));
  }
}

export function getLocalMovie(movieId) {
  const movies = getLocalMovies();
  return movies.find(m => m.id === movieId || String(m.tmdbId) === String(movieId)) || null;
}

export function upsertLocalMovie(movie) {
  if (!movie || !movie.id) return;
  const movies = [...getLocalMovies()];
  const idx = movies.findIndex(m => m.id === movie.id || (movie.tmdbId && m.tmdbId === movie.tmdbId));
  if (idx >= 0) {
    movies[idx] = { ...movies[idx], ...movie };
  } else {
    movies.unshift(movie);
  }
  memoryStore.movies = movies;
  idbPut('movies', movie);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movies_updated'));
  }
}

export function deleteLocalMovie(movieId) {
  if (!movieId) return;
  memoryStore.movies = getLocalMovies().filter(m => m.id !== movieId && String(m.tmdbId) !== String(movieId));
  idbDelete('movies', movieId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movies_updated'));
  }
}

// ─── Webseries Library (IndexedDB) ────────────────────────────────────────────

export function getLocalWebseries() {
  return memoryStore.webseries || [];
}

export function setLocalWebseries(seriesList) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  memoryStore.webseries = list;
  idbClear('webseries').then(() => idbPutBatch('webseries', list));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('webseries_store_updated'));
  }
}

export function getLocalWebseriesItem(seriesId) {
  const list = getLocalWebseries();
  return list.find(s => s.id === seriesId || String(s.tmdbId) === String(seriesId)) || null;
}

export function upsertLocalWebseries(series) {
  if (!series || !series.id) return;
  const list = [...getLocalWebseries()];
  const idx = list.findIndex(s => s.id === series.id || (series.tmdbId && s.tmdbId === series.tmdbId));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...series };
  } else {
    list.unshift(series);
  }
  memoryStore.webseries = list;
  idbPut('webseries', series);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('webseries_store_updated'));
  }
}

export function deleteLocalWebseries(seriesId) {
  if (!seriesId) return;
  memoryStore.webseries = getLocalWebseries().filter(s => s.id !== seriesId && String(s.tmdbId) !== String(seriesId));
  memoryStore.webseries_episodes.delete(String(seriesId));
  idbDelete('webseries', seriesId);
  idbDelete('webseries_episodes', seriesId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('webseries_store_updated'));
  }
}

// ─── Webseries Episodes (IndexedDB) ───────────────────────────────────────────

export function getLocalWebseriesEpisodes(seriesId) {
  if (!seriesId) return [];
  return memoryStore.webseries_episodes.get(String(seriesId)) || [];
}

export function setLocalWebseriesEpisodes(seriesId, episodes) {
  if (!seriesId) return;
  const list = Array.isArray(episodes) ? episodes : [];
  memoryStore.webseries_episodes.set(String(seriesId), list);
  idbPut('webseries_episodes', { id: String(seriesId), episodes: list });
}

export function upsertLocalWebseriesEpisode(seriesId, episode) {
  if (!seriesId || !episode || !episode.id) return;
  const episodes = [...getLocalWebseriesEpisodes(seriesId)];
  const idx = episodes.findIndex(e => e.id === episode.id);
  if (idx >= 0) {
    episodes[idx] = { ...episodes[idx], ...episode };
  } else {
    episodes.push(episode);
  }
  setLocalWebseriesEpisodes(seriesId, episodes);
}

export function deleteLocalWebseriesEpisode(seriesId, episodeId) {
  if (!seriesId || !episodeId) return;
  const episodes = getLocalWebseriesEpisodes(seriesId).filter(e => e.id !== episodeId);
  setLocalWebseriesEpisodes(seriesId, episodes);
}

// ─── Watchlist Library (IndexedDB) ────────────────────────────────────────────

export function getLocalWatchlist() {
  return memoryStore.watchlist || [];
}

export function setLocalWatchlist(items) {
  const list = Array.isArray(items) ? items : [];
  memoryStore.watchlist = list;
  idbClear('watchlist').then(() => idbPutBatch('watchlist', list));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('watchlist_updated'));
  }
}

export function getLocalWatchlistItem(id) {
  if (!id) return null;
  const items = getLocalWatchlist();
  return items.find(m => m.id === id || m.slug === id || String(m.tmdbId) === String(id) || String(m.anilistId) === String(id)) || null;
}

export function upsertLocalWatchlist(item) {
  if (!item || !item.id) return;
  const items = [...getLocalWatchlist()];
  const idx = items.findIndex(m => m.id === item.id || (item.tmdbId && m.tmdbId === item.tmdbId && m.contentType === item.contentType));
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...item };
  } else {
    items.unshift(item);
  }
  memoryStore.watchlist = items;
  idbPut('watchlist', item);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('watchlist_updated'));
  }
}

export function deleteLocalWatchlist(id) {
  if (!id) return;
  memoryStore.watchlist = getLocalWatchlist().filter(m => m.id !== id && String(m.tmdbId) !== String(id));
  idbDelete('watchlist', id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('watchlist_updated'));
  }
}

// ─── Movie Groups (IndexedDB) ─────────────────────────────────────────────────

export function getLocalMovieGroups() {
  return memoryStore.movie_groups || [];
}

export function setLocalMovieGroups(groups) {
  const list = Array.isArray(groups) ? groups : [];
  memoryStore.movie_groups = list;
  idbClear('movie_groups').then(() => idbPutBatch('movie_groups', list));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movie_groups_updated'));
  }
}

export function getLocalMovieGroup(idOrSlug) {
  if (!idOrSlug) return null;
  const groups = getLocalMovieGroups();
  return groups.find(g => g.id === idOrSlug || g.slug === idOrSlug) || null;
}

export function upsertLocalMovieGroup(group) {
  if (!group || !group.id) return;
  const groups = [...getLocalMovieGroups()];
  const idx = groups.findIndex(g => g.id === group.id || (group.slug && g.slug === group.slug));
  const now = new Date().toISOString();
  if (idx >= 0) {
    groups[idx] = { ...groups[idx], ...group, updatedAt: now };
  } else {
    groups.unshift({ ...group, createdAt: group.createdAt || now, updatedAt: now });
  }
  memoryStore.movie_groups = groups;
  idbPut('movie_groups', groups[idx >= 0 ? idx : 0]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movie_groups_updated'));
  }
}

export function deleteLocalMovieGroup(groupId) {
  if (!groupId) return;
  memoryStore.movie_groups = getLocalMovieGroups().filter(g => g.id !== groupId && g.slug !== groupId);
  idbDelete('movie_groups', groupId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('movie_groups_updated'));
  }
}

// ─── Secret Vault / Hidden Shelf (IndexedDB + localStorage PIN) ────────────────

export function getVaultPin() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PREF_KEYS.VAULT_PIN) || null;
  } catch {
    return null;
  }
}

export function setVaultPin(pin) {
  if (typeof window === 'undefined') return;
  try {
    if (!pin) {
      localStorage.removeItem(PREF_KEYS.VAULT_PIN);
    } else {
      localStorage.setItem(PREF_KEYS.VAULT_PIN, String(pin).trim());
    }
    window.dispatchEvent(new CustomEvent('vault_pin_updated'));
  } catch (err) {
    console.error('Failed to set vault pin:', err);
  }
}

export function getVaultItems() {
  return memoryStore.vault_items || [];
}

export function setVaultItems(items) {
  const list = Array.isArray(items) ? items : [];
  memoryStore.vault_items = list;
  idbClear('vault_items').then(() => idbPutBatch('vault_items', list));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vault_items_updated'));
  }
}

export function isItemInVault(itemId) {
  if (!itemId) return false;
  return getVaultItems().some(it => it.id === itemId);
}

export function toggleVaultItem(item) {
  if (!item || !item.id) return false;
  const items = [...getVaultItems()];
  const exists = items.some(it => it.id === item.id);
  if (exists) {
    const updated = items.filter(it => it.id !== item.id);
    setVaultItems(updated);
    return false;
  } else {
    const newRecord = {
      id: item.id,
      mediaType: item.mediaType || item.type || item.contentType || 'movie',
      title: item.title || item.name || 'Untitled',
      posterUrl: item.posterUrl || item.posterPath || item.coverUrl || item.thumbnailBase64 || null,
      rating: item.rating || item.score || null,
      year: item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : ''),
      runtime: item.runtime || null,
      addedAt: new Date().toISOString(),
    };
    items.unshift(newRecord);
    setVaultItems(items);
    return true;
  }
}

// ─── Dirty Queue (pending Firestore writes, IndexedDB) ─────────────────────────

export function getDirtyQueue() {
  return memoryStore.dirty_queue || [];
}

export function addToDirtyQueue(op) {
  if (!op) return;
  const queue = [...getDirtyQueue()];
  const key = op.dedupeKey;
  const filtered = key ? queue.filter(q => q.dedupeKey !== key) : queue;
  filtered.push(op);
  memoryStore.dirty_queue = filtered;
  idbPut('dirty_queue', { id: op.dedupeKey || String(Date.now()), ...op });
}

export function clearDirtyQueue() {
  memoryStore.dirty_queue = [];
  idbClear('dirty_queue');
}

export function removeDirtyOp(dedupeKey) {
  if (!dedupeKey) return;
  memoryStore.dirty_queue = getDirtyQueue().filter(q => q.dedupeKey !== dedupeKey);
  idbDelete('dirty_queue', dedupeKey);
}
