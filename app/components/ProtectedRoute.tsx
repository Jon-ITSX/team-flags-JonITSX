'use client';

import { useRequireAuth } from '@/lib/auth/hooks';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();

  // If Firebase isn't configured, allow access for local UI inspection
  const firebaseConfigured = !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );

  // Show loading state during auth check OR when redirecting unauthenticated users
  // Only block when Firebase is configured; otherwise allow local inspection
  if (loading || (!user && firebaseConfigured)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-300 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
