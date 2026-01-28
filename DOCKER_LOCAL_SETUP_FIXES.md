# Docker Local Setup - Issues & Recommendations

**Date:** January 28, 2026  
**Project:** Team Flags EDU  
**Status:** Code scan completed - Issues identified

---

## Executive Summary

The project is a Next.js educational platform with Docker support, but several critical issues prevent it from running locally with Docker. The main problems are:

1. **Missing docker-compose.yml** - No orchestration for multi-service setup
2. **Hardcoded build-time MongoDB URI** - Won't work for local development
3. **Firebase Admin SDK initialization at build time** - Causes build failures
4. **Missing .env.local handling** - Environment variables not properly configured for local Docker
5. **package-lock.json missing** - Build may be non-deterministic
6. **Missing health checks** - No container readiness verification
7. **Build-time environment variable validation issues** - SKIP_ENV_VALIDATION hack is problematic

---

## Detailed Issues & Fixes

### 🔴 CRITICAL ISSUES

#### 1. **Dockerfile has hardcoded MongoDB URI (Line 34)**

**File:** [Dockerfile](Dockerfile)  
**Issue:** The Dockerfile sets a dummy MongoDB URI at build time:
```dockerfile
ENV MONGODB_URI=mongodb://localhost:27017
```

This won't work in Docker because:
- `localhost` in the container doesn't point to the host machine
- Build-time environment variables need actual values for Next.js static generation
- Runtime environment variables aren't substituted into static builds

**Fix:** Remove the dummy MongoDB URI and rely on runtime environment variables only.

```dockerfile
# ❌ Remove these lines (34-35):
ENV MONGODB_URI=mongodb://localhost:27017
ENV MONGODB_DB=team-flags-edu
ENV STUDENTS_COLLECTION=students

# Instead, use NEXT_PUBLIC_ variables or configure at runtime
```

---

#### 2. **Firebase Admin SDK fails at build time**

**File:** [lib/firebase/admin.ts](lib/firebase/admin.ts)  
**Issue:** The Firebase Admin SDK initialization happens at module load time:
```typescript
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}
```

**Problem:**
- If any API route imports this module, Next.js tries to initialize Firebase during build
- Firebase expects valid credentials during build
- The `SKIP_ENV_VALIDATION=true` in the Dockerfile is a workaround, not a solution

**Fix:** Lazy-load Firebase Admin SDK only when actually needed:

```typescript
import * as admin from 'firebase-admin';

let adminAuthInstance: admin.auth.Auth | null = null;
let adminAppInstance: admin.app.App | null = null;

function initializeAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }
  
  // Only initialize if credentials are present
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    console.warn('Firebase Admin credentials not configured');
    return null;
  }

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (!privateKey) {
    console.warn('Firebase Admin private key not found');
    return null;
  }

  try {
    adminAppInstance = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
  
  return adminAppInstance;
}

export function getAdminAuth(): admin.auth.Auth {
  const app = initializeAdminApp();
  if (!app) {
    throw new Error('Firebase Admin is not initialized. Ensure all required environment variables are set.');
  }
  return admin.auth(app);
}

export function getAdminApp(): admin.app.App {
  const app = initializeAdminApp();
  if (!app) {
    throw new Error('Firebase Admin is not initialized.');
  }
  return app;
}

// Keep for backwards compatibility
export const adminAuth = getAdminAuth();
export const adminApp = getAdminApp();
```

---

#### 3. **No docker-compose.yml for local development**

**Issue:** There's no `docker-compose.yml` file to orchestrate MongoDB + Next.js app locally.

**Fix:** Create [docker-compose.yml](docker-compose.yml):

```yaml
version: '3.8'

services:
  # MongoDB database
  mongodb:
    image: mongo:7-alpine
    container_name: team-flags-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  # Next.js application
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: team-flags-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://admin:password@mongodb:27017/team-flags-edu?authSource=admin
      MONGODB_DB: team-flags-edu
      STUDENTS_COLLECTION: chas_2026_students
      # Firebase (optional - only if configured)
      # NEXT_PUBLIC_FIREBASE_API_KEY: ${NEXT_PUBLIC_FIREBASE_API_KEY}
      # NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
      # FIREBASE_ADMIN_PROJECT_ID: ${FIREBASE_ADMIN_PROJECT_ID}
    depends_on:
      mongodb:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mongodb_data:

networks:
  default:
    name: team-flags-network
```

---

### 🟡 IMPORTANT ISSUES

#### 4. **Missing .env.local support in Dockerfile**

**File:** [Dockerfile](Dockerfile)  
**Issue:** The `.dockerignore` file excludes all `.env*` files:
```ignore
.env
.env*.local
```

This means:
- Local `.env.local` won't be copied into the image
- Users need to pass all variables via `-e` flags or `--env-file`
- Not user-friendly for local development

**Fix:** For local development, create a `.env.docker` file:

```dotenv
# .env.docker - Used with: docker-compose -f docker-compose.yml or docker run --env-file
NODE_ENV=development
MONGODB_URI=mongodb://admin:password@mongodb:27017/team-flags-edu?authSource=admin
MONGODB_DB=team-flags-edu
STUDENTS_COLLECTION=chas_2026_students
NEXT_TELEMETRY_DISABLED=1
```

Update `.dockerignore` to allow this file:
```ignore
# Environment variables (specific files only)
.env
.env.local
.env.production
# But allow the docker-specific env file
!.env.docker
```

---

#### 5. **next.config.ts skips type checking**

**File:** [next.config.ts](next.config.ts)  
**Issue:**
```typescript
typescript: {
  ignoreBuildErrors: true,
},
```

**Problem:**
- Hides real TypeScript errors
- Makes debugging harder
- Not suitable for production

**Fix:** Only ignore specific errors or remove this setting:

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  // Remove the typescript ignoreBuildErrors in production
  // Only use if absolutely necessary for specific errors:
  // typescript: {
  //   tsconfigPath: './tsconfig.json',
  // },
};
```

---

#### 6. **Firebase client initialization not resilient**

**File:** [lib/firebase/config.ts](lib/firebase/config.ts)  
**Issue:** The initialization silently fails if credentials are missing:
```typescript
if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
} else {
  console.log('ℹ️ Firebase credentials not configured...');
}
```

**Problem:**
- Components may still try to use Firebase even if not initialized
- `getAuthInstance()` throws an error at runtime instead of build-time

**Fix:** Add better error handling:

```typescript
export function getAuthInstance(): Auth {
  if (!auth) {
    throw new Error(
      'Firebase Auth is not initialized. Make sure:\n' +
      '1. You are calling this from client-side code\n' +
      '2. Firebase credentials are configured in .env.local\n' +
      '3. Required env vars: NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_PROJECT_ID'
    );
  }
  return auth;
}
```

---

### 🟠 MODERATE ISSUES

#### 7. **MongoDB connection string not validated in Dockerfile**

**File:** [Dockerfile](Dockerfile) + [lib/mongodb.ts](lib/mongodb.ts)  
**Issue:** If `MONGODB_URI` is not set at runtime, the app crashes:
```typescript
if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}
```

**Fix:** Add graceful degradation and better error messages:

```typescript
export async function getDatabase(): Promise<Db> {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      'MongoDB connection failed: MONGODB_URI environment variable not set.\n' +
      'For local development with Docker Compose, this should be:\n' +
      'mongodb://admin:password@mongodb:27017/team-flags-edu?authSource=admin'
    );
  }

  try {
    const client = await clientPromise;
    const dbName = process.env.MONGODB_DB || 'team-flags-edu';
    return client.db(dbName);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw new Error(
      'MongoDB connection error. Check:\n' +
      '1. MongoDB is running and accessible\n' +
      '2. MONGODB_URI is correct\n' +
      '3. Database credentials are valid'
    );
  }
}
```

---

#### 8. **No health checks in Dockerfile**

**File:** [Dockerfile](Dockerfile)  
**Issue:** No `HEALTHCHECK` directive to verify the app is running.

**Fix:** Add to Dockerfile:

```dockerfile
# Add before the final CMD
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1
```

---

#### 9. **API Routes depend on Firebase without fallback**

**File:** [app/api/auth/session/route.ts](app/api/auth/session/route.ts)  
**Issue:** This route directly imports and uses Firebase Admin:
```typescript
import { adminAuth } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  const decodedToken = await adminAuth.verifyIdToken(idToken);
  // ...
}
```

If Firebase isn't initialized, this breaks.

**Fix:** Add try-catch and proper error handling:

```typescript
export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      // ... rest of code
    } catch (firebaseError) {
      return NextResponse.json(
        { error: 'Firebase authentication not configured. Contact administrator.' },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
  }
}
```

---

### 🔵 RECOMMENDATIONS FOR IMPROVEMENT

#### 10. **Add development Dockerfile variant**

Create [Dockerfile.dev](Dockerfile.dev) for faster local iteration:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Run dev server
EXPOSE 3000

CMD ["npm", "run", "dev"]
```

Use with Docker Compose:
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev  # Use dev Dockerfile
```

---

#### 11. **Create setup documentation**

Create [DOCKER_LOCAL_SETUP.md](DOCKER_LOCAL_SETUP.md) with clear instructions:

```markdown
# Local Development with Docker

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd team-flags-edu
   ```

2. **Start containers**
   ```bash
   docker-compose up -d
   ```

3. **Verify MongoDB is ready**
   ```bash
   docker-compose logs mongodb
   ```

4. **Verify app is running**
   ```bash
   curl http://localhost:3000
   ```

## Troubleshooting

### Port 3000 already in use
```bash
docker-compose down
# Or use a different port:
docker-compose -p myapp up
```

### MongoDB connection failed
```bash
# Check MongoDB logs
docker-compose logs mongodb

# Verify connection
docker exec team-flags-mongodb mongosh --authenticationDatabase admin -u admin -p password
```

### Clean everything
```bash
docker-compose down -v  # Removes volumes
```
```

---

#### 12. **Add package-lock.json to Git**

**Issue:** The Dockerfile copies `package-lock.json*` (optional), but it's better to require it:

```dockerfile
# Change from:
COPY package.json package-lock.json* ./

# To:
COPY package.json package-lock.json ./
```

This ensures reproducible builds.

---

#### 13. **Secure MongoDB credentials**

**Issue:** `docker-compose.yml` has hardcoded credentials.

**Fix:** Use `.env` file for secrets:

Create [.env.compose](/.env.compose):
```dotenv
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=secure_password_here
MONGODB_URI=mongodb://admin:secure_password_here@mongodb:27017/team-flags-edu?authSource=admin
```

Update `docker-compose.yml`:
```yaml
services:
  mongodb:
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
  app:
    environment:
      MONGODB_URI: ${MONGODB_URI}
```

Run with:
```bash
docker-compose --env-file .env.compose up
```

---

## Implementation Checklist

- [ ] **Fix Dockerfile hardcoded MongoDB URI** (Remove dummy variables)
- [ ] **Lazy-load Firebase Admin SDK** (Fix build-time initialization)
- [ ] **Create docker-compose.yml** (For local development with MongoDB)
- [ ] **Create .env.docker** (Environment variables for Docker)
- [ ] **Update .dockerignore** (Allow .env.docker)
- [ ] **Add health checks** (Both in Dockerfile and docker-compose)
- [ ] **Improve error messages** (MongoDB, Firebase, environment vars)
- [ ] **Add Dockerfile.dev** (For development)
- [ ] **Create DOCKER_LOCAL_SETUP.md** (User guide)
- [ ] **Test locally with Docker Compose** (End-to-end validation)

---

## Testing Commands

Once fixed, verify with:

```bash
# Build and start
docker-compose up -d

# Check container health
docker-compose ps

# View logs
docker-compose logs -f app

# Test API
curl http://localhost:3000
curl http://localhost:3000/api/stats

# Stop and cleanup
docker-compose down -v
```

---

## Files to Create/Modify

| File | Action | Priority |
|------|--------|----------|
| [docker-compose.yml](docker-compose.yml) | Create | Critical |
| [.env.docker](.env.docker) | Create | Critical |
| [Dockerfile](Dockerfile) | Modify (remove hardcoded URIs) | Critical |
| [lib/firebase/admin.ts](lib/firebase/admin.ts) | Modify (lazy-load) | Critical |
| [Dockerfile.dev](Dockerfile.dev) | Create | High |
| [DOCKER_LOCAL_SETUP.md](DOCKER_LOCAL_SETUP.md) | Create | High |
| [.dockerignore](.dockerignore) | Modify (allow .env.docker) | Medium |
| [next.config.ts](next.config.ts) | Modify (remove ignoreBuildErrors) | Medium |
| [lib/mongodb.ts](lib/mongodb.ts) | Modify (improve errors) | Medium |

---

## Summary

The project has solid Docker infrastructure but needs fixes for local development:

1. **Build-time issues** prevent the Docker build from completing
2. **Firebase Admin SDK** initialization needs to be lazy-loaded
3. **Docker Compose setup** is missing entirely
4. **Error handling** could be more helpful for debugging

With these fixes, developers can:
- ✅ Build the Docker image successfully
- ✅ Run locally with `docker-compose up`
- ✅ Get clear error messages if something is misconfigured
- ✅ Develop with both local and Docker setups seamlessly

