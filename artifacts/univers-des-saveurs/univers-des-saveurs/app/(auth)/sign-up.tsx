import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BrandLogo } from '@/components/BrandLogo';
import { setSessionToken } from '@/utils/sessionStorage';

export default function SignUpScreen() {
  const colors = useColors(); const router = useRouter();
  const [username, setUsername] = useState(''); const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMessage('');
    try {
      const api = process.env.EXPO_PUBLIC_API_URL || '';
      const response = await fetch(`${api}/api/auth/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username, firstName, lastName, password }) });
      const data = await response.json(); if (!response.ok) { setMessage(data.error || 'Configuration impossible'); return; }
      await setSessionToken(data.token);
      router.replace('/(tabs)');
    } catch { setMessage('Connexion impossible.'); } finally { setBusy(false); }
  };
  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content}>
    <BrandLogo />
    <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>PREMIÈRE CONFIGURATION</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Créer le compte gérant</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Ce premier compte devient administrateur.</Text>
    {([['Prénom', firstName, setFirstName], ['Nom', lastName, setLastName], ["Nom d'utilisateur", username, setUsername], ['Mot de passe', password, setPassword]] as const).map(([label, value, setter]) => <View key={label}><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={setter} secureTextEntry={label === 'Mot de passe'} autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} /></View>)}
    <Pressable onPress={() => { void submit(); }} disabled={busy || !username || !password || !firstName || !lastName} style={[styles.button, { backgroundColor: colors.primary }, (busy || !username || !password || !firstName || !lastName) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Créer l’administrateur</Text>}</Pressable>
    {!!message && <Text style={styles.error}>{message}</Text>}<View style={styles.footer}><Text style={[styles.footerText, { color: colors.mutedForeground }]}>Déjà configuré ? </Text><Link href="/(auth)/sign-in" asChild><Pressable><Text style={[styles.link, { color: colors.primary }]}>Se connecter</Text></Pressable></Link></View>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ screen:{flex:1}, content:{flexGrow:1,justifyContent:'center',padding:28,maxWidth:520,width:'100%',alignSelf:'center'},eyebrow:{textAlign:'center',fontSize:10,letterSpacing:1.5,fontWeight:'800'},title:{textAlign:'center',fontSize:27,lineHeight:33,fontWeight:'800',marginTop:12},subtitle:{textAlign:'center',fontSize:14,marginTop:8,marginBottom:20},label:{fontSize:12,fontWeight:'700',marginBottom:7,marginTop:10},input:{minHeight:48,borderRadius:13,borderWidth:1,paddingHorizontal:14,fontSize:15},button:{minHeight:51,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:24},buttonText:{fontSize:14,fontWeight:'800'},disabled:{opacity:.55},error:{color:'#B42318',fontSize:12,lineHeight:18,marginTop:13,textAlign:'center'},footer:{flexDirection:'row',justifyContent:'center',marginTop:24},footerText:{fontSize:13},link:{fontSize:13,fontWeight:'800'}});