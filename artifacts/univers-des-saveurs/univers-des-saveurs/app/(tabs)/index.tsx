import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { formatCFA } from '@/context/OrderContext';
import { getGetAdminSalesQueryKey, getGetAuthMeQueryKey, useGetAdminSales, useGetAuthMe, useGetProducts } from '@workspace/api-client-react';

const quickActions = [
  { label: 'Nouvelle vente', icon: 'plus-circle' as const, route: '/vente' as const },
  { label: 'Ajouter stock', icon: 'package' as const, route: '/stocks' as const },
  { label: 'Voir l’équipe', icon: 'users' as const, route: '/team' as const },
  { label: 'Rapports', icon: 'bar-chart-2' as const, route: '/rapports' as const },
];

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const authMe = useGetAuthMe({ query: { queryKey: getGetAuthMeQueryKey(), staleTime: 60_000 } });
  const canManage = authMe.data?.role === 'admin' || authMe.data?.role === 'manager';
  const salesQuery = useGetAdminSales(undefined, { query: { queryKey: getGetAdminSalesQueryKey(), enabled: canManage, staleTime: 0, refetchOnMount: 'always' } });
  const productsQuery = useGetProducts();
  const firstName = authMe.data?.firstName?.trim() || authMe.data?.username || 'Utilisateur';
  const initial = firstName.charAt(0).toUpperCase();
  const todayKey = new Date().toDateString();
  const todaySales = (salesQuery.data ?? []).filter((sale) => new Date(sale.createdAt).toDateString() === todayKey);
  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.subtotal, 0);
  const recentSales = [...todaySales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);
  const lowStock = (productsQuery.data ?? []).filter((product) => product.stockQuantity <= 5);
  const currentDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date());
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 28) + 88 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/images/icon.png')} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>TABLEAU DE BORD</Text>
            <Text style={[styles.greeting, { color: colors.foreground }]}>Bonjour, {firstName}</Text>
          </View>
        </View>
        <Pressable testID="dashboard-profile" style={[styles.profile, { backgroundColor: colors.primary }]}>
          <Text style={styles.profileText}>{initial}</Text>
          <View style={styles.onlineDot} />
        </Pressable>
      </View>

      <View style={[styles.dateRow, { borderBottomColor: colors.border }]}>
        <View style={styles.dateCopy}>
          <Feather name="calendar" size={15} color={colors.primary} />
          <Text style={[styles.dateText, { color: colors.foreground }]}>{currentDate}</Text>
        </View>
        <View style={styles.syncCopy}>
          <View style={styles.syncDot} />
          <Text style={[styles.syncText, { color: colors.mutedForeground }]}>Synchronisé</Text>
        </View>
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>CHIFFRE D’AFFAIRES DU JOUR</Text>
          <Text style={styles.heroValue}>{formatCFA(todayRevenue)}</Text>
          <View style={styles.heroTrend}><Feather name="check-circle" size={14} color="#E8C76E" /><Text style={styles.heroTrendText}>Données réelles enregistrées</Text></View>
        </View>
        <View style={styles.heroGraphic}><Feather name="activity" size={30} color="#F5D889" /><Text style={styles.heroGraphicText}>{todaySales.length} ticket{todaySales.length > 1 ? 's' : ''}</Text></View>
      </View>

      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Actions rapides</Text><Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Aujourd’hui</Text></View>
      <View style={styles.actionsGrid}>
        {quickActions.map((action) => (
          <Pressable key={action.label} testID={`quick-${action.label}`} onPress={() => router.push(action.route)} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}>
            <View style={[styles.actionIcon, { backgroundColor: colors.secondary }]}><Feather name={action.icon} size={19} color={colors.primary} /></View>
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>{action.label}</Text>
            <Feather name="arrow-up-right" size={14} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>À surveiller</Text><Pressable onPress={() => router.push('/stocks')}><Text style={[styles.seeAll, { color: colors.primary }]}>Tout voir</Text></Pressable></View>
      <Pressable onPress={() => router.push('/stocks')} style={[styles.stockAlert, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.alertIcon, { backgroundColor: lowStock.length ? '#FFF0E3' : colors.secondary }]}><Feather name={lowStock.length ? 'alert-triangle' : 'check-circle'} size={17} color={lowStock.length ? '#B86A3A' : colors.primary} /></View>
        <View style={styles.alertCopy}><Text style={[styles.alertTitle, { color: colors.foreground }]}>{lowStock.length ? `${lowStock.length} article${lowStock.length > 1 ? 's' : ''} à réapprovisionner` : 'Tous les stocks sont disponibles'}</Text><Text style={[styles.alertText, { color: colors.mutedForeground }]}>{lowStock.length ? lowStock.slice(0, 2).map((product) => product.name).join(' • ') : `${productsQuery.data?.length ?? 0} articles dans le catalogue`}</Text></View>
        <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
      </Pressable>

      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Dernières ventes</Text><Pressable onPress={() => router.push('/history')}><Text style={[styles.seeAll, { color: colors.primary }]}>Voir tout</Text></Pressable></View>
      <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {recentSales.length === 0 ? <Text style={[styles.emptyActivity, { color: colors.mutedForeground }]}>Aucune vente enregistrée aujourd’hui.</Text> : recentSales.map((sale, index) => (
          <View key={sale.id} style={[styles.activityRow, index !== recentSales.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <View style={[styles.activityIcon, { backgroundColor: colors.secondary }]}><Feather name="shopping-bag" size={16} color={colors.primary} /></View>
            <View style={styles.activityCopy}><Text style={[styles.activityName, { color: colors.foreground }]}>{sale.tableLabel}</Text><Text numberOfLines={1} style={[styles.activityDetail, { color: colors.mutedForeground }]}>{sale.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</Text></View>
            <View style={styles.activityAmount}><Text style={[styles.amount, { color: colors.foreground }]}>{formatCFA(sale.subtotal)}</Text><Text style={[styles.time, { color: colors.mutedForeground }]}>{new Date(sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text></View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 15 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, logo: { width: 51, height: 51, borderRadius: 16 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.25 }, greeting: { fontSize: 22, fontWeight: '800', marginTop: 3 },
  profile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative' }, profileText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }, onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#57B873', borderWidth: 2, borderColor: '#FFF9F0', position: 'absolute', right: -1, bottom: -1 },
  dateRow: { height: 39, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, dateCopy: { flexDirection: 'row', gap: 7, alignItems: 'center' }, dateText: { fontSize: 12, fontWeight: '600' }, syncCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 }, syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#57B873' }, syncText: { fontSize: 11 },
  heroCard: { borderRadius: 19, padding: 19, marginTop: 18, minHeight: 143, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heroCopy: { flex: 1 }, heroEyebrow: { color: '#F7EAD2', fontSize: 10, fontWeight: '800', letterSpacing: 1.15 }, heroValue: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 7 }, heroTrend: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 }, heroTrendText: { color: '#E8C76E', fontSize: 11, fontWeight: '600' }, heroGraphic: { width: 75, height: 75, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }, heroGraphicText: { color: '#F7EAD2', fontSize: 10, fontWeight: '700', marginTop: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 11 }, sectionTitle: { fontSize: 17, fontWeight: '800' }, sectionHint: { fontSize: 11 }, seeAll: { fontSize: 12, fontWeight: '700' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, actionCard: { width: '48.5%', minHeight: 91, borderRadius: 15, borderWidth: 1, padding: 11, position: 'relative' }, actionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, actionLabel: { fontSize: 12, fontWeight: '700' },
  stockAlert: { borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, alertIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, alertCopy: { flex: 1 }, alertTitle: { fontSize: 12, fontWeight: '800' }, alertText: { fontSize: 11, marginTop: 4 },
  activityCard: { borderRadius: 15, borderWidth: 1, paddingHorizontal: 12 }, activityRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 9 }, activityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, activityCopy: { flex: 1 }, activityName: { fontSize: 12, fontWeight: '800' }, activityDetail: { fontSize: 10, marginTop: 4 }, activityAmount: { alignItems: 'flex-end' }, amount: { fontSize: 11, fontWeight: '800' }, time: { fontSize: 9, marginTop: 4 },
  emptyActivity: { fontSize: 12, textAlign: 'center', paddingVertical: 24 },
});