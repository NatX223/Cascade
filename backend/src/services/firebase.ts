// Firebase Admin bootstrap. The service account is passed as a single
// base64-encoded JSON blob in the `CRED` env var (see .env.example) so it can
// live in a secret manager / CI variable without newlines-in-env headaches.
//
// Initialization is lazy and idempotent: nothing touches Firebase until
// `getDb()` (or `initializeFirebase()`) is first called, and calling either
// more than once returns the already-initialized instances. If `CRED` is not
// set the backend still boots — only code paths that actually use Firestore
// will throw.

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { env } from "../config/env.js";
import { logger } from "../logger.js";

let app: App | null = null;
let firestore: Firestore | null = null;

function loadCredentials(): ServiceAccount {
  if (!env.CRED) {
    throw new Error(
      "Firebase is not configured: set CRED to the base64-encoded service account JSON",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(env.CRED, "base64").toString("utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse CRED as base64-encoded JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || !("project_id" in parsed)) {
    throw new Error("CRED did not decode to a Firebase service account object");
  }

  return parsed as ServiceAccount;
}

/**
 * Initialize the Firebase Admin SDK. Safe to call multiple times — the first
 * call does the work, later calls are no-ops. Throws if `CRED` is missing or
 * malformed.
 */
export function initializeFirebase(): App {
  if (app) return app;

  const credentials = loadCredentials();
  const projectId =
    (credentials as { projectId?: string }).projectId ??
    (credentials as { project_id?: string }).project_id;

  app = getApps().length ? getApp() : initializeApp({ credential: cert(credentials) });

  logger.info({ projectId }, "Firebase initialized");
  return app;
}

/** Firestore handle, initializing the Admin SDK on first use. */
export function getDb(): Firestore {
  if (!firestore) {
    initializeFirebase();
    firestore = getFirestore();
  }
  return firestore;
}

/** Whether `CRED` is present. Does not validate its contents. */
export const firebaseConfigured = Boolean(env.CRED);
