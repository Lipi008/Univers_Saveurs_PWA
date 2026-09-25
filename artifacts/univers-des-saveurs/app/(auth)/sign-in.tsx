import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BrandLogo } from '@/components/BrandLogo';
import { setSessionToken } from '@/utils/sessionStorage';

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMessage('');
    setBusy(true);
    try {
      const api = process.env.EXPO_PUBLIC_API_URL || '';
      const response = await fetch(`${api}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username: username.trim(), password }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || 'Identifiants incorrects'); return; }
      await setSessionToken(data.token);
      router.replace('/(tabs)');
    } catch { setMessage('Connexion impossible. Vérifiez votre réseau.'); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrandLogo />
        <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>L’UNIVERS DES SAVEURS</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Bon retour parmi nous</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Connectez-vous avec votre compte local.</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Nom d'utilisateur</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} placeholder="votre_identifiant" placeholderTextColor={colors.mutedForeground} />
        <Text style={[styles.label, { color: colors.foreground }]}>Mot de passe</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} placeholder="Votre mot de passe" placeholderTextColor={colors.mutedForeground} />
        <Pressable onPress={() => { void submit(); }} disabled={!username || !password || busy} style={[styles.button, { backgroundColor: colors.primary }, (!username || !password || busy) && styles.disabled]}>
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Se connecter</Text>}
        </Pressable>
        <Link href="/(auth)/forgot-password" asChild>
          <Pressable style={styles.textButton}>
            <Text style={[styles.textButtonText, { color: colors.primary }]}>Mot de passe oublié ?</Text>
          </Pressable>
        </Link>
        {!!message && <Text style={styles.error}>{message}</Text>}
        <View style={styles.footer}><Text style={[styles.footerText, { color: colors.mutedForeground }]}>Premier accès ? </Text><Link href="/(auth)/sign-up" asChild><Pressable><Text style={[styles.link, { color: colors.primary }]}>Configurer le compte</Text></Pressable></Link></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, maxWidth: 520, width: '100%', alignSelf: 'center' },
  eyebrow: { textAlign: 'center', fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { textAlign: 'center', fontSize: 27, lineHeight: 33, fontWeight: '800', marginTop: 12 },
  subtitle: { textAlign: 'center', fontSize: 14, marginTop: 8, marginBottom: 28 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 13 },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  button: { minHeight: 51, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  error: { color: '#B42318', fontSize: 12, lineHeight: 18, marginTop: 13, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 13 },
  link: { fontSize: 13, fontWeight: '800' },
  textButton: { alignItems: 'center', marginTop: 16 },
  textButtonText: { fontSize: 13, fontWeight: '700' },
});