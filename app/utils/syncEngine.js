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
    setLocalNotes(notes);

  } catch (err) {
    console.error('pullFromFirestore error:', err);
    throw err;
  }
}

// ─── Push dirty queue to Firestore ───────────────────────────────────────────

export async function pushToFirestore(db) {
  const userId = getUserId();
  if (!db || !userId) return;

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
