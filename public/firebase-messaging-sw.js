/**
 * firebase-messaging-sw.js
 * Fallback Service Worker entry for Firebase Cloud Messaging default discovery.
 * Reuses the primary PWA Service Worker (/sw.js) to guarantee unified caching and notification handling.
 */
importScripts('/sw.js');

