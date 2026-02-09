import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

export default function AuthWrapper({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Define which pages don't require login (just the home/login page)
  const publicPaths = ['/'];
  const isPublicPath = publicPaths.includes(router.pathname);

  useEffect(() => {
    if (!loading && !user && !isPublicPath) {
      router.replace('/');
    }
  }, [user, loading, router, isPublicPath]);

  // 1. Show nothing while checking auth state
  if (loading) {
    return null; // Or a global loading spinner
  }

  // 2. If it's a private page and no user, return nothing (redirecting...)
  if (!user && !isPublicPath) {
    return null;
  }

  // 3. Otherwise, show the app
  return children;
}
