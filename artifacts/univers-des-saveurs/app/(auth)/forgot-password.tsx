import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  return <View style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.title, { color: colors.foreground }]}>Mot de passe oublié ?</Text><Text style={[styles.text, { color: colors.mutedForeground }]}>Contactez le gérant afin qu’il définisse un nouveau mot de passe temporaire pour votre compte.</Text><Link href="/(auth)/sign-in" asChild><Pressable style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>Retour à la connexion</Text></Pressable></Link></View>;
}
const styles = StyleSheet.create({ screen:{flex:1,justifyContent:'center',padding:28},title:{fontSize:26,fontWeight:'800',textAlign:'center'},text:{fontSize:14,lineHeight:21,textAlign:'center',marginTop:12},button:{alignSelf:'center',padding:15,borderRadius:12,marginTop:24} });