import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { Redirect } from 'expo-router';
import { useAuth, useLocalSession } from '@/hooks/useLocalAuth';
import { getGetAuthMeQueryKey, useGetAuthMe } from '@workspace/api-client-react';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
function NativeTabLayout({ canManage }: { canManage: boolean }) {
  return (
    <NativeTabs>
      {canManage ? (
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
          <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ) : null}
      <NativeTabs.Trigger name="vente">
        <NativeTabs.Trigger.Icon sf={{ default: 'cart', selected: 'cart.fill' }} />
        <NativeTabs.Trigger.Label>Ventes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {canManage ? (
        <>
          <NativeTabs.Trigger name="stocks">
            <NativeTabs.Trigger.Icon sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }} />
            <NativeTabs.Trigger.Label>Stocks</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="team">
            <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
            <NativeTabs.Trigger.Label>Équipe</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </>
      ) : null}
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Icon sf={{ default: 'ellipsis', selected: 'ellipsis.circle.fill' }} />
        <NativeTabs.Trigger.Label>Plus</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ canManage }: { canManage: boolean }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      initialRouteName={canManage ? 'index' : 'vente'}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          href: canManage ? undefined : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen name="vente" options={{ title: 'Ventes', tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={21} color={color} /> }} />
      <Tabs.Screen name="stocks" options={{ title: 'Stocks', href: canManage ? undefined : null, tabBarIcon: ({ color }) => <Feather name="package" size={21} color={color} /> }} />
      <Tabs.Screen name="team" options={{ title: 'Équipe', href: canManage ? undefined : null, tabBarIcon: ({ color }) => <Feather name="users" size={21} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: 'Plus', tabBarIcon: ({ color }) => <Feather name="menu" size={21} color={color} /> }} />
      <Tabs.Screen name="tables" options={{ href: null }} />
      <Tabs.Screen name="caisse" options={{ href: null }} />
      <Tabs.Screen name="rapports" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useLocalSession();
  const pathname = usePathname();
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const [tokenAttempt, setTokenAttempt] = useState(0);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    let active = true;
    setTokenReady(false);
    setTokenError(false);
    if (!isLoaded || !isSignedIn) {
      return () => {
        active = false;
      };
    }
    if (Platform.OS === 'web') {
      setTokenReady(true);
      return () => {
        active = false;
      };
    }
    const acquireToken = async () => {
      for (let attempt = 0; attempt < 5 && active; attempt += 1) {
        try {
          const token = await getTokenRef.current();
          if (token) {
            if (active) setTokenReady(true);
            return;
          }
        } catch {
          // Clerk can briefly be ready before its native session is hydrated.
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      if (active) setTokenError(true);
    };
    void acquireToken();
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, tokenAttempt]);

  const authMe = useGetAuthMe({
    query: {
      queryKey: getGetAuthMeQueryKey(),
      enabled: isLoaded && !!isSignedIn && tokenReady,
      staleTime: 60_000,
      retry: false,
    },
  });

  const retryToken = useCallback(() => {
    setTokenError(false);
    setTokenReady(false);
    setTokenAttempt((attempt) => attempt + 1);
  }, []);

  const retryPermissions = useCallback(async () => {
    try {
      await getTokenRef.current({ skipCache: true });
    } catch {
      // The refetch below will expose a safe network/authentication message.
    }
    await authMe.refetch();
  }, [authMe]);

  const authErrorStatus =
    authMe.error && typeof authMe.error === 'object' && 'status' in authMe.error
      ? Number(authMe.error.status)
      : undefined;
  const authErrorText =
    authErrorStatus === 401
      ? 'Votre session a expiré ou n’est plus valide. Réessayez, puis reconnectez-vous si nécessaire.'
      : authErrorStatus === 403
        ? 'Votre compte existe, mais son accès a été désactivé.'
        : authMe.isError
          ? 'Le téléphone n’arrive pas à joindre le serveur. Vérifiez la connexion Internet puis réessayez.'
          : '';

  if (!isLoaded || (isSignedIn && !tokenReady && !tokenError)) {
    return <View style={styles.authLoading}><ActivityIndicator color="#7B2430" /></View>;
  }
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (tokenError) {
    return (
      <View style={styles.authError}>
        <Text style={styles.authErrorTitle}>Connexion sécurisée indisponible</Text>
        <Text style={styles.authErrorText}>Nous n’avons pas pu récupérer votre session. Réessayez ou déconnectez-vous.</Text>
        <Pressable onPress={retryToken} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
        <Pressable onPress={() => { void signOut(); }} style={styles.signOutButton}>
          <Text style={styles.signOutButtonText}>Se déconnecter</Text>
        </Pressable>
      </View>
    );
  }
  if (authMe.isLoading) {
    return <View style={styles.authLoading}><ActivityIndicator color="#7B2430" /></View>;
  }
  if (authErrorStatus === 401) return <Redirect href="/(auth)/sign-in" />;
  if (authMe.isError || !authMe.data) {
    return (
      <View style={styles.authError}>
        <Text style={styles.authErrorTitle}>Accès indisponible</Text>
        <Text style={styles.authErrorText}>{authErrorText || 'Vos autorisations n’ont pas pu être vérifiées.'}</Text>
        <Pressable onPress={() => { void retryPermissions(); }} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
        <Pressable onPress={() => { void signOut(); }} style={styles.signOutButton}>
          <Text style={styles.signOutButtonText}>Se déconnecter</Text>
        </Pressable>
      </View>
    );
  }
  if (authMe.data.mustResetPassword) return <Redirect href="/reset-password" />;
  const canManage = authMe.data.role === 'admin' || authMe.data.role === 'manager';
  if (!canManage && pathname !== '/vente' && pathname !== '/more') {
    return <Redirect href="/vente" />;
  }

  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return <NativeTabLayout canManage={canManage} />;
  }
  return <ClassicTabLayout canManage={canManage} />;
}

const styles = StyleSheet.create({
  authLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F1E4' },
  authError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F8F1E4' },
  authErrorTitle: { color: '#2B1813', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  authErrorText: { color: '#72574B', fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center', maxWidth: 380 },
  retryButton: { marginTop: 22, minWidth: 160, minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7B2430' },
  retryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  signOutButton: { marginTop: 14, padding: 10 },
  signOutButtonText: { color: '#7B2430', fontSize: 13, fontWeight: '700' },
});
