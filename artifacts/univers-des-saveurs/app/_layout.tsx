import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { OrderProvider } from '@/context/OrderContext';
import { OfflineSyncProvider } from '@/context/OfflineSyncContext';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { getSessionToken } from '@/utils/sessionStorage';

// Prevent the splash screen from auto-hiding before asset loading is complete.
if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}

const queryClient = new QueryClient();
const domain = process.env.EXPO_PUBLIC_DOMAIN;
const apiUrl = process.env.EXPO_PUBLIC_API_URL || (domain ? `https://${domain}` : '');
setBaseUrl(apiUrl || null);
setAuthTokenGetter(getSessionToken);

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      if (Platform.OS !== 'web') {
        SplashScreen.hideAsync();
      }
    }
  }, [fontsLoaded, fontError]);

  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <OrderProvider>
                <OfflineSyncProvider>
                  <RootLayoutNav />
                </OfflineSyncProvider>
              </OrderProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
