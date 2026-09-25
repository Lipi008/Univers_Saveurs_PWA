import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { formatCFA } from '@/context/OrderContext';
import { getGetAdminSalesQueryKey, useGetAdminSales } from '@workspace/api-client-react';

export default function CaisseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const salesQuery = useGetAdminSales(undefined, { query: { queryKey: getGetAdminSalesQueryKey(), staleTime: 0, refetchOnMount: 'always' } });
  const todayKey = new Date().toDateString();
  const todaySales = (salesQuery.data ?? []).filter((sale) => new Date(sale.createdAt).toDateString() === todayKey);
  const payments = [
    { label: 'Espèces', value: todaySales.reduce((sum, sale) => sum + sale.cashAmount, 0), icon: 'dollar-sign' as const },
    { label: 'Wave', value: todaySales.reduce((sum, sale) => sum + sale.waveAmount, 0), icon: 'smartphone' as const },
    { label: 'Orange Money', value: todaySales.reduce((sum, sale) => sum + sale.orangeMoneyAmount, 0), icon: 'smartphone' as const },
  ];
  const total = payments.reduce((sum, payment) => sum + payment.value, 0);
  const currentDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date());
  return <ScrollView style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]} contentContainerStyle={styles.content}>
    <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>ENCAISSEMENT</Text><Text style={[styles.title, { color: colors.foreground }]}>Caisse du jour</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{currentDate} • {todaySales.length} ticket{todaySales.length > 1 ? 's' : ''}</Text>
    <View style={[styles.totalCard, { backgroundColor: colors.primary }]}><View><Text style={styles.totalCaption}>CHIFFRE D’AFFAIRES</Text><Text style={styles.totalValue}>{formatCFA(total)}</Text><Text style={styles.totalChange}><Feather name="check-circle" size={13} color="#E9C76D" /> Encaissements enregistrés aujourd’hui</Text></View><View style={styles.totalIcon}><Feather name="activity" size={24} color="#F7EAD2" /></View></View>
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Répartition des paiements</Text>
    {payments.map((payment) => <View key={payment.label} style={[styles.paymentCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.paymentIcon, { backgroundColor: colors.secondary }]}><Feather name={payment.icon} size={18} color={colors.primary} /></View><Text style={[styles.paymentLabel, { color: colors.foreground }]}>{payment.label}</Text><Text style={[styles.paymentValue, { color: colors.foreground }]}>{formatCFA(payment.value)}</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></View>)}
    <Pressable style={[styles.closeButton, { backgroundColor: colors.accent }]}><Feather name="lock" size={17} color={colors.accentForeground} /><Text style={[styles.closeButtonText, { color: colors.accentForeground }]}>Clôturer la caisse</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 110 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 13 }, title: { fontSize: 28, fontWeight: '800', marginTop: 6 }, subtitle: { fontSize: 13, marginTop: 7 }, totalCard: { borderRadius: 19, padding: 20, marginTop: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, totalCaption: { color: '#F7EAD2', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, totalValue: { color: '#FFFFFF', fontSize: 31, fontWeight: '800', marginTop: 6 }, totalChange: { color: '#E9C76D', fontSize: 11, marginTop: 9 }, totalIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }, sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 11 }, paymentCard: { minHeight: 65, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 }, paymentIcon: { width: 37, height: 37, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, paymentLabel: { flex: 1, fontSize: 13, fontWeight: '700' }, paymentValue: { fontSize: 12, fontWeight: '800' }, closeButton: { height: 50, borderRadius: 14, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, closeButtonText: { fontSize: 13, fontWeight: '800' },
});