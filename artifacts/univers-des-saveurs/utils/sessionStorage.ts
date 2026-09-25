import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_KEY = 'pos_session';

export async function getSessionToken() {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(SESSION_KEY);
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function setSessionToken(token: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(SESSION_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearSessionToken() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}