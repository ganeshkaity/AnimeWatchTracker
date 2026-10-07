/**
 * syncEngine.js — Bidirectional sync between localStorage and Firestore
 * 
 * pullFromFirestore: Downloads all user data from Firestore → localStorage
 * pushToFirestore:  Reads dirty queue → uploads pending writes to Firestore → clears queue
 * fullSync:         push first, then pull
 */

import {
  collection, collectionGroup, doc, getDocs, setDoc, deleteDoc, writeBatch, getDoc
} from 'firebase/firestore';
import {
  getLocalAnimes, setLocalAnimes,
  getLocalEpisodes, setLocalEpisodes,
  getLocalMangas, setLocalMangas,
  getLocalChapters, setLocalChapters,
  getLocalAudioStories, setLocalAudioStories,
  getLocalAudioTracks, setLocalAudioTracks,
  getLocalMovies, setLocalMovies,
  setLocalWatchlist,
  getLocalNotes, setLocalNotes,
  getLocalSettings, setLocalSettings,
  getDirtyQueue, clearDirtyQueue,
  getUserId
} from './localStore';

// ─── Pull from Firestore ──────────────────────────────────────────────────────

export async function pullFromFirestore(db) {
  const userId = getUserId();
  if (!db || !userId) return;

  try {
    // Pull settings (stored under current user's document)
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      setLocalSettings({
        vlcPath: data.vlcPath || '',
        defaultPlayer: data.defaultPlayer || 'ask',
      });
    }

    // Pull anime list from the specific user
    const animeSnap = await getDocs(collection(db, 'users', userId, 'anime'));
    const animes = [];
    const episodePromises = [];

    animeSnap.forEach(d => {
      const animeUserId = userId;
      const anime = { id: d.id, userId: animeUserId, ...d.data() };
      animes.push(anime);

      // Pull episodes for each anime using its specific userId path
      episodePromises.push(
        getDocs(collection(db, 'users', animeUserId, 'anime', d.id, 'episodes'))
          .then(epSnap => {
            const episodes = [];
            epSnap.forEach(ed => episodes.push({ id: ed.id, ...ed.data() }));
            setLocalEpisodes(d.id, episodes);
          })
      );
    });

    setLocalAnimes(animes);
    await Promise.all(episodePromises);

    // Pull notes from the specific user
    const notesSnap = await getDocs(collection(db, 'users', userId, 'notes'));
    const notes = [];
    notesSnap.forEach(d => {
      const noteUserId = userId;
      notes.push({ id: d.id, userId: noteUserId, ...d.data() });
    });
    // Pull manga list from user
    const mangaSnap = await getDocs(collection(db, 'users', userId, 'mangas'));
    const mangas = [];
    const chapterPromises = [];
    mangaSnap.forEach(d => {
      const mData = d.data();
      const isWatched = Boolean(mData.isWatched || mData.progressPercent === 100 || mData.status === 'completed');
      const manga = { id: d.id, userId, ...mData, isWatched };
      mangas.push(manga);
      chapterPromises.push(
        getDocs(collection(db, 'users', userId, 'mangas', d.id, 'chapters'))
          .then(cSnap => {
            const chapters = [];
            cSnap.forEach(cd => {
              const cData = cd.data();
              const isWatched = Boolean(cData.isWatched || cData.isRead || (cData.progress && cData.progress >= 95));
              chapters.push({
                id: cd.id,
                ...cData,
                isWatched,
                isRead: isWatched,
              });
            });
            setLocalChapters(d.id, chapters);
          })
      );
    });
    setLocalMangas(mangas);
    await Promise.all(chapterPromises);

    // Pull audio stories list from user
    const audioStoriesSnap = await getDocs(collection(db, 'users', userId, 'audioStories'));
    const audioStories = [];
    const trackPromises = [];
    audioStoriesSnap.forEach(d => {
      const aData = d.data();
      const isWatched = Boolean(aData.isWatched || aData.progressPercent === 100 || aData.status === 'completed');
      const story = { id: d.id, userId, ...aData, isWatched };
      audioStories.push(story);
      trackPromises.push(
        getDocs(collection(db, 'users', userId, 'audioStories', d.id, 'tracks'))
          .then(tSnap => {
            const tracks = [];
            tSnap.forEach(td => {
              const tData = td.data();
              const isWatchedTrack = Boolean(tData.isWatched || (tData.progress && tData.progress >= 95));
              tracks.push({
                id: td.id,
                ...tData,
                isWatched: isWatchedTrack,
              });
            });
            setLocalAudioTracks(d.id, tracks);
          })
      );
    });
    setLocalAudioStories(audioStories);
    await Promise.all(trackPromises);

    // Pull movies list from user
    const moviesSnap = await getDocs(collection(db, 'users', userId, 'movies'));
    const movies = [];
    moviesSnap.forEach(d => {
      const mData = d.data();
      const isWatched = Boolean(mData.watched || mData.isWatched || mData.watchStatus === 'Completed' || (mData.watchProgress && mData.watchProgress >= 95));
      movies.push({ id: d.id, userId, ...mData, watched: isWatched, isWatched });
    });
    setLocalMovies(movies);

    // Pull watchlist from user
    try {
      const watchlistSnap = await getDocs(collection(db, 'users', userId, 'watchlist'));
      const watchlist = [];
      watchlistSnap.forEach(d => {
        watchlist.push({ id: d.id, userId, ...d.data() });
      });
      setLocalWatchlist(watchlist);
    } catch (wErr) {
      console.warn('Watchlist pull error:', wErr);
    }

  } catch (err) {
    console.error('pullFromFirestore error:', err);
    throw err;
  }
}

// ─── Reconcile locally watched mangas to Firestore ───────────────────────────

export async function syncLocalWatchedMangasToFirestore(db, userId) {
  if (!db || !userId) return;
  try {
    const localMangas = getLocalMangas();
    if (!localMangas || localMangas.length === 0) return;

    let batch = writeBatch(db);
    let batchCount = 0;

    for (const manga of localMangas) {
      const localChapters = getLocalChapters(manga.id);
      const watchedChapters = (localChapters || []).filter(
        c => Boolean(c.isWatched || c.isRead || (c.progress && c.progress >= 95))
      );
      const isMangaWatched = Boolean(
        manga.isWatched ||
        manga.progressPercent === 100 ||
        (localChapters.length > 0 && watchedChapters.length === localChapters.length)
      );

      // If manga or any of its chapters has watched progress
      if (isMangaWatched || watchedChapters.length > 0 || (manga.progressPercent && manga.progressPercent > 0)) {
        const mRef = doc(db, 'users', userId, 'mangas', manga.id);
        const mangaPayload = {
          ...manga,
          isWatched: isMangaWatched,
          isCompleted: isMangaWatched,
          completedChapters: watchedChapters.length,
          progressPercent: localChapters.length > 0
            ? Math.round((watchedChapters.length / localChapters.length) * 100)
            : (manga.progressPercent || 0),
          status: isMangaWatched ? 'completed' : (watchedChapters.length > 0 ? 'reading' : manga.status || 'ready'),
          updatedAt: manga.updatedAt || new Date().toISOString(),
        };
        batch.set(mRef, mangaPayload, { merge: true });
        batchCount++;

        for (const ch of watchedChapters) {
          const chId = ch.id || `manga_${manga.id}_${encodeURIComponent(ch.name || ch.fileName || '')}`;
          const chRef = doc(db, 'users', userId, 'mangas', manga.id, 'chapters', chId);
          batch.set(chRef, {
            ...ch,
            isWatched: true,
            isRead: true,
            progress: ch.progress !== undefined ? ch.progress : 100,
            lastPage: ch.lastPage || ch.totalPages || 1,
            updatedAt: ch.updatedAt || new Date().toISOString(),
          }, { merge: true });
          batchCount++;

          if (batchCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn('[syncEngine] Error reconciling local watched mangas to Firestore:', err);
  }
}

// ─── Push dirty queue to Firestore ───────────────────────────────────────────

export async function pushToFirestore(db) {
  const userId = getUserId();
  if (!db || !userId) return;

  // First reconcile any locally stored watched mangas so they are guaranteed in Firestore
  await syncLocalWatchedMangasToFirestore(db, userId);

  const queue = getDirtyQueue();
  if (queue.length === 0) return;

  const batch = writeBatch(db);
  let batchCount = 0;

  const flushBatch = async () => {
    if (batchCount > 0) {
      await batch.commit();
      batchCount = 0;
    }
  };

  try {
    for (const op of queue) {
      if (op.type === 'SET_ANIME') {
        const { id, userId: targetUserId, ...data } = op.payload;
        const ref = doc(db, 'users', targetUserId || userId, 'anime', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'DELETE_ANIME') {
        const ref = doc(db, 'users', op.payload.userId || userId, 'anime', op.payload.id);
        batch.delete(ref);
        batchCount++;
      } else if (op.type === 'SET_EPISODE') {
        const { animeId, id, animeUserId, ...data } = op.payload;
        const ref = doc(db, 'users', animeUserId || userId, 'anime', animeId, 'episodes', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'SET_EPISODES_BATCH') {
        // Multiple episodes at once (initial add or mark all)
        const { animeId, animeUserId, episodes } = op.payload;
        for (const ep of episodes) {
          const { id, ...data } = ep;
          const ref = doc(db, 'users', animeUserId || userId, 'anime', animeId, 'episodes', id);
          batch.set(ref, data, { merge: true });
          batchCount++;
          if (batchCount >= 490) {
            await flushBatch();
          }
        }
      } else if (op.type === 'DELETE_EPISODE') {
        const { animeId, id, animeUserId } = op.payload;
        const ref = doc(db, 'users', animeUserId || userId, 'anime', animeId, 'episodes', id);
        batch.delete(ref);
        batchCount++;
      } else if (op.type === 'SET_NOTE') {
        const { id, userId: targetUserId, ...data } = op.payload;
        const ref = doc(db, 'users', targetUserId || userId, 'notes', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'DELETE_NOTE') {
        const ref = doc(db, 'users', op.payload.userId || userId, 'notes', op.payload.id);
        batch.delete(ref);
        batchCount++;
      } else if (op.type === 'SET_SETTINGS') {
        const ref = doc(db, 'users', userId);
        batch.set(ref, op.payload, { merge: true });
        batchCount++;
      } else if (op.type === 'SET_MANGA') {
        const { id, userId: targetUserId, ...data } = op.payload;
        const ref = doc(db, 'users', targetUserId || userId, 'mangas', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'DELETE_MANGA') {
        const ref = doc(db, 'users', op.payload.userId || userId, 'mangas', op.payload.id);
        batch.delete(ref);
        batchCount++;
      } else if (op.type === 'SET_CHAPTER') {
        const { mangaId, id, mangaUserId, ...data } = op.payload;
        const ref = doc(db, 'users', mangaUserId || userId, 'mangas', mangaId, 'chapters', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'SET_CHAPTERS_BATCH') {
        const { mangaId, mangaUserId, chapters } = op.payload;
        for (const ch of chapters) {
          const { id, ...data } = ch;
          const ref = doc(db, 'users', mangaUserId || userId, 'mangas', mangaId, 'chapters', id);
          batch.set(ref, data, { merge: true });
          batchCount++;
          if (batchCount >= 490) {
            await flushBatch();
          }
        }
      } else if (op.type === 'DELETE_CHAPTER') {
        const { mangaId, id, mangaUserId } = op.payload;
        const ref = doc(db, 'users', mangaUserId || userId, 'mangas', mangaId, 'chapters', id);
        batch.delete(ref);
        batchCount++;
      } else if (op.type === 'SET_MANGA_PROGRESS') {
        const { mangaId, documentId, id, mangaUserId, ...data } = op.payload;
        const targetId = id || documentId;
        if (targetId) {
          const chRef = doc(db, 'users', mangaUserId || userId, 'mangas', mangaId, 'chapters', targetId);
          batch.set(chRef, data, { merge: true });
          batchCount++;
          const progRef = doc(db, 'users', mangaUserId || userId, 'mangas', mangaId, 'progress', targetId);
          batch.set(progRef, data, { merge: true });
          batchCount++;
        }
      } else if (op.type === 'SET_AUDIO_STORY') {
        const { id, userId: targetUserId, ...data } = op.payload;
        const ref = doc(db, 'users', targetUserId || userId, 'audioStories', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'DELETE_AUDIO_STORY') {
        const ref = doc(db, 'users', op.payload.userId || userId, 'audioStories', op.payload.id);
        batch.delete(ref);
        batchCount++;
      } else if (op.type === 'SET_AUDIO_TRACK') {
        const { storyId, id, storyUserId, ...data } = op.payload;
        const ref = doc(db, 'users', storyUserId || userId, 'audioStories', storyId, 'tracks', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'SET_AUDIO_TRACKS_BATCH') {
        const { storyId, storyUserId, tracks } = op.payload;
        for (const trk of tracks) {
          const { id, ...data } = trk;
          const ref = doc(db, 'users', storyUserId || userId, 'audioStories', storyId, 'tracks', id);
          batch.set(ref, data, { merge: true });
          batchCount++;
          if (batchCount >= 490) {
            await flushBatch();
          }
        }
      } else if (op.type === 'DELETE_AUDIO_TRACK') {
        const { storyId, id, storyUserId } = op.payload;
        const ref = doc(db, 'users', storyUserId || userId, 'audioStories', storyId, 'tracks', id);
        batch.delete(ref);
        batchCount++;
      } else if (op.type === 'SET_MOVIE') {
        const { id, userId: targetUserId, ...data } = op.payload;
        const ref = doc(db, 'users', targetUserId || userId, 'movies', id);
        batch.set(ref, data, { merge: true });
        batchCount++;
      } else if (op.type === 'DELETE_MOVIE') {
        const ref = doc(db, 'users', op.payload.userId || userId, 'movies', op.payload.id);
        batch.delete(ref);
        batchCount++;
      }

      if (batchCount >= 490) {
        await flushBatch();
      }
    }

    await flushBatch();
    clearDirtyQueue();
  } catch (err) {
    console.error('pushToFirestore error:', err);
    throw err;
  }
}

// ─── Full sync: push then pull ────────────────────────────────────────────────

export async function fullSync(db) {
  await pushToFirestore(db);
  await pullFromFirestore(db);
}
