import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * app/api/notifications/broadcast/route.js
 * 
 * Local Server → Deployed Vercel PWA Push Broadcaster
 * 
 * Initiated exclusively from your local PC's Next.js server.
 * Uses your private Firebase Service Account to:
 * 1. Read all active device tokens from Firestore: users/{userId}/pushTokens
 * 2. Dispatch push notifications via FCM HTTP v1 directly to your phone / Vercel PWA
 * 3. Automatically detect and deactivate stale/unregistered tokens
 * 
 * 100% free, zero paid Cloud Functions or external relays required.
 */

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function parseServiceAccount() {
  const localFilePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
    ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : path.resolve(process.cwd(), 'firebase-service-account.json');

  if (fs.existsSync(localFilePath)) {
    try {
      const content = fs.readFileSync(localFilePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.warn('[Broadcast API] Error reading service account file:', e.message);
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (raw.startsWith('{')) return JSON.parse(raw);
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (_) {}
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && (process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY)) {
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

async function getOAuth2AccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
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
    const errText = await res.text();
    throw new Error(`Google OAuth2 Token Request failed: ${errText}`);
  }

  const tokenData = await res.json();
  return tokenData.access_token;
}

// ─── Fetch Active Subscriber Tokens from Firestore ───────────────────────────

async function getActiveSubscribers(projectId, accessToken, userId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/pushTokens`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.warn(`[Broadcast API] Firestore query error (${res.status}):`, await res.text());
    return [];
  }

  const data = await res.json();
  if (!data.documents || !Array.isArray(data.documents)) {
    return [];
  }

  const subscribers = [];
  for (const doc of data.documents) {
    const fields = doc.fields || {};
    const active = fields.active?.booleanValue ?? true;
    const token = fields.token?.stringValue;
    const tokenId = fields.tokenId?.stringValue || path.basename(doc.name);

    let device = {};
    if (fields.device?.mapValue?.fields) {
      const dFields = fields.device.mapValue.fields;
      device = {
        browser: dFields.browser?.stringValue || 'Browser',
        platform: dFields.platform?.stringValue || 'Unknown',
        type: dFields.type?.stringValue || 'device',
      };
    }

    if (active && token) {
      subscribers.push({
        token,
        tokenId,
        docName: doc.name,
        device,
        createdAt: fields.createdAt?.stringValue,
      });
    }
  }

  return subscribers;
}

// ─── Deactivate Stale Token in Firestore ─────────────────────────────────────

async function markTokenInactive(docName, accessToken) {
  try {
    const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=active&updateMask.fieldPaths=unregisteredAt`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          active: { booleanValue: false },
          unregisteredAt: { stringValue: new Date().toISOString() },
        },
      }),
    });
  } catch (err) {
    console.warn('[Broadcast API] Failed to mark stale token inactive:', err.message);
  }
}

// ─── GET: Inspect Subscribed Devices ─────────────────────────────────────────

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'myjsqwvDn5bugIr8W8oRiAtjpRJ3';

    const sa = parseServiceAccount();
    if (!sa) {
      return NextResponse.json({
        success: false,
        configured: false,
        message: 'Firebase Service Account key not found on local server.',
      });
    }

    const accessToken = await getOAuth2AccessToken(sa);
    const subscribers = await getActiveSubscribers(sa.project_id, accessToken, userId);

    return NextResponse.json({
      success: true,
      configured: true,
      userId,
      count: subscribers.length,
      subscribers: subscribers.map(s => ({
        tokenId: s.tokenId,
        device: s.device,
        createdAt: s.createdAt,
        tokenMasked: s.token.slice(0, 16) + '...' + s.token.slice(-8),
      })),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: Broadcast Push Notification to All Subscribed Devices ─────────────

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      title = 'WatchAnime Update',
      message = 'New activity from your local movie tracker',
      url = '/',
      icon = '/icons/icon-192x192.png',
      badge = '/icons/icon-96x96.png',
      image,
      data = {},
      userId = 'myjsqwvDn5bugIr8W8oRiAtjpRJ3',
      tag = `broadcast_${Date.now()}`,
    } = body;

    const sa = parseServiceAccount();
    if (!sa) {
      return NextResponse.json({
        success: false,
        configured: false,
        reason: 'SERVICE_ACCOUNT_MISSING',
        message: 'Local server requires firebase-service-account.json or environment secret.',
      }, { status: 400 });
    }

    const accessToken = await getOAuth2AccessToken(sa);
    const subscribers = await getActiveSubscribers(sa.project_id, accessToken, userId);

    if (subscribers.length === 0) {
      return NextResponse.json({
        success: true,
        sentCount: 0,
        message: 'No active devices currently subscribed. Open your Vercel PWA on your phone and tap "Enable Push".',
      });
    }

    const results = [];
    let deliveredCount = 0;
    let staleCount = 0;

    for (const sub of subscribers) {
      const fcmPayload = {
        message: {
          token: sub.token,
          data: {
            title: String(title),
            body: String(message),
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

      try {
        const fcmRes = await fetch(
          `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(fcmPayload),
          }
        );

        const fcmJson = await fcmRes.json();

        if (fcmRes.ok) {
          deliveredCount++;
          results.push({
            device: sub.device,
            success: true,
            tokenId: sub.tokenId,
          });
        } else {
          const errorCode = fcmJson.error?.details?.[0]?.errorCode || fcmJson.error?.status;
          // Stale / unregistered token cleanup
          if (
            fcmRes.status === 404 ||
            errorCode === 'UNREGISTERED' ||
            fcmJson.error?.message?.includes('not a valid FCM registration token')
          ) {
            await markTokenInactive(sub.docName, accessToken);
            staleCount++;
          }

          results.push({
            device: sub.device,
            success: false,
            error: fcmJson.error?.message || 'Delivery error',
            cleanedUp: true,
          });
        }
      } catch (sendErr) {
        results.push({
          device: sub.device,
          success: false,
          error: sendErr.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalSubscribers: subscribers.length,
      deliveredCount,
      staleCount,
      results,
    });
  } catch (err) {
    console.error('[Broadcast API] Handler error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

