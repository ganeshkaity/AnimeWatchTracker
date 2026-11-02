import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * app/api/notifications/send/route.js
 * 
 * Free server-side delivery endpoint for Firebase Cloud Messaging (FCM).
 * 
 * Capabilities:
 * - Sends push messages to specific device token(s) or topics.
 * - Supports FCM HTTP v1 (OAuth2 via service account) or FCM Legacy Server Key.
 * - Implemented entirely with Node.js built-ins (crypto, fetch) without requiring
 *   paid Firebase Blaze plans, Cloud Functions, or heavy external packages.
 * - Returns diagnostic guidance if server credentials are not yet added.
 */

// ─── OAuth2 Access Token Generator for FCM HTTP v1 API ───────────────────────

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessTokenFromServiceAccount(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaim = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google OAuth2 Token Request failed: ${errorText}`);
  }

  const tokenData = await res.json();
  return tokenData.access_token;
}

function parseServiceAccount() {
  // 1. Direct JSON string in FIREBASE_SERVICE_ACCOUNT
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (raw.startsWith('{')) return JSON.parse(raw);
      // Maybe base64 encoded
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      console.warn('[FCM API] Error parsing FIREBASE_SERVICE_ACCOUNT:', e.message);
    }
  }

  // 2. Composed from individual env variables
  if (
    process.env.FIREBASE_CLIENT_EMAIL &&
    (process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY)
  ) {
    let key = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';
    key = key.replace(/\\n/g, '\n');
    return {
      project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: key,
    };
  }

  return null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      token,
      tokens,
      title = 'WatchAnime Update',
      message = '',
      url = '/',
      icon = '/icons/icon-192x192.png',
      badge = '/icons/icon-96x96.png',
      image,
      data = {},
      tag = 'watchanime-push',
    } = body;

    const targetTokens = Array.isArray(tokens) ? tokens : token ? [token] : [];

    if (targetTokens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No target device token(s) provided.' },
        { status: 400 }
      );
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const serviceAccount = parseServiceAccount();
    const legacyServerKey = process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY;

    // Check if server credentials are configured
    if (!serviceAccount && !legacyServerKey) {
      return NextResponse.json(
        {
          success: false,
          configured: false,
          reason: 'SERVER_CREDENTIALS_MISSING',
          message:
            'Server-side FCM sending requires either FCM_SERVER_KEY or a Firebase Service Account in .env.local. You can generate a private key in Firebase Console -> Project Settings -> Service Accounts.',
          targetsCount: targetTokens.length,
        },
        { status: 200 }
      );
    }

    const results = [];

    // ─── Option A: FCM HTTP v1 (Modern OAuth2) ──────────────────────────────
    if (serviceAccount && projectId) {
      try {
        const accessToken = await getAccessTokenFromServiceAccount(serviceAccount);

        for (const deviceToken of targetTokens) {
          // IMPORTANT: To prevent duplicate background notifications in Web Push,
          // we transmit the content inside the `data` payload so our Service Worker
          // can manage rendering and navigation cleanly.
          const payload = {
            message: {
              token: deviceToken,
              data: {
                title: String(title),
                body: String(message || body.body || ''),
                url: String(url),
                icon: String(icon),
                badge: String(badge),
                tag: String(tag),
                ...Object.fromEntries(
                  Object.entries(data).map(([k, v]) => [k, String(v)])
                ),
              },
              webpush: {
                headers: {
                  Urgency: 'high',
                },
                fcm_options: {
                  link: url,
                },
              },
            },
          };

          const fcmRes = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            }
          );

          const fcmJson = await fcmRes.json();
          results.push({
            token: deviceToken.slice(0, 16) + '...',
            success: fcmRes.ok,
            result: fcmJson,
          });
        }

        return NextResponse.json({
          success: true,
          method: 'fcm_v1',
          results,
        });
      } catch (fcmError) {
        console.error('[FCM API] FCM v1 send failed, checking legacy fallback:', fcmError);
        if (!legacyServerKey) {
          return NextResponse.json(
            { success: false, error: fcmError.message },
            { status: 500 }
          );
        }
      }
    }

    // ─── Option B: FCM Legacy Protocol Fallback ──────────────────────────────
    if (legacyServerKey) {
      for (const deviceToken of targetTokens) {
        const legacyPayload = {
          to: deviceToken,
          data: {
            title,
            body: message || body.body || '',
            url,
            icon,
            badge,
            tag,
            ...data,
          },
          priority: 'high',
        };

        const legacyRes = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            Authorization: `key=${legacyServerKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(legacyPayload),
        });

        const legacyJson = await legacyRes.json();
        results.push({
          token: deviceToken.slice(0, 16) + '...',
          success: legacyRes.ok && legacyJson.success === 1,
          result: legacyJson,
        });
      }

      return NextResponse.json({
        success: true,
        method: 'fcm_legacy',
        results,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Could not send push notification.' },
      { status: 500 }
    );
  } catch (err) {
    console.error('[FCM API] Send route error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

