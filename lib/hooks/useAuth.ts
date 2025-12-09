import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export interface User {
  uid: number;
  username: string;
}

export interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
}

export function useAuth(redirectToLogin = true) {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoggedIn: false,
    isLoading: true,
  });

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      if (data.isLoggedIn && data.user) {
        setAuthState({
          user: data.user,
          isLoggedIn: true,
          isLoading: false,
        });
      } else {
        setAuthState({
          user: null,
          isLoggedIn: false,
          isLoading: false,
        });

        if (redirectToLogin && router.pathname !== '/') {
          router.push('/');
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthState({
        user: null,
        isLoggedIn: false,
        isLoading: false,
      });

      // Only redirect if we're not already on the login page
      if (redirectToLogin && router.pathname !== '/') {
        router.push('/');
      }
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setAuthState({
        user: null,
        isLoggedIn: false,
        isLoading: false,
      });
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return {
    ...authState,
    logout,
    checkAuth,
  };
}

