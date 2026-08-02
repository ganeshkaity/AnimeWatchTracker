/**
 * app/api/stream/store.js
 * In-memory singleton session store for local stream host & paired mobile devices.
 * Uses globalThis so state persists across hot-reloads and API invocations in Next.js.
 */

if (!globalThis.__watchanime_stream_store) {
  globalThis.__watchanime_stream_store = {
    session: null, // { sessionId, pairingToken, passcode, createdAt, online, hostIp, port }
    pairedDevices: new Map(), // deviceId => { deviceId, deviceName, pairedAt, lastSeen }
  };
}

const store = globalThis.__watchanime_stream_store;

function generatePasscode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getHostSession() {
  if (!store.session) return null;
  return {
    ...store.session,
    pairedDevicesCount: store.pairedDevices.size,
    pairedDevices: Array.from(store.pairedDevices.values()),
  };
}

export function startHostSession({ hostIp, port = 3000 } = {}) {
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const pairingToken = 'pair_' + Math.random().toString(36).substring(2, 11);
  const passcode = generatePasscode();

  store.session = {
    sessionId,
    pairingToken,
    passcode,
    createdAt: new Date().toISOString(),
    online: true,
    hostIp: hostIp || '127.0.0.1',
    port,
  };

  return getHostSession();
}

export function stopHostSession() {
  store.session = null;
  store.pairedDevices.clear();
  return { success: true };
}

export function validatePairingToken(token, passcode) {
  if (!store.session || !store.session.online) {
    return { valid: false, reason: 'Host is offline or session not started' };
  }
  if (token && store.session.pairingToken === token) {
    return { valid: true, session: store.session };
  }
  if (
    passcode &&
    store.session.passcode &&
    store.session.passcode.toUpperCase().trim() === passcode.toUpperCase().trim()
  ) {
    return { valid: true, session: store.session };
  }
  return { valid: false, reason: 'Invalid or expired pairing code/token' };
}

export function registerPairedDevice({ deviceId, deviceName }) {
  if (!deviceId) return null;
  const now = new Date().toISOString();
  const existing = store.pairedDevices.get(deviceId);

  const device = {
    deviceId,
    deviceName: deviceName || 'Mobile Web Browser',
    pairedAt: existing ? existing.pairedAt : now,
    lastSeen: now,
  };

  store.pairedDevices.set(deviceId, device);
  return device;
}

export function revokeDevice(deviceId) {
  if (!deviceId) return false;
  return store.pairedDevices.delete(deviceId);
}

export function touchDevice(deviceId) {
  if (!deviceId) return;
  const dev = store.pairedDevices.get(deviceId);
  if (dev) {
    dev.lastSeen = new Date().toISOString();
    store.pairedDevices.set(deviceId, dev);
  }
}
