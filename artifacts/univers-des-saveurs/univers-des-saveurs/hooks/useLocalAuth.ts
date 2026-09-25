import { useEffect, useState } from 'react';
import { clearSessionToken, getSessionToken } from '@/utils/sessionStorage';

export function useAuth() {
  const [isSignedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    getSessionToken().then((token) => setSignedIn(Boolean(token)));
  }, []);
  return {
    isLoaded: isSignedIn !== undefined,
    isSignedIn: Boolean(isSignedIn),
    getToken: (_options?: unknown) => getSessionToken(),
  };
}

export function useLocalSession() {
  return {
    signOut: async () => {
      const token = await getSessionToken();
      const api = process.env.EXPO_PUBLIC_API_URL || '';
      try {
        await fetch(`${api}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
      } catch {
        // Clear local credentials even if the network is unavailable.
      }
      await clearSessionToken();
    },
  };
}