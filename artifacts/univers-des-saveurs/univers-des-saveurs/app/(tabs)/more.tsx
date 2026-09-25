import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth, useLocalSession } from '@/hooks/useLocalAuth';
import { getGetAdminSalesQueryKey, getGetAuthMeQueryKey, getGetAdminReportQueryKey, getGetSalesEpochQueryKey, useCompletePasswordReset, useGetAuthMe, useResetSales } from '@workspace/api-client-react';
import { useOfflineSync } from '@/context/OfflineSyncContext';

const links = [
  { label: 'Tables & espaces', detail: 'Occupation de la salle', icon: 'grid' as const, route: '/tables' as const },
  { label: 'Caisse du jour', detail: 'Encaissements et clôture', icon: 'credit-card' as const, route: '/caisse' as const },
  { label: 'Rapports', detail: 'Performances et tendances', icon: 'bar-chart-2' as const, route: '/rapports' as const },
];

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const resetSales = useResetSales();
  const changePassword = useCompletePasswordReset();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [resetVisible, setResetVisible] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const { isSignedIn } = useAuth();
  const { signOut } = useLocalSession();
  const { isOnline, pendingCount, failedCount, syncing, syncNow } = useOfflineSync();
  const { data: appUser } = useGetAuthMe({ query: { queryKey: getGetAuthMeQueryKey(), enabled: !!isSignedIn, staleTime: 60_000 } });
  const canManage = appUser?.role === 'admin' || appUser?.role === 'manager';
  const canReset = appUser?.role === 'admin' && appUser.username?.toLowerCase() === 'marlon';
  const submitPasswordChange = async () => {
    if (changePassword.isPending) return;
    if (!oldPassword || newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword) || newPassword === oldPassword) {
      setPasswordError('Saisis ton ancien mot de passe et un nouveau différent, avec 8 caractères, une lettre et un chiffre.'); return;
    }
    if (newPassword !== passwordConfirmation) { setPasswordError('Les nouveaux mots de passe ne correspondent pas.'); return; }
    setPasswordError('');
    try {
      await changePassword.mutateAsync({ data: { currentPassword: oldPassword, newPassword } });
      setOldPassword(''); setNewPassword(''); setPasswordConfirmation('');
      setPasswordVisible(false);
      setPasswordNotice('Ton mot de passe a été modifié. Les autres sessions de ce compte ont été déconnectées.');
      await queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
    } catch (error) { setPasswordError(error instanceof Error ? error.message : 'Mot de passe non modifié. Réessaie.'); }
  };
  const confirmReset = async () => {
    if (confirmation.trim() !== 'EFFACER LES ESSAIS' || resetSales.isPending || pendingCount || failedCount || !isOnline) return;
    try {
      const result = await resetSales.mutateAsync({ data: { confirmation: 'EFFACER LES ESSAIS' } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAdminSalesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetAdminReportQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetSalesEpochQueryKey() }),
      ]);
      setResetVisible(false);
      setConfirmation('');
      setResetMessage(`${result.deletedSales} vente${result.deletedSales > 1 ? 's' : ''} d’essai effacée${result.deletedSales > 1 ? 's' : ''}. Le prochain reçu d’essai sera ESSAI-000001.`);
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : 'Remise à zéro impossible. Réessayez.');
    }
  };
  const visibleLinks = canManage
    ? [...links, { label: 'Historique des ventes', detail: 'Toutes les ventes enregistrées', icon: 'clock' as const, route: '/history' as const }]
    : [];
  return <ScrollView style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]} contentContainerStyle={styles.content}>
    <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>OUTILS</Text><Text style={[styles.title, { color: colors.foreground }]}>Plus</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{canManage ? 'Retrouvez les autres outils de gestion.' : 'Synchronisez vos ventes ou déconnectez-vous.'}</Text>
    <View style={styles.links}>{visibleLinks.map((link) => <Pressable key={link.label} onPress={() => router.push(link.route)} style={[styles.link, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.linkIcon, { backgroundColor: colors.secondary }]}><Feather name={link.icon} size={19} color={colors.primary} /></View><View style={styles.linkCopy}><Text style={[styles.linkLabel, { color: colors.foreground }]}>{link.label}</Text><Text style={[styles.linkDetail, { color: colors.mutedForeground }]}>{link.detail}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>)}</View>
     <View style={[styles.syncCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.linkIcon, { backgroundColor: colors.secondary }]}><Feather name={isOnline ? 'wifi' : 'wifi-off'} size={19} color={colors.primary} /></View><View style={styles.linkCopy}><Text style={[styles.linkLabel, { color: colors.foreground }]}>Synchronisation {isOnline ? 'en ligne' : 'hors ligne'}</Text><Text style={[styles.linkDetail, { color: failedCount ? '#B42318' : colors.mutedForeground }]}>{failedCount ? `${failedCount} action${failedCount > 1 ? 's' : ''} à vérifier` : pendingCount ? `${pendingCount} vente${pendingCount > 1 ? 's' : ''} en attente` : 'Tout est à jour'}</Text></View><Pressable testID="sync-now" disabled={!isOnline || syncing || pendingCount === 0} onPress={() => { void syncNow(); }} style={[styles.syncButton, { borderColor: colors.primary, opacity: !isOnline || syncing || pendingCount === 0 ? 0.5 : 1 }]}><Text style={[styles.syncButtonText, { color: colors.primary }]}>{syncing ? '…' : 'Synchroniser'}</Text></Pressable></View>
     <Pressable testID="change-own-password" disabled={!isOnline} onPress={() => { setPasswordError(''); setPasswordNotice(''); setPasswordVisible(true); }} style={[styles.signOut, { borderColor: colors.border, marginTop: 12, opacity: isOnline ? 1 : 0.5 }]}><Feather name="lock" size={17} color={colors.primary} /><Text style={[styles.signOutText, { color: colors.primary }]}>Modifier mon mot de passe</Text></Pressable>
     {!!passwordNotice && <Text style={[styles.linkDetail, { color: colors.primary, marginTop: 9 }]}>{passwordNotice}</Text>}
     {canReset && <View style={[styles.resetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
       <Text style={[styles.linkLabel, { color: colors.foreground }]}>Nettoyer les ventes d’essai</Text>
       <Text style={[styles.linkDetail, { color: colors.mutedForeground }]}>Efface uniquement les ventes d’essai et recommence leurs reçus à 1. Les ventes réelles, les produits, les stocks et les comptes restent inchangés.</Text>
       <Text style={[styles.linkDetail, { color: colors.mutedForeground }]}>Synchronisez d’abord les ventes en attente sur tous les appareils.</Text>
       <Pressable testID="open-reset-sales" disabled={!isOnline || pendingCount > 0 || failedCount > 0} onPress={() => { setResetMessage(''); setConfirmation(''); setResetVisible(true); }} style={[styles.resetButton, { borderColor: colors.primary, opacity: !isOnline || pendingCount || failedCount ? 0.5 : 1 }]}>
         <Text style={[styles.signOutText, { color: colors.primary }]}>Effacer les ventes d’essai</Text>
       </Pressable>
     </View>}
     {!!resetMessage && <Text style={[styles.linkDetail, { color: colors.primary, marginTop: 10 }]}>{resetMessage}</Text>}
    <Pressable onPress={() => { void signOut().then(() => router.replace('/(auth)/sign-in')); }} style={[styles.signOut, { borderColor: colors.border }]}>
      <Feather name="log-out" size={17} color={colors.primary} />
      <Text style={[styles.signOutText, { color: colors.primary }]}>Se déconnecter</Text>
    </Pressable>
    <View style={[styles.footerCard, { backgroundColor: colors.primary }]}><Feather name="shield" size={21} color={colors.accent} /><View style={{ flex: 1 }}><Text style={styles.footerTitle}>L’Univers des Saveurs</Text><Text style={styles.footerText}>Version gestion 1.0</Text></View><Feather name="chevron-right" size={17} color="#F7EAD2" /></View>
     <Modal visible={resetVisible} transparent animationType="fade" onRequestClose={() => setResetVisible(false)}>
       <View style={styles.modalBackdrop}><View style={[styles.resetDialog, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Effacer les ventes d’essai ?</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Cette action est définitive pour les essais. Les ventes réelles, leurs reçus, les stocks et les produits ne seront pas modifiés.</Text>
          <Text style={[styles.subtitle, { color: colors.foreground }]}>Saisis EFFACER LES ESSAIS pour confirmer :</Text>
          <TextInput testID="reset-sales-confirmation" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" placeholder="EFFACER LES ESSAIS" placeholderTextColor={colors.mutedForeground} style={[styles.confirmInput, { color: colors.foreground, borderColor: colors.border }]} />
         {!!resetMessage && <Text style={{ color: '#B42318', marginTop: 8 }}>{resetMessage}</Text>}
         <View style={styles.dialogActions}>
           <Pressable onPress={() => setResetVisible(false)} style={styles.dialogAction}><Text style={{ color: colors.foreground }}>Annuler</Text></Pressable>
            <Pressable testID="confirm-reset-sales" disabled={confirmation.trim() !== 'EFFACER LES ESSAIS' || resetSales.isPending} onPress={() => { void confirmReset(); }} style={[styles.dialogAction, { backgroundColor: colors.primary, opacity: confirmation.trim() !== 'EFFACER LES ESSAIS' || resetSales.isPending ? 0.45 : 1 }]}>
             {resetSales.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Effacer</Text>}
           </Pressable>
         </View>
       </View></View>
     </Modal>
      <Modal visible={passwordVisible} transparent animationType="fade" onRequestClose={() => !changePassword.isPending && setPasswordVisible(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.resetDialog, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Modifier mon mot de passe</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Ton mot de passe actuel est nécessaire. Tes autres sessions seront déconnectées.</Text>
          <Text style={[styles.passwordLabel, { color: colors.foreground }]}>Mot de passe actuel</Text>
          <TextInput testID="current-password" value={oldPassword} onChangeText={setOldPassword} secureTextEntry autoCapitalize="none" style={[styles.confirmInput, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.passwordLabel, { color: colors.foreground }]}>Nouveau mot de passe</Text>
          <TextInput testID="new-password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" style={[styles.confirmInput, { color: colors.foreground, borderColor: colors.border }]} />
          <Text style={[styles.passwordLabel, { color: colors.foreground }]}>Confirmer le nouveau mot de passe</Text>
          <TextInput value={passwordConfirmation} onChangeText={setPasswordConfirmation} secureTextEntry autoCapitalize="none" style={[styles.confirmInput, { color: colors.foreground, borderColor: colors.border }]} />
          {!!passwordError && <Text style={{ color: '#B42318', marginTop: 8 }}>{passwordError}</Text>}
          <View style={styles.dialogActions}><Pressable disabled={changePassword.isPending} onPress={() => { setOldPassword(''); setNewPassword(''); setPasswordConfirmation(''); setPasswordVisible(false); }} style={styles.dialogAction}><Text style={{ color: colors.foreground }}>Annuler</Text></Pressable>
            <Pressable testID="save-own-password" disabled={changePassword.isPending} onPress={() => { void submitPasswordChange(); }} style={[styles.dialogAction, { backgroundColor: colors.primary, opacity: changePassword.isPending ? 0.5 : 1 }]}>{changePassword.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Enregistrer</Text>}</Pressable></View>
        </View></View>
      </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  passwordLabel: { fontSize: 12, fontWeight: '700', marginTop: 13 },
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 110 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 13 }, title: { fontSize: 28, fontWeight: '800', marginTop: 6 }, subtitle: { fontSize: 13, marginTop: 7 }, links: { marginTop: 23, gap: 9 }, link: { minHeight: 69, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, syncCard: { minHeight: 69, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }, linkIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, linkCopy: { flex: 1 }, linkLabel: { fontSize: 13, fontWeight: '800' }, linkDetail: { fontSize: 11, marginTop: 4 }, syncButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8 }, syncButtonText: { fontSize: 10, fontWeight: '800' }, signOut: { minHeight: 47, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 22 }, signOutText: { fontSize: 13, fontWeight: '800' }, footerCard: { borderRadius: 17, padding: 16, marginTop: 25, flexDirection: 'row', alignItems: 'center', gap: 11 }, footerTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, footerText: { color: '#F7EAD2', fontSize: 10, marginTop: 4 },
  resetCard: { borderWidth: 1, borderRadius: 15, padding: 15, gap: 8, marginTop: 12 },
  resetButton: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(43,24,19,0.5)', justifyContent: 'center', padding: 20 },
  resetDialog: { borderRadius: 18, padding: 20 },
  confirmInput: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 12 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 18 },
  dialogAction: { minHeight: 44, minWidth: 100, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});