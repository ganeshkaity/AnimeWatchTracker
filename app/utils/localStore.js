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

function write(key, value) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
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
