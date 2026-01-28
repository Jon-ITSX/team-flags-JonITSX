import * as admin from 'firebase-admin';

// Lazy initialization of Firebase Admin SDK
// This prevents build-time errors when credentials are not available
let adminAuthInstance: admin.auth.Auth | null = null;
let adminAppInstance: admin.app.App | null = null;
let isInitialized = false;

/**
 * Initialize Firebase Admin SDK lazily
 * Only initializes if all required environment variables are present
 */
function initializeAdminApp(): admin.app.App | null {
  // Return existing instance if already initialized
  if (isInitialized) {
    return adminAppInstance;
  }

  isInitialized = true;

  // Check if Firebase Admin credentials are available
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    console.warn('⚠️ Firebase Admin credentials not configured');
    console.warn('   Set FIREBASE_ADMIN_PROJECT_ID to enable Firebase features');
    return null;
  }

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!privateKey) {
    console.warn('⚠️ Firebase Admin private key not found');
    console.warn('   Set FIREBASE_ADMIN_PRIVATE_KEY to enable Firebase features');
    return null;
  }

  try {
    if (admin.apps.length === 0) {
      adminAppInstance = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '',
          privateKey: privateKey,
        }),
      });
    } else {
      adminAppInstance = admin.app();
    }

    console.log('✓ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('✗ Failed to initialize Firebase Admin:', error);
    return null;
  }

  return adminAppInstance;
}

/**
 * Get Firebase Auth instance with error handling
 */
export function getAdminAuth(): admin.auth.Auth {
  const app = initializeAdminApp();
  if (!app) {
    throw new Error(
      'Firebase Admin Auth is not initialized.\n' +
      'Ensure the following environment variables are set:\n' +
      '  - FIREBASE_ADMIN_PROJECT_ID\n' +
      '  - FIREBASE_ADMIN_CLIENT_EMAIL\n' +
      '  - FIREBASE_ADMIN_PRIVATE_KEY'
    );
  }
  if (!adminAuthInstance) {
    adminAuthInstance = admin.auth(app);
  }
  return adminAuthInstance;
}

/**
 * Get Firebase App instance with error handling
 */
export function getAdminApp(): admin.app.App {
  const app = initializeAdminApp();
  if (!app) {
    throw new Error(
      'Firebase Admin App is not initialized.\n' +
      'Ensure the following environment variables are set:\n' +
      '  - FIREBASE_ADMIN_PROJECT_ID\n' +
      '  - FIREBASE_ADMIN_CLIENT_EMAIL\n' +
      '  - FIREBASE_ADMIN_PRIVATE_KEY'
    );
  }
  return app;
}

// Deprecated: Direct exports for backwards compatibility
// These will throw errors if Firebase is not initialized
// Prefer using getAdminAuth() and getAdminApp() instead
export const adminAuth = new Proxy(new Object(), {
  get: () => {
    return getAdminAuth();
  },
}) as unknown as admin.auth.Auth;

export const adminApp = new Proxy(new Object(), {
  get: () => {
    return getAdminApp();
  },
}) as unknown as admin.app.App;
