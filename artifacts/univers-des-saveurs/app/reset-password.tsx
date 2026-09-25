import { useAuth } from '@/hooks/useLocalAuth';
import { useCompletePasswordReset, getGetAuthMeQueryKey, useGetAuthMe } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { router, Redirect } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BrandLogo } from '@/components/BrandLogo';

function clerkErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'errors' in error) {
    const errors = (error as { errors?: Array<{ message?: string }> }).errors;
    const message = errors?.find((item) => item.message)?.message;
    if (message) return message;
  }
  return error instanceof Error && error.message ? error.message : 'La modification du mot de passe a échoué.';
}

export default function ResetPasswordScreen() {
  const colors = useColors();
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const completeReset = useCompletePasswordReset();
  const authMe = useGetAuthMe({
    query: {
      queryKey: getGetAuthMeQueryKey(),
      enabled: isLoaded && !!isSignedIn,
      staleTime: 0,
    },
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  if (!isLoaded || (isSignedIn && authMe.isLoading)) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (authMe.data && !authMe.data.mustResetPassword) return <Redirect href="/(tabs)" />;
  if (authMe.isError) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><Text style={[styles.error, { color: colors.foreground }]}>Votre compte n’a pas pu être vérifié. Vérifiez votre connexion puis réessayez.</Text><Pressable onPress={() => { void authMe.refetch(); }}><Text style={[styles.link, { color: colors.primary }]}>Réessayer</Text></Pressable></View>;
  }

  const submit = async () => {
    setError('');
    if (!currentPassword) {
      setError('Saisissez votre mot de passe temporaire.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await completeReset.mutateAsync({ data: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      await queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
      router.replace('/(tabs)');
    } catch (submitError) {
      setError(clerkErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrandLogo />
        <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>PREMIÈRE CONNEXION</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Choisissez un nouveau mot de passe</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Votre mot de passe temporaire doit être remplacé avant d’accéder à l’application.</Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Mot de passe temporaire</Text>
        <View style={styles.inputRow}>
          <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry={!showCurrent} autoCapitalize="none" style={[styles.input, styles.inputWithAction, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
          <Pressable onPress={() => setShowCurrent((visible) => !visible)} style={styles.showButton}><Text style={[styles.showText, { color: colors.primary }]}>{showCurrent ? 'Masquer' : 'Afficher'}</Text></Pressable>
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>Nouveau mot de passe</Text>
        <View style={styles.inputRow}>
          <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showNew} autoCapitalize="none" style={[styles.input, styles.inputWithAction, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
          <Pressable onPress={() => setShowNew((visible) => !visible)} style={styles.showButton}><Text style={[styles.showText, { color: colors.primary }]}>{showNew ? 'Masquer' : 'Afficher'}</Text></Pressable>
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>8 caractères minimum.</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Confirmer le nouveau mot de passe</Text>
        <TextInput value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => { void submit(); }} disabled={busy} style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Continuer</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, maxWidth: 520, width: '100%', alignSelf: 'center' },
  eyebrow: { textAlign: 'center', fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { textAlign: 'center', fontSize: 26, lineHeight: 33, fontWeight: '800', marginTop: 12 },
  subtitle: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 13 },
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  inputWithAction: { paddingRight: 82 },
  showButton: { position: 'absolute', right: 10, padding: 8 },
  showText: { fontSize: 11, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 6 },
  button: { minHeight: 51, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 14, fontWeight: '800' },
  error: { color: '#B42318', fontSize: 12, lineHeight: 18, marginTop: 13, textAlign: 'center' },
  link: { marginTop: 16, fontWeight: '800' },
});