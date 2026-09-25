import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useLocalAuth';
import { getGetAdminSalesQueryKey, getGetAuthMeQueryKey, useGetAdminSales, useGetAuthMe } from '@workspace/api-client-react';
import { Redirect, router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCFA } from '@/context/OrderContext';
import { useColors } from '@/hooks/useColors';
import { compactReceiptNumber } from '@/utils/receipt';

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();

  const authMe = useGetAuthMe({ query: { queryKey: getGetAuthMeQueryKey(), enabled: isLoaded && !!isSignedIn, staleTime: 60_000 } });
  const canManage = authMe.data?.role === 'admin' || authMe.data?.role === 'manager';
  const includeTests = authMe.data?.role === 'admin' && authMe.data.username?.toLowerCase() === 'marlon';
  const salesParams = includeTests ? { includeTests: true } : undefined;
  const sales = useGetAdminSales(salesParams, { query: { queryKey: getGetAdminSalesQueryKey(salesParams), enabled: canManage, staleTime: 30_000 } });

  if (!isLoaded) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }
  if (authMe.isLoading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.centerText, { color: colors.mutedForeground }]}>Vérification des permissions…</Text></View>;
  }
  if (!canManage) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 28 }]}>
        <Feather name="lock" size={38} color={colors.primary} />
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>Accès réservé au gérant</Text>
        <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Vous n’avez pas la permission de consulter l’historique des ventes.</Text>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={[styles.backButtonText, { color: colors.primaryForeground }]}>Retour</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 22 : insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.back}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
        <View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.accentForeground }]}>ADMINISTRATION</Text><Text style={[styles.title, { color: colors.foreground }]}>Historique des ventes</Text></View>
        <Feather name="clock" size={22} color={colors.primary} />
      </View>
      {sales.isLoading ? (
        <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={[styles.centerText, { color: colors.mutedForeground }]}>Chargement des ventes…</Text></View>
      ) : sales.isError ? (
        <View style={styles.state}><Feather name="alert-circle" size={28} color={colors.primary} /><Text style={[styles.centerText, { color: colors.foreground }]}>L’historique n’a pas pu être chargé.</Text><Text style={[styles.errorText, { color: colors.mutedForeground }]}>Vérifiez votre connexion puis réessayez.</Text><Pressable onPress={() => { void sales.refetch(); }} style={[styles.backButton, { backgroundColor: colors.primary }]}><Text style={[styles.backButtonText, { color: colors.primaryForeground }]}>Réessayer</Text></Pressable></View>
      ) : (
        <FlatList
          data={sales.data ?? []}
          keyExtractor={(sale) => sale.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 25 }]}
          ListEmptyComponent={<View style={styles.state}><Feather name="inbox" size={30} color={colors.mutedForeground} /><Text style={[styles.centerText, { color: colors.mutedForeground }]}>Aucune vente enregistrée pour le moment.</Text></View>}
          renderItem={({ item }) => (
            <View style={[styles.saleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.saleTop}><View><Text style={[styles.receiptNumber, { color: colors.primary }]}>{compactReceiptNumber(item.receiptNumber)}</Text><Text style={[styles.date, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleDateString('fr-FR')} à {new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text></View><Text style={[styles.total, { color: colors.foreground }]}>{formatCFA(item.subtotal)}</Text></View>
              {item.isTest && <Text style={[styles.metaText, { color: colors.primary, fontWeight: '800' }]}>VENTE D’ESSAI · sans effet sur le stock et les recettes</Text>}
              <View style={styles.meta}><Text style={[styles.metaText, { color: colors.mutedForeground }]}><Feather name="map-pin" size={12} /> {item.tableLabel}</Text><Text style={[styles.metaText, { color: colors.mutedForeground }]}><Feather name="credit-card" size={12} /> {item.paymentMethod}</Text></View>
               <View style={styles.paymentBreakdown}>
                 {item.cashAmount > 0 && <Text style={[styles.paymentText, { color: colors.mutedForeground }]}>Espèces {formatCFA(item.cashAmount)}</Text>}
                 {item.waveAmount > 0 && <Text style={[styles.paymentText, { color: colors.mutedForeground }]}>Wave {formatCFA(item.waveAmount)}</Text>}
                 {item.orangeMoneyAmount > 0 && <Text style={[styles.paymentText, { color: colors.mutedForeground }]}>Orange Money {formatCFA(item.orangeMoneyAmount)}</Text>}
                 <Text style={[styles.paymentText, { color: colors.foreground }]}>Montant reçu {formatCFA(item.cashAmount + item.waveAmount + item.orangeMoneyAmount)}</Text>
                 {item.cashTendered > item.cashAmount && <Text style={[styles.paymentText, { color: colors.mutedForeground }]}>Espèces remises {formatCFA(item.cashTendered)} · monnaie {formatCFA(item.changeDue)}</Text>}
               </View>
              <View style={[styles.items, { borderTopColor: colors.border }]}>{item.items.map((line) => <View key={line.id} style={styles.itemLine}><Text style={[styles.itemName, { color: colors.foreground }]}>{line.quantity} × {line.name}</Text><Text style={[styles.itemAmount, { color: colors.mutedForeground }]}>{formatCFA(line.lineTotal)}</Text></View>)}</View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 11, padding: 28 },
  centerText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  permissionTitle: { fontSize: 21, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  header: { paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  list: { paddingHorizontal: 20, gap: 11 },
  saleCard: { borderRadius: 16, borderWidth: 1, padding: 15 },
  saleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  receiptNumber: { fontSize: 14, fontWeight: '800' },
  date: { fontSize: 11, marginTop: 4 },
  total: { fontSize: 16, fontWeight: '800' },
  meta: { flexDirection: 'row', gap: 16, marginTop: 13 },
  metaText: { fontSize: 11 },
  paymentBreakdown: { gap: 3, marginTop: 8 },
  paymentText: { fontSize: 10 },
  items: { borderTopWidth: 1, marginTop: 13, paddingTop: 10, gap: 7 },
  itemLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  itemName: { flex: 1, fontSize: 12 },
  itemAmount: { fontSize: 12 },
  backButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 23, marginTop: 10 },
  backButtonText: { fontSize: 13, fontWeight: '800' },
  errorText: { fontSize: 12 },
});