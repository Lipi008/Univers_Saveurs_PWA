import { Redirect, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { getSessionToken } from '@/utils/sessionStorage';

export default function AuthLayout() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    getSessionToken().then((token) => setSignedIn(Boolean(token)));
  }, []);
  if (signedIn) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}