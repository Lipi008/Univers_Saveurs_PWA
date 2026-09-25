import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import {
  getGetAdminTeamQueryKey,
  getGetAuthMeQueryKey,
  TeamMemberRole,
  useCreateAdminTeamMember,
  useDeleteAdminTeamMember,
  useGetAdminTeam,
  useGetAuthMe,
  useResetAdminTeamMemberPassword,
} from '@workspace/api-client-react';

const roleLabels: Record<TeamMemberRole, string> = { admin: 'Administrateur', manager: 'Gérant', cashier: 'Caisse', server: 'Serveur' };
const editableRoles = [{ value: 'manager' as const, label: 'Gérant' }, { value: 'cashier' as const, label: 'Caisse' }, { value: 'server' as const, label: 'Serveur' }];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function TeamScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const authMe = useGetAuthMe({ query: { queryKey: getGetAuthMeQueryKey(), staleTime: 60_000 } });
  const canManage = authMe.data?.role === 'admin' || authMe.data?.role === 'manager';
  const teamQuery = useGetAdminTeam({ includeInactive: true }, { query: { queryKey: getGetAdminTeamQueryKey({ includeInactive: true }), enabled: canManage, staleTime: 30_000 } });
  const createMember = useCreateAdminTeamMember();
  const deleteMember = useDeleteAdminTeamMember();
  const resetMemberPassword = useResetAdminTeamMemberPassword();
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'manager' | 'cashier' | 'server'>('server');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const members = teamQuery.data ?? [];
  const canResetStaffPassword = authMe.data?.role === 'admin' && authMe.data.username?.toLowerCase() === 'marlon';
  const submitPasswordReset = async () => {
    if (!resetTarget || resetMemberPassword.isPending) return;
    if (temporaryPassword.length < 8 || !/[A-Za-z]/.test(temporaryPassword) || !/\d/.test(temporaryPassword)) {
      setResetError('Au moins 8 caractères, une lettre et un chiffre.'); return;
    }
    if (temporaryPassword !== confirmTemporaryPassword) { setResetError('Les mots de passe ne correspondent pas.'); return; }
    setResetError('');
    try {
      await resetMemberPassword.mutateAsync({ id: resetTarget.id, data: { password: temporaryPassword } });
      await queryClient.invalidateQueries({ queryKey: getGetAdminTeamQueryKey() });
      setResetNotice(`Mot de passe temporaire défini pour ${resetTarget.name}. Communique-le en privé ; cette personne devra le remplacer à sa prochaine connexion.`);
      setTemporaryPassword('');
      setConfirmTemporaryPassword('');
      setResetTarget(null);
    } catch (error) { setResetError(errorMessage(error, 'Réessayez.')); }
  };
  const activeCount = useMemo(() => members.filter((member) => member.active).length, [members]);
  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setPassword('');
    setRole('server');
    setShowPassword(false);
    setFormError('');
  };
  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) { setFormError('Le prénom et le nom sont obligatoires.'); return; }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setFormError('Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.'); return; }
    setFormError('');
    try {
      const member = await createMember.mutateAsync({ data: { firstName: firstName.trim(), lastName: lastName.trim(), password, role } });
      resetForm();
      setModalVisible(false);
      await queryClient.invalidateQueries({ queryKey: getGetAdminTeamQueryKey() });
      Alert.alert('Membre ajouté', `Identifiant de connexion : ${member.username}\n\nCommuniquez cet identifiant et le mot de passe temporaire au membre.`);
    } catch (error) {
      setFormError(`Le membre n’a pas pu être ajouté. ${errorMessage(error, 'Réessayez.')}`);
    }
  };
  const confirmDelete = (id: string, name: string) => {
    if (id === authMe.data?.clerkUserId) {
      Alert.alert('Action impossible', 'Vous ne pouvez pas désactiver votre propre compte.');
      return;
    }
    Alert.alert('Désactiver ce membre ?', `${name} ne pourra plus se connecter à l’application.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Désactiver', style: 'destructive', onPress: () => { void deleteMember.mutateAsync({ id }).then(() => queryClient.invalidateQueries({ queryKey: getGetAdminTeamQueryKey() })).catch((error) => Alert.alert('Désactivation impossible', errorMessage(error, 'Réessayez.'))); } },
    ]);
  };

  if (authMe.isLoading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.centerText, { color: colors.mutedForeground }]}>Vérification des permissions…</Text></View>;
  if (authMe.isError || !authMe.data) return <View style={[styles.center, { backgroundColor: colors.background }]}><Feather name="lock" size={30} color={colors.primary} /><Text style={[styles.centerText, { color: colors.foreground }]}>Vos permissions n’ont pas pu être vérifiées.</Text><Pressable onPress={() => { void authMe.refetch(); }}><Text style={[styles.link, { color: colors.primary }]}>Réessayer</Text></Pressable></View>;
  if (!canManage) return <View style={[styles.center, { backgroundColor: colors.background, padding: 28 }]}><Feather name="users" size={35} color={colors.primary} /><Text style={[styles.title, { color: colors.foreground }]}>Équipe</Text><Text style={[styles.centerText, { color: colors.mutedForeground }]}>La gestion des membres est réservée aux administrateurs et aux gérants.</Text></View>;
  if (teamQuery.isLoading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.centerText, { color: colors.mutedForeground }]}>Chargement de l’équipe…</Text></View>;
  if (teamQuery.isError) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={[styles.centerText, { color: colors.foreground }]}>Impossible de charger l’équipe.</Text><Pressable onPress={() => { void teamQuery.refetch(); }}><Text style={[styles.link, { color: colors.primary }]}>Réessayer</Text></Pressable></View>;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.accentForeground }]}>ORGANISATION</Text><Text style={[styles.title, { color: colors.foreground }]}>Mon équipe</Text></View><Pressable testID="add-team-member" onPress={() => { resetForm(); setModalVisible(true); }} style={[styles.addButton, { backgroundColor: colors.primary }]}><Feather name="plus" size={20} color={colors.primaryForeground} /></Pressable></View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Gérez les accès et les rôles de votre équipe.</Text>
        {!!resetNotice && <Text style={[styles.hint, { color: colors.primary, marginTop: 10 }]}>{resetNotice}</Text>}
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}><View><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Membres actifs</Text><Text style={[styles.summaryValue, { color: colors.foreground }]}>{activeCount} <Text style={[styles.summaryMuted, { color: colors.mutedForeground }]}>/ {members.length}</Text></Text></View><Feather name="users" size={24} color={colors.primary} /></View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Membres de l’équipe</Text>
        {members.length === 0 ? <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Aucun membre à afficher.</Text> : members.map((member) => <View key={member.id} style={[styles.member, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.primary }]}><Text style={styles.initials}>{(member.firstName?.[0] ?? member.name[0] ?? '?').toUpperCase()}{(member.lastName?.[0] ?? '').toUpperCase()}</Text></View><View style={styles.memberCopy}><Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text><Text style={[styles.memberRole, { color: colors.mutedForeground }]}>{roleLabels[member.role]}{member.mustResetPassword ? ' · Mot de passe à remplacer' : ''}</Text></View><View style={styles.memberStatus}><View style={[styles.statusDot, { backgroundColor: member.active ? '#57B873' : '#9A7968' }]} /><Text style={[styles.statusText, { color: colors.mutedForeground }]}>{member.active ? 'Actif' : 'Désactivé'}</Text></View>{canResetStaffPassword && member.role !== 'admin' && member.active && <Pressable testID={`reset-password-${member.id}`} onPress={() => { setResetNotice(''); setResetError(''); setTemporaryPassword(''); setConfirmTemporaryPassword(''); setResetTarget({ id: member.id, name: member.name }); }} hitSlop={8} accessibilityLabel={`Réinitialiser le mot de passe de ${member.name}`}><Feather name="key" size={18} color={colors.primary} /></Pressable>}{member.role !== 'admin' && member.active && <Pressable testID={`deactivate-${member.id}`} onPress={() => confirmDelete(member.id, member.name)} hitSlop={8}><Feather name="user-x" size={18} color={colors.primary} /></Pressable>}</View>)}
      </ScrollView>
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => !createMember.isPending && setModalVisible(false)}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.background }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Ajouter un membre</Text><Pressable disabled={createMember.isPending} onPress={() => setModalVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled"><Text style={[styles.label, { color: colors.foreground }]}>Prénom</Text><TextInput value={firstName} onChangeText={setFirstName} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} /><Text style={[styles.label, { color: colors.foreground }]}>Nom</Text><TextInput value={lastName} onChangeText={setLastName} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} /><Text style={[styles.label, { color: colors.foreground }]}>Rôle</Text><View style={styles.roleRow}>{editableRoles.map((option) => <Pressable key={option.value} onPress={() => setRole(option.value)} style={[styles.roleChip, { backgroundColor: role === option.value ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={{ color: role === option.value ? colors.primaryForeground : colors.foreground }}>{option.label}</Text></Pressable>)}</View><Text style={[styles.label, { color: colors.foreground }]}>Mot de passe temporaire</Text><View style={styles.passwordRow}><TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" style={[styles.input, styles.passwordInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} /><Pressable onPress={() => setShowPassword((visible) => !visible)}><Text style={[styles.showText, { color: colors.primary }]}>{showPassword ? 'Masquer' : 'Afficher'}</Text></Pressable></View><Text style={[styles.hint, { color: colors.mutedForeground }]}>8 caractères, avec une lettre et un chiffre.</Text>{formError ? <Text style={styles.formError}>{formError}</Text> : null}<Pressable disabled={createMember.isPending} onPress={() => { void submit(); }} style={[styles.submit, { backgroundColor: colors.primary, opacity: createMember.isPending ? 0.6 : 1 }]}>{createMember.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Ajouter le membre</Text>}</Pressable></ScrollView></View></View></Modal>
      <Modal visible={!!resetTarget} transparent animationType="fade" onRequestClose={() => !resetMemberPassword.isPending && setResetTarget(null)}>
        <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Mot de passe de {resetTarget?.name}</Text><Pressable disabled={resetMemberPassword.isPending} onPress={() => setResetTarget(null)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Le membre sera déconnecté et devra remplacer ce mot de passe temporaire à sa prochaine connexion.</Text>
          <Text style={[styles.label, { color: colors.foreground }]}>Nouveau mot de passe temporaire</Text>
          <TextInput testID="staff-temporary-password" value={temporaryPassword} onChangeText={setTemporaryPassword} secureTextEntry autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
          <Text style={[styles.label, { color: colors.foreground }]}>Confirmer le mot de passe</Text>
          <TextInput value={confirmTemporaryPassword} onChangeText={setConfirmTemporaryPassword} secureTextEntry autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
          {!!resetError && <Text style={styles.formError}>{resetError}</Text>}
          <Pressable testID="confirm-staff-password-reset" disabled={resetMemberPassword.isPending} onPress={() => { void submitPasswordReset(); }} style={[styles.submit, { backgroundColor: colors.primary, opacity: resetMemberPassword.isPending ? 0.6 : 1 }]}>{resetMemberPassword.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Définir le mot de passe</Text>}</Pressable>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 110 }, header: { marginTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, title: { fontSize: 28, fontWeight: '800', marginTop: 6 }, subtitle: { fontSize: 13, marginTop: 7 }, addButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, summary: { borderRadius: 17, borderWidth: 1, padding: 16, marginTop: 23, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, summaryLabel: { fontSize: 11 }, summaryValue: { fontSize: 24, fontWeight: '800', marginTop: 5 }, summaryMuted: { fontSize: 13, fontWeight: '500' }, sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 27, marginBottom: 11 }, member: { minHeight: 69, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 }, avatar: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, initials: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' }, memberCopy: { flex: 1 }, memberName: { fontSize: 12, fontWeight: '800' }, memberRole: { fontSize: 10, marginTop: 4 }, memberStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 }, statusDot: { width: 7, height: 7, borderRadius: 4 }, statusText: { fontSize: 10 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }, centerText: { textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: 10 }, link: { fontWeight: '800', marginTop: 16 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,24,19,0.45)' }, sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, modalTitle: { fontSize: 20, fontWeight: '800' }, label: { fontSize: 12, fontWeight: '700', marginTop: 13, marginBottom: 6 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, roleRow: { flexDirection: 'row', gap: 8 }, roleChip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 }, passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, passwordInput: { flex: 1 }, showText: { fontSize: 11, fontWeight: '800' }, hint: { fontSize: 11, marginTop: 6 }, formError: { color: '#B42318', fontSize: 12, lineHeight: 17, marginTop: 10 }, submit: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 17, marginBottom: 10 }, submitText: { fontSize: 14, fontWeight: '800' },
});