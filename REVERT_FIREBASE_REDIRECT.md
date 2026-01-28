# Revert: Firebase Redirect Temporary Disable

This project temporarily disables the automatic redirect to `/status` when Firebase is not configured. Use this file to revert the change and restore normal behavior.

Why this was changed
- For local UI inspection without a configured Firebase project, the redirect was commented out so you can browse pages and inspect layout/components.

Files changed
- `lib/auth/hooks.ts`: the line that does `router.push(firebaseConfigured ? '/login' : '/status')` has been commented out.

How to revert the change
1. Open `lib/auth/hooks.ts`.
2. Find the commented line and restore it by removing the leading `//`:

```diff
-      // router.push(firebaseConfigured ? '/login' : '/status');
+      router.push(firebaseConfigured ? '/login' : '/status');
```

3. Save the file.

Restarting the dev server
- If you're running the Next dev server locally, stop it and restart:

```bash
# Stop (if running in a terminal): Ctrl+C
npm run dev
```

- If running in Docker, rebuild/restart compose:

```bash
docker compose down
docker compose up -d --build
```

Notes
- Reverting restores the original behavior: unauthenticated users will be redirected to `/status` when Firebase is not configured.
- This change is local only and should be reverted before committing or opening a PR unless you intentionally want the change persisted.

If you want, I can revert this change and restart your dev server for you — tell me which you'd prefer.