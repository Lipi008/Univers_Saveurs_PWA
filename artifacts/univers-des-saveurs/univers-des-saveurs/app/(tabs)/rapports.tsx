import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { formatCFA } from '@/context/OrderContext';
import { getGetAdminReportQueryKey, useGetAdminReport } from '@workspace/api-client-react';
import { useFocusEffect } from 'expo-router';

type PeriodMode = 'today' | 'week' | 'month' | 'custom';
const BUSINESS_TIMEZONE = 'Africa/Abidjan';

function abidjanDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const from = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
  const to = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { from, to };
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
}

function shortDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  });
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState(abidjanDate);
  const [mode, setMode] = useState<PeriodMode>('today');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [appliedCustom, setAppliedCustom] = useState({ from: today, to: today });

  useFocusEffect(useCallback(() => {
    setToday(abidjanDate());
  }, []));

  useEffect(() => {
    const interval = setInterval(() => setToday(abidjanDate()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const period = useMemo(() => {
    if (mode === 'week') return { from: shiftDate(today, -6), to: today };
    if (mode === 'month') return monthBounds(month);
    if (mode === 'custom') return appliedCustom;
    return { from: today, to: today };
  }, [appliedCustom, mode, month, today]);

  const reportQuery = useGetAdminReport(period, {
    query: { queryKey: getGetAdminReportQueryKey(period), staleTime: 30_000 },
  });
  const report = reportQuery.data;
  const maxRevenue = Math.max(...(report?.daily.map((day) => day.revenue) ?? [0]), 1);
  const periodTitle = mode === 'today'
    ? `Aujourd’hui · ${shortDate(today)}`
    : mode === 'month'
      ? new Date(`${month}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: BUSINESS_TIMEZONE })
      : `Du ${shortDate(period.from)} au ${shortDate(period.to)}`;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>DIRECTION</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Rapports</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Ventes réelles · heure d’Abidjan</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodTabs}>
        {([
          ['today', 'Aujourd’hui'],
          ['week', '7 jours'],
          ['month', 'Bilan mensuel'],
          ['custom', 'Période'],
        ] as const).map(([value, label]) => (
          <Pressable
            key={value}
            testID={`report-period-${value}`}
            onPress={() => setMode(value)}
            style={[styles.periodTab, { backgroundColor: mode === value ? colors.primary : colors.card, borderColor: mode === value ? colors.primary : colors.border }]}
          >
            <Text style={[styles.periodTabText, { color: mode === value ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {mode === 'month' && (
        <View style={[styles.monthPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable testID="previous-month" onPress={() => setMonth((value) => shiftMonth(value, -1))} hitSlop={8}>
            <Feather name="chevron-left" size={22} color={colors.primary} />
          </Pressable>
          <Text style={[styles.monthName, { color: colors.foreground }]}>{periodTitle}</Text>
          <Pressable testID="next-month" onPress={() => setMonth((value) => shiftMonth(value, 1))} disabled={month >= today.slice(0, 7)} hitSlop={8}>
            <Feather name="chevron-right" size={22} color={month >= today.slice(0, 7) ? colors.border : colors.primary} />
          </Pressable>
        </View>
      )}

      {mode === 'custom' && (
        <View style={[styles.customCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.dateField}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Du</Text>
            <TextInput value={customFrom} onChangeText={setCustomFrom} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input }]} />
          </View>
          <View style={styles.dateField}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Au</Text>
            <TextInput value={customTo} onChangeText={setCustomTo} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input }]} />
          </View>
          <Pressable testID="apply-report-period" onPress={() => setAppliedCustom({ from: customFrom, to: customTo })} style={[styles.applyButton, { backgroundColor: colors.primary }]}>
            <Feather name="check" size={17} color={colors.primaryForeground} />
          </Pressable>
        </View>
      )}

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{periodTitle}</Text>
        <Pressable onPress={() => { void reportQuery.refetch(); }} hitSlop={8}>
          <Feather name="refresh-cw" size={17} color={colors.primary} />
        </Pressable>
      </View>

      {reportQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : reportQuery.isError || !report ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="alert-circle" size={24} color={colors.destructive} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Le rapport n’a pas pu être chargé. Vérifiez la période puis réessayez.</Text>
        </View>
      ) : (
        <>
          <View style={styles.metricRow}>
            <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Chiffre d’affaires</Text>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatCFA(report.totalRevenue)}</Text>
            </View>
            <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Tickets</Text>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{report.ticketCount}</Text>
              <Text style={[styles.metricDetail, { color: colors.mutedForeground }]}>Panier moyen {formatCFA(report.averageTicket)}</Text>
            </View>
          </View>

          {report.ticketCount === 0 && (
            <View style={[styles.emptyCard, styles.noSalesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="inbox" size={25} color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune vente enregistrée pendant cette période.</Text>
            </View>
          )}

          <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Évolution des ventes</Text>
            <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>{report.totalItems} article{report.totalItems > 1 ? 's' : ''} vendu{report.totalItems > 1 ? 's' : ''}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bars}>
              {report.daily.map((day) => (
                <View key={day.date} style={styles.barCol}>
                  <Text style={[styles.barValue, { color: colors.mutedForeground }]}>{day.revenue ? `${Math.round(day.revenue / 1000)}k` : '0'}</Text>
                  <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.bar, { height: `${Math.max((day.revenue / maxRevenue) * 100, day.revenue ? 8 : 0)}%`, backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={[styles.day, { color: colors.mutedForeground }]}>{shortDate(day.date)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeading}>
              <View style={[styles.headingIcon, { backgroundColor: colors.secondary }]}><Feather name="users" size={18} color={colors.primary} /></View>
              <View><Text style={[styles.cardTitle, { color: colors.foreground }]}>Ventes par caissier</Text><Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>{report.cashiers.length} utilisateur{report.cashiers.length > 1 ? 's' : ''}</Text></View>
            </View>
            {report.cashiers.length === 0 ? <Text style={[styles.emptyInline, { color: colors.mutedForeground }]}>Aucune vente sur cette période.</Text> : report.cashiers.map((cashier, index) => (
              <View key={cashier.clerkUserId} style={[styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                <View style={[styles.rank, { backgroundColor: colors.secondary }]}><Text style={[styles.rankText, { color: colors.primary }]}>{index + 1}</Text></View>
                <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{cashier.name}</Text><Text style={[styles.rowDetail, { color: colors.mutedForeground }]}>{cashier.ticketCount} ticket{cashier.ticketCount > 1 ? 's' : ''} · panier {formatCFA(cashier.averageTicket)}</Text></View>
                <Text style={[styles.rowAmount, { color: colors.primary }]}>{formatCFA(cashier.revenue)}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeading}>
              <View style={[styles.headingIcon, { backgroundColor: colors.secondary }]}><Feather name="credit-card" size={18} color={colors.primary} /></View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Modes de paiement</Text>
            </View>
            {report.payments.length === 0 ? <Text style={[styles.emptyInline, { color: colors.mutedForeground }]}>Aucun encaissement sur cette période.</Text> : report.payments.map((payment, index) => (
              <View key={payment.paymentMethod} style={[styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{payment.paymentMethod}</Text><Text style={[styles.rowDetail, { color: colors.mutedForeground }]}>{payment.ticketCount} ticket{payment.ticketCount > 1 ? 's' : ''}</Text></View>
                <Text style={[styles.rowAmount, { color: colors.foreground }]}>{formatCFA(payment.revenue)}</Text>
              </View>
            ))}
          </View>

          {report.topItems[0] && (
            <View style={[styles.bestCard, { backgroundColor: colors.primary }]}>
              <View style={styles.bestIcon}><Feather name="award" size={21} color={colors.accent} /></View>
              <View style={styles.bestCopyWrap}><Text style={[styles.bestCaption, { color: colors.secondary }]}>ARTICLE N°1</Text><Text style={[styles.bestName, { color: colors.primaryForeground }]}>{report.topItems[0].name}</Text><Text style={[styles.bestCopy, { color: colors.secondary }]}>{report.topItems[0].quantity} vendu{report.topItems[0].quantity > 1 ? 's' : ''} · {formatCFA(report.topItems[0].revenue)}</Text></View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 110 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 13 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 6 },
  subtitle: { fontSize: 13, marginTop: 7 },
  periodTabs: { gap: 8, marginTop: 22, paddingRight: 10 },
  periodTab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  periodTabText: { fontSize: 12, fontWeight: '800' },
  monthPicker: { borderWidth: 1, borderRadius: 15, marginTop: 12, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthName: { fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  customCard: { borderWidth: 1, borderRadius: 15, marginTop: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dateField: { flex: 1 },
  inputLabel: { fontSize: 10, fontWeight: '700', marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, height: 42, fontSize: 12 },
  applyButton: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  loader: { marginTop: 45 },
  emptyCard: { borderWidth: 1, borderRadius: 17, padding: 25, alignItems: 'center', gap: 10 },
  noSalesCard: { marginTop: 11 },
  emptyText: { textAlign: 'center', fontSize: 12, lineHeight: 18 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, minHeight: 102, borderRadius: 16, borderWidth: 1, padding: 14 },
  metricLabel: { fontSize: 11 },
  metricValue: { fontSize: 18, fontWeight: '800', marginTop: 7 },
  metricDetail: { fontSize: 9, marginTop: 6 },
  chartCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 11 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  cardSubtitle: { fontSize: 10, marginTop: 3 },
  bars: { height: 172, alignItems: 'flex-end', gap: 9, paddingTop: 16, paddingRight: 4 },
  barCol: { width: 34, alignItems: 'center' },
  barValue: { fontSize: 8, marginBottom: 4 },
  barTrack: { width: 22, height: 112, borderRadius: 7, overflow: 'hidden', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 7 },
  day: { fontSize: 8, marginTop: 6 },
  listCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 11 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  headingIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11, fontWeight: '800' },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 12, fontWeight: '800' },
  rowDetail: { fontSize: 9, marginTop: 4 },
  rowAmount: { fontSize: 12, fontWeight: '800' },
  emptyInline: { fontSize: 11, paddingVertical: 18, textAlign: 'center' },
  bestCard: { borderRadius: 18, marginTop: 11, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  bestIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(214,167,58,0.2)', alignItems: 'center', justifyContent: 'center' },
  bestCopyWrap: { flex: 1 },
  bestCaption: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  bestName: { fontSize: 16, fontWeight: '800', marginTop: 3 },
  bestCopy: { fontSize: 10, marginTop: 4 },
});