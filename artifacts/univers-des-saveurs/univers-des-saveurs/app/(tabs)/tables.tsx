import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DiningLocation,
  getGetDiningLocationsQueryKey,
  useCreateDiningLocation,
  useDeleteDiningLocation,
  useGetAuthMe,
  useGetDiningLocations,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type LocationKind = 'table' | 'space';

export default function TablesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const authMe = useGetAuthMe();
  const locationsQuery = useGetDiningLocations();
  const createLocation = useCreateDiningLocation();
  const deleteLocation = useDeleteDiningLocation();
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LocationKind>('table');
  const [error, setError] = useState('');
  const isAdmin = authMe.data?.role === 'admin';
  const locations = locationsQuery.data ?? [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetDiningLocationsQueryKey() });
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Saisissez le nom de la table ou de l’espace.');
      return;
    }
    try {
      setError('');
      await createLocation.mutateAsync({ data: { name: trimmed, kind } });
      await refresh();
      setName('');
      setKind('table');
      setFormVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Création impossible.');
    }
  };

  const remove = (location: DiningLocation) => {
    Alert.alert(
      `Supprimer « ${location.name} » ?`,
      'Les anciens reçus conserveront ce nom, mais cet emplacement ne sera plus proposé pour les nouvelles commandes.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void deleteLocation.mutateAsync({ id: location.id }).then(refresh).catch((cause: unknown) => {
              Alert.alert('Suppression impossible', cause instanceof Error ? cause.message : 'Réessayez.');
            });
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>ESPACE DE VENTE</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Tables & espaces</Text>
          </View>
          {isAdmin && (
            <Pressable testID="add-dining-location" onPress={() => { setError(''); setFormVisible(true); }} style={[styles.addButton, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={21} color={colors.primaryForeground} />
            </Pressable>
          )}
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Ces emplacements sont proposés à la caisse pour chaque nouvelle commande.
        </Text>
        {!isAdmin && (
          <View style={[styles.info, { backgroundColor: colors.secondary }]}>
            <Feather name="lock" size={17} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.secondaryForeground }]}>Seul l’Administrateur peut créer ou supprimer un emplacement.</Text>
          </View>
        )}
        <View style={[styles.takeawayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name="shopping-bag" size={20} color={colors.primary} /></View>
          <View style={styles.cardCopy}><Text style={[styles.cardName, { color: colors.foreground }]}>À emporter</Text><Text style={[styles.cardKind, { color: colors.mutedForeground }]}>Option permanente</Text></View>
          <Feather name="check-circle" size={18} color={colors.primary} />
        </View>
        {locationsQuery.isLoading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : locationsQuery.isError ? (
          <View style={styles.empty}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Impossible de charger les emplacements.</Text><Pressable onPress={() => { void locationsQuery.refetch(); }}><Text style={[styles.retry, { color: colors.primary }]}>Réessayer</Text></Pressable></View>
        ) : locations.length === 0 ? (
          <View style={styles.empty}><Feather name="map-pin" size={28} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune table ni aucun espace créé.</Text></View>
        ) : (
          <View style={styles.grid}>
            {locations.map((location) => (
              <View key={location.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name={location.kind === 'table' ? 'grid' : 'map-pin'} size={20} color={colors.primary} /></View>
                <View style={styles.cardCopy}><Text numberOfLines={1} style={[styles.cardName, { color: colors.foreground }]}>{location.name}</Text><Text style={[styles.cardKind, { color: colors.mutedForeground }]}>{location.kind === 'table' ? 'Table' : 'Espace'}</Text></View>
                {isAdmin && <Pressable testID={`delete-location-${location.id}`} disabled={deleteLocation.isPending} onPress={() => remove(location)} hitSlop={8}><Feather name="trash-2" size={18} color={colors.destructive} /></Pressable>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouvel emplacement</Text><Pressable onPress={() => setFormVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
            <Text style={[styles.label, { color: colors.foreground }]}>Type</Text>
            <View style={styles.kindRow}>
              {([['table', 'Table'], ['space', 'Espace']] as const).map(([value, label]) => (
                <Pressable key={value} testID={`location-kind-${value}`} onPress={() => setKind(value)} style={[styles.kindChoice, { backgroundColor: kind === value ? colors.primary : colors.card, borderColor: kind === value ? colors.primary : colors.border }]}>
                  <Feather name={value === 'table' ? 'grid' : 'map-pin'} size={17} color={kind === value ? colors.primaryForeground : colors.primary} />
                  <Text style={[styles.kindText, { color: kind === value ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.foreground }]}>Nom</Text>
            <TextInput testID="location-name" autoFocus value={name} onChangeText={setName} placeholder={kind === 'table' ? 'Ex. Table 05' : 'Ex. Terrasse'} placeholderTextColor={colors.mutedForeground} maxLength={60} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable testID="save-dining-location" disabled={createLocation.isPending} onPress={() => { void create(); }} style={[styles.submit, { backgroundColor: colors.primary, opacity: createLocation.isPending ? 0.6 : 1 }]}>
              {createLocation.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Créer</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 110 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13 }, headerCopy: { flex: 1 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, title: { fontSize: 28, fontWeight: '800', marginTop: 6 }, subtitle: { fontSize: 13, marginTop: 8, lineHeight: 19 }, addButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  info: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, padding: 12, marginTop: 16 }, infoText: { flex: 1, fontSize: 11, lineHeight: 16 }, takeawayCard: { borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11 }, grid: { gap: 10 }, card: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, cardCopy: { flex: 1, minWidth: 0 }, cardName: { fontSize: 14, fontWeight: '800' }, cardKind: { fontSize: 11, marginTop: 3 }, loader: { marginTop: 40 }, empty: { alignItems: 'center', gap: 9, paddingVertical: 38 }, emptyText: { fontSize: 12, textAlign: 'center' }, retry: { fontSize: 12, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(43,24,19,0.45)' }, modal: { borderRadius: 21, padding: 20 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalTitle: { fontSize: 20, fontWeight: '800' }, label: { fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 7 }, kindRow: { flexDirection: 'row', gap: 9 }, kindChoice: { flex: 1, minHeight: 45, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, kindText: { fontSize: 13, fontWeight: '700' }, input: { minHeight: 47, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, error: { color: '#B42318', fontSize: 12, marginTop: 9 }, submit: { minHeight: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, submitText: { fontSize: 14, fontWeight: '800' },
});