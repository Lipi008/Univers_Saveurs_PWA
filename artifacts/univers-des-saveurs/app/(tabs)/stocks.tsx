import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useLocalAuth';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Image as ExpoImage } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import {
  getGetCategoriesQueryKey,
  getGetProductsQueryKey,
  Product as ApiProduct,
  useCreateCategory,
  useDeleteCategory,
  useCreateProduct,
  useGetAuthMe,
  useGetCategories,
  useGetProducts,
  useImportProducts,
  useRequestUploadUrl,
  useUpdateProductStock,
  useUpdateCategory,
} from '@workspace/api-client-react';
import { useOfflineSync } from '@/context/OfflineSyncContext';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedType = typeof ALLOWED_TYPES[number];

function resolveImageUrl(imageUrl: string | null) {
  if (!imageUrl) return null;
  if (Platform.OS === 'web' || /^https?:\/\//i.test(imageUrl)) return imageUrl;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}` : imageUrl;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function validateInteger(value: string, label: string, allowZero = true) {
  if (!/^\d+$/.test(value.trim())) return `${label} doit être un nombre entier.`;
  if (!allowZero && Number(value) < 1) return `${label} doit être supérieur à zéro.`;
  return null;
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim();
}

function ProductRow({ product, editable, onStock }: { product: ApiProduct; editable: boolean; onStock: () => void }) {
  const colors = useColors();
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    void getToken().then((value) => { if (active) setToken(value); });
    return () => { active = false; };
  }, [getToken]);
  const imageUrl = resolveImageUrl(product.imageUrl);
  const tone = product.stockQuantity === 0 ? '#B42318' : product.stockQuantity < 5 ? '#C88735' : '#55A76F';
  return (
    <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {imageUrl ? <ExpoImage source={{ uri: imageUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.productThumb} contentFit="cover" /> : <View style={[styles.productThumb, { backgroundColor: `${tone}20` }]}><Feather name="package" size={24} color={tone} /></View>}
      <View style={styles.productDetails}>
        <Text numberOfLines={1} style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
        <Text style={[styles.productCategory, { color: colors.mutedForeground }]}>{product.category.name}</Text>
        <Text style={[styles.productPrice, { color: colors.primary }]}>{product.price.toLocaleString('fr-FR')} F</Text>
        <Text style={[styles.stockStatus, { color: tone }]}>{product.stockQuantity === 0 ? 'Rupture' : product.stockQuantity < 5 ? 'Stock bas' : 'Bon niveau'} · {product.stockQuantity}</Text>
      </View>
      {editable && <Pressable testID={`edit-stock-${product.id}`} onPress={onStock} style={[styles.stockButton, { backgroundColor: colors.secondary }]}>
        <Feather name="edit-2" size={15} color={colors.primary} />
        <Text style={[styles.stockButtonText, { color: colors.secondaryForeground }]}>Stock</Text>
      </Pressable>}
    </View>
  );
}

export default function StocksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const authMe = useGetAuthMe();
  const productsQuery = useGetProducts();
  const categoriesQuery = useGetCategories();
  const createProduct = useCreateProduct();
  const importProducts = useImportProducts();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const requestUpload = useRequestUploadUrl();
  const updateStock = useUpdateProductStock();
  const { catalog, isOnline, saveCatalog } = useOfflineSync();
  const canManage = authMe.data?.role === 'admin' || authMe.data?.role === 'manager';
  const [formVisible, setFormVisible] = useState(false);
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [stockProduct, setStockProduct] = useState<ApiProduct | null>(null);
  const [stockValue, setStockValue] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<ApiProduct['category'] | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<ApiProduct['category'] | null>(null);
  const [replacementCategoryId, setReplacementCategoryId] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Création…');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [importMessage, setImportMessage] = useState('');

  const categories = categoriesQuery.data ?? catalog?.categories ?? [];
  const products = productsQuery.data ?? catalog?.products ?? [];
  const lowStockCount = useMemo(() => products.filter((product) => product.stockQuantity < 5).length, [products]);
  const visibleProducts = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return products;
    return products.filter((product) =>
      normalizeSearch(`${product.name} ${product.category.name} ${product.price} ${product.stockQuantity}`).includes(query),
    );
  }, [products, search]);

  const resetForm = () => {
    setName('');
    setCategoryId(categories[0]?.id ?? '');
    setPrice('');
    setQuantity('');
    setImage(null);
    setFormError('');
  };

  const importWorkbook = async () => {
    if (!isOnline || authMe.data?.role !== 'admin' || importProducts.isPending) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        copyToCacheDirectory: true,
        base64: Platform.OS === 'web',
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.name.toLowerCase().endsWith('.xlsx') || (asset.size !== undefined && asset.size > 3 * 1024 * 1024)) {
        setImportMessage('Choisissez un fichier Excel .xlsx de 3 Mo maximum.');
        return;
      }
      setImportMessage('Importation en cours…');
      const base64 = Platform.OS === 'web' ? asset.base64?.split(',').pop() : await new File(asset.uri).base64();
      if (!base64) throw new Error('Impossible de lire ce fichier.');
      const summary = await importProducts.mutateAsync({ data: { fileName: asset.name, base64 } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetCategoriesQueryKey() }),
      ]);
      setImportMessage(`${summary.created} produit(s) ajouté(s), ${summary.skipped} déjà présent(s), ${summary.categoriesCreated} catégorie(s) créée(s).`);
    } catch (error) {
      setImportMessage(`Import impossible : ${errorMessage(error, 'vérifiez le fichier puis réessayez.')}`);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const extension = asset.fileName?.split('.').pop()?.toLowerCase();
    const contentType = asset.mimeType ?? (extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : null);
    if (!contentType || !ALLOWED_TYPES.includes(contentType as AllowedType)) {
      setFormError('Sélectionnez une image JPEG, PNG ou WebP.');
      return;
    }
    if (asset.fileSize !== undefined && asset.fileSize > MAX_IMAGE_BYTES) {
      setFormError('L’image doit faire au maximum 5 Mo.');
      return;
    }
    setFormError('');
    setImage({ ...asset, mimeType: contentType });
  };

  const createNewCategory = async () => {
    if (!isOnline) { setFormError('La gestion du catalogue nécessite une connexion.'); return; }
    const trimmed = newCategory.trim();
    if (!trimmed) {
      setFormError('Le nom de la catégorie est obligatoire.');
      return;
    }
    try {
      const category = await createCategory.mutateAsync({ data: { name: trimmed } });
      await queryClient.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
      setCategoryId(category.id);
      setNewCategory('');
      setCategoryVisible(false);
      setFormError('');
    } catch (error) {
      setFormError(`La catégorie n’a pas pu être créée. ${errorMessage(error, 'Réessayez.')}`);
    }
  };

  const renameCategory = async () => {
    if (!editingCategory) return;
    const trimmed = editCategoryName.trim();
    if (!trimmed) {
      setFormError('Le nom de la catégorie est obligatoire.');
      return;
    }
    try {
      await updateCategory.mutateAsync({ id: editingCategory.id, data: { name: trimmed } });
      await queryClient.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      setEditingCategory(null);
      setFormError('');
    } catch (error) {
      setFormError(`La catégorie n’a pas pu être renommée. ${errorMessage(error, 'Ce nom existe peut-être déjà.')}`);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    const usedBy = products.filter((product) => product.category.id === deletingCategory.id).length;
    if (usedBy > 0 && !replacementCategoryId) {
      setFormError('Sélectionnez une catégorie de remplacement pour conserver les produits.');
      return;
    }
    try {
      await deleteCategory.mutateAsync({
        id: deletingCategory.id,
        data: replacementCategoryId ? { replacementCategoryId } : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      setDeletingCategory(null);
      setReplacementCategoryId('');
      setFormError('');
    } catch (error) {
      setFormError(`La catégorie n’a pas pu être supprimée. ${errorMessage(error, 'Réessayez.')}`);
    }
  };

  const submitProduct = async () => {
    if (!isOnline) { setFormError('La gestion du catalogue nécessite une connexion.'); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { setFormError('Le nom du produit est obligatoire.'); return; }
    if (!categoryId) { setFormError('Sélectionnez une catégorie.'); return; }
    const priceError = validateInteger(price, 'Le prix');
    const quantityError = validateInteger(quantity, 'La quantité');
    if (priceError || quantityError) { setFormError(priceError ?? quantityError ?? 'Valeur invalide.'); return; }
    setBusy(true);
    setBusyLabel(image ? 'Téléversement…' : 'Création…');
    setFormError('');
    try {
      let imagePath: string | null = null;
      if (image) {
        const contentType = (image.mimeType ?? 'image/jpeg') as AllowedType;
        const blob = await (await fetch(image.uri)).blob();
        if (blob.size > MAX_IMAGE_BYTES) throw new Error('L’image doit faire au maximum 5 Mo.');
        const upload = await requestUpload.mutateAsync({
          data: { name: image.fileName ?? `produit-${Date.now()}.jpg`, size: image.fileSize ?? blob.size, contentType },
        });
        const response = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
        if (!response.ok) throw new Error('Le téléversement de l’image a échoué.');
        imagePath = upload.objectPath;
      }
      setBusyLabel('Enregistrement…');
      await createProduct.mutateAsync({
        data: { name: trimmedName, categoryId, price: Number(price), stockQuantity: Number(quantity), imagePath },
      });
      await queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      setFormVisible(false);
      resetForm();
    } catch (error) {
      setFormError(`Le produit n’a pas pu être créé. ${errorMessage(error, 'Vérifiez la connexion puis réessayez.')}`);
    } finally {
      setBusy(false);
      setBusyLabel('Création…');
    }
  };

  const saveStock = async () => {
    if (!isOnline) { Alert.alert('Hors ligne', 'La modification des stocks nécessite une connexion.'); return; }
    if (!stockProduct || updateStock.isPending) return;
    const validation = validateInteger(stockValue, 'Le stock');
    if (validation) { Alert.alert('Stock invalide', validation); return; }
    try {
      await updateStock.mutateAsync({ id: stockProduct.id, data: { stockQuantity: Number(stockValue) } });
      await queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      setStockProduct(null);
    } catch (error) {
      Alert.alert('Mise à jour impossible', errorMessage(error, 'Réessayez.'));
    }
  };

  React.useEffect(() => {
    if (productsQuery.data && categoriesQuery.data) void saveCatalog(productsQuery.data, categoriesQuery.data);
  }, [categoriesQuery.data, productsQuery.data, saveCatalog]);

  if (authMe.isLoading || ((productsQuery.isLoading || categoriesQuery.isLoading) && !catalog)) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.centerText, { color: colors.mutedForeground }]}>Chargement du catalogue…</Text></View>;
  }
  if (authMe.isError) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><Feather name="lock" size={35} color={colors.primary} /><Text style={[styles.centerText, { color: colors.foreground }]}>Vos permissions n’ont pas pu être vérifiées.</Text></View>;
  }
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View><Text style={[styles.eyebrow, { color: colors.accentForeground }]}>INVENTAIRE</Text><Text style={[styles.title, { color: colors.foreground }]}>Stocks & catalogue</Text></View>
           {canManage && isOnline && <Pressable testID="add-product" onPress={() => { resetForm(); setFormVisible(true); }} style={[styles.iconButton, { backgroundColor: colors.secondary }]}><Feather name="plus" size={20} color={colors.primary} /></Pressable>}
        </View>
        {authMe.data?.role === 'admin' && <View style={[styles.importCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.productName, { color: colors.foreground }]}>Importer depuis Excel</Text>
          <Text style={[styles.productCategory, { color: colors.mutedForeground }]}>Fichier .xlsx (3 Mo max) : première ligne « Nom | Catégorie | Prix | Stock », puis un produit par ligne. Les produits déjà présents sont conservés, sans modifier leurs prix ni leurs stocks.</Text>
          <Pressable testID="import-products" disabled={!isOnline || importProducts.isPending} onPress={() => { void importWorkbook(); }} style={[styles.importButton, { backgroundColor: colors.primary, opacity: !isOnline || importProducts.isPending ? 0.5 : 1 }]}>
            <Feather name="upload" size={17} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>{importProducts.isPending ? 'Importation…' : 'Choisir un fichier Excel'}</Text>
          </Pressable>
          {!!importMessage && <Text style={[styles.productCategory, { color: colors.foreground }]}>{importMessage}</Text>}
        </View>}
         {!isOnline && <View style={[styles.permission, { backgroundColor: colors.secondary }]}><Feather name="wifi-off" size={18} color={colors.primary} /><Text style={[styles.permissionText, { color: colors.secondaryForeground }]}>Hors ligne · {catalog ? `Dernière synchro ${new Date(catalog.syncedAt).toLocaleDateString('fr-FR')}` : 'Aucun catalogue local'}. Les modifications restent désactivées.</Text></View>}
         {!canManage && <View style={[styles.permission, { backgroundColor: colors.secondary }]}><Feather name="eye" size={18} color={colors.primary} /><Text style={[styles.permissionText, { color: colors.secondaryForeground }]}>Mode lecture seule : seuls les administrateurs et les gérants peuvent modifier le catalogue et les stocks.</Text></View>}
        {lowStockCount > 0 && <View style={[styles.alert, { backgroundColor: '#FFF1E5', borderColor: '#F0D0B6' }]}><Feather name="alert-triangle" size={18} color="#B86A3A" /><Text style={[styles.alertText, { color: colors.foreground }]}>{lowStockCount} alerte{lowStockCount > 1 ? 's' : ''} de stock à traiter.</Text></View>}
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            testID="stock-product-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un produit ou une catégorie"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {!!search && Platform.OS !== 'ios' && (
            <Pressable testID="clear-stock-search" onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Produits ({search ? `${visibleProducts.length}/${products.length}` : products.length})
        </Text>
         {canManage && isOnline && categories.length > 0 && <View style={[styles.categoryPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
           <View style={styles.categoryPanelHeader}><Text style={[styles.categoryPanelTitle, { color: colors.foreground }]}>Gérer les catégories</Text><Text style={[styles.categoryPanelHint, { color: colors.mutedForeground }]}>Renommer ou retirer sans supprimer les produits</Text></View>
           {categories.map((category) => <View key={category.id} style={[styles.categoryManageRow, { borderTopColor: colors.border }]}>
             <Text style={[styles.categoryManageName, { color: colors.foreground }]}>{category.name}</Text>
             <Pressable testID={`rename-category-${category.id}`} onPress={() => { setEditingCategory(category); setEditCategoryName(category.name); setFormError(''); }} hitSlop={8}><Feather name="edit-2" size={17} color={colors.primary} /></Pressable>
             <Pressable testID={`delete-category-${category.id}`} onPress={() => { setDeletingCategory(category); setReplacementCategoryId(''); setFormError(''); }} hitSlop={8}><Feather name="trash-2" size={17} color="#B42318" /></Pressable>
           </View>)}
         </View>}
         {productsQuery.isError && !catalog ? <Text style={[styles.centerText, { color: '#B42318' }]}>Impossible de charger les produits.</Text> : products.length === 0 ? <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Aucun produit dans le catalogue.</Text> : visibleProducts.length === 0 ? <View style={styles.noResult}><Feather name="search" size={26} color={colors.mutedForeground} /><Text style={[styles.centerText, { color: colors.mutedForeground }]}>Aucun produit ne correspond à « {search.trim()} ».</Text></View> : visibleProducts.map((product) => <ProductRow key={product.id} product={product} editable={canManage && isOnline} onStock={() => { setStockProduct(product); setStockValue(String(product.stockQuantity)); }} />)}
      </ScrollView>

      <Modal visible={formVisible} animationType="slide" transparent onRequestClose={() => !busy && setFormVisible(false)}>
        <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouveau produit</Text><Pressable disabled={busy} onPress={() => setFormVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.foreground }]}>Nom du produit</Text><TextInput value={name} onChangeText={setName} placeholder="Ex. Poulet braisé" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{categories.map((category) => <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.option, { backgroundColor: category.id === categoryId ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={{ color: category.id === categoryId ? colors.primaryForeground : colors.foreground }}>{category.name}</Text></Pressable>)}<Pressable onPress={() => setCategoryVisible(true)} style={[styles.option, { borderColor: colors.primary }]}><Text style={{ color: colors.primary }}>+ Nouvelle catégorie</Text></Pressable></ScrollView>
            <Text style={[styles.label, { color: colors.foreground }]}>Prix (F CFA)</Text><TextInput value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Stock initial</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <Pressable onPress={() => { void pickImage(); }} style={[styles.imagePicker, { borderColor: colors.border, backgroundColor: colors.card }]}>{image ? <ExpoImage source={{ uri: image.uri }} style={styles.preview} contentFit="cover" /> : <><Feather name="image" size={22} color={colors.primary} /><Text style={[styles.imageText, { color: colors.foreground }]}>Ajouter une image (facultatif)</Text><Text style={[styles.hint, { color: colors.mutedForeground }]}>JPEG, PNG ou WebP · 5 Mo maximum</Text></>}</Pressable>
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable disabled={busy} onPress={() => { void submitProduct(); }} style={[styles.submit, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>{busy ? <View style={styles.busyRow}><ActivityIndicator color={colors.primaryForeground} /><Text style={[styles.submitText, { color: colors.primaryForeground }]}>{busyLabel}</Text></View> : <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Créer le produit</Text>}</Pressable>
          </ScrollView>
        </View></View>
      </Modal>

      <Modal visible={categoryVisible} transparent animationType="fade" onRequestClose={() => setCategoryVisible(false)}><View style={styles.backdrop}><View style={[styles.smallSheet, { backgroundColor: colors.background }]}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouvelle catégorie</Text><TextInput autoFocus value={newCategory} onChangeText={setNewCategory} placeholder="Nom de la catégorie" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />{formError ? <Text style={styles.error}>{formError}</Text> : null}<View style={styles.modalActions}><Pressable onPress={() => setCategoryVisible(false)}><Text style={{ color: colors.mutedForeground }}>Annuler</Text></Pressable><Pressable disabled={createCategory.isPending} onPress={() => { void createNewCategory(); }}><Text style={[styles.submitText, { color: colors.primary }]}>Créer</Text></Pressable></View></View></View></Modal>
      <Modal visible={!!editingCategory} transparent animationType="fade" onRequestClose={() => setEditingCategory(null)}><View style={styles.backdrop}><View style={[styles.smallSheet, { backgroundColor: colors.background }]}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Renommer la catégorie</Text><TextInput autoFocus value={editCategoryName} onChangeText={setEditCategoryName} placeholder="Nom de la catégorie" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />{formError ? <Text style={styles.error}>{formError}</Text> : null}<View style={styles.modalActions}><Pressable onPress={() => setEditingCategory(null)}><Text style={{ color: colors.mutedForeground }}>Annuler</Text></Pressable><Pressable disabled={updateCategory.isPending} onPress={() => { void renameCategory(); }}><Text style={[styles.submitText, { color: colors.primary }]}>{updateCategory.isPending ? 'Enregistrement…' : 'Enregistrer'}</Text></Pressable></View></View></View></Modal>
      <Modal visible={!!deletingCategory} transparent animationType="fade" onRequestClose={() => setDeletingCategory(null)}><View style={styles.backdrop}><View style={[styles.smallSheet, { backgroundColor: colors.background }]}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Supprimer « {deletingCategory?.name} » ?</Text><Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>Les produits ne seront pas supprimés. Si la catégorie contient des produits, choisissez où les déplacer.</Text>{deletingCategory && products.some((product) => product.category.id === deletingCategory.id) && <><Text style={[styles.label, { color: colors.foreground }]}>Nouvelle catégorie des produits</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{categories.filter((category) => category.id !== deletingCategory.id).map((category) => <Pressable key={category.id} onPress={() => setReplacementCategoryId(category.id)} style={[styles.option, { backgroundColor: category.id === replacementCategoryId ? colors.primary : colors.card, borderColor: colors.border }]}><Text style={{ color: category.id === replacementCategoryId ? colors.primaryForeground : colors.foreground }}>{category.name}</Text></Pressable>)}</ScrollView></>}{formError ? <Text style={styles.error}>{formError}</Text> : null}<View style={styles.modalActions}><Pressable onPress={() => setDeletingCategory(null)}><Text style={{ color: colors.mutedForeground }}>Annuler</Text></Pressable><Pressable disabled={deleteCategory.isPending} onPress={() => { void confirmDeleteCategory(); }}><Text style={[styles.submitText, { color: '#B42318' }]}>{deleteCategory.isPending ? 'Suppression…' : 'Supprimer'}</Text></Pressable></View></View></View></Modal>
      <Modal visible={!!stockProduct} transparent animationType="fade" onRequestClose={() => setStockProduct(null)}><View style={styles.backdrop}><View style={[styles.smallSheet, { backgroundColor: colors.background }]}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Ajuster le stock</Text><Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>{stockProduct?.name}</Text><TextInput value={stockValue} onChangeText={setStockValue} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><View style={styles.modalActions}><Pressable onPress={() => setStockProduct(null)}><Text style={{ color: colors.mutedForeground }}>Annuler</Text></Pressable><Pressable disabled={updateStock.isPending} onPress={() => { void saveStock(); }}><Text style={[styles.submitText, { color: colors.primary }]}>{updateStock.isPending ? 'Enregistrement…' : 'Enregistrer'}</Text></Pressable></View></View></View></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  importCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 9, marginBottom: 17 },
  importButton: { minHeight: 45, borderRadius: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 110 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, centerText: { textAlign: 'center', fontSize: 13, marginTop: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 13, marginBottom: 20 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, title: { fontSize: 28, fontWeight: '800', marginTop: 6 }, iconButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  permission: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 13, marginBottom: 14 }, permissionText: { flex: 1, fontSize: 12, lineHeight: 18 }, alert: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 15, padding: 13, marginBottom: 22 }, alertText: { fontSize: 13, fontWeight: '700' }, sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  categoryPanel: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 18 }, categoryPanelHeader: { marginBottom: 7 }, categoryPanelTitle: { fontSize: 13, fontWeight: '800' }, categoryPanelHint: { fontSize: 11, marginTop: 3 }, categoryManageRow: { minHeight: 42, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }, categoryManageName: { flex: 1, fontSize: 13, fontWeight: '600' },
  searchBox: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 9 }, searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 }, noResult: { alignItems: 'center', paddingVertical: 28 },
  productCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11 }, productThumb: { width: 62, height: 62, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, productDetails: { flex: 1, minWidth: 0 }, productName: { fontSize: 14, fontWeight: '800' }, productCategory: { fontSize: 11, marginTop: 3 }, productPrice: { fontSize: 12, fontWeight: '800', marginTop: 4 }, stockStatus: { fontSize: 11, fontWeight: '700', marginTop: 3 }, stockButton: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, alignItems: 'center', gap: 3 }, stockButtonText: { fontSize: 10, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,24,19,0.45)' }, sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }, smallSheet: { margin: 22, borderRadius: 20, padding: 20 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14 }, modalCopy: { fontSize: 13, marginBottom: 12 }, label: { fontSize: 12, fontWeight: '700', marginTop: 13, marginBottom: 6 }, input: { minHeight: 45, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, optionRow: { gap: 8, paddingVertical: 3 }, option: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 }, imagePicker: { minHeight: 120, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, marginTop: 16, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' }, preview: { width: '100%', height: 170 }, imageText: { fontSize: 13, fontWeight: '700' }, hint: { fontSize: 11 }, error: { color: '#B42318', fontSize: 12, marginTop: 10, lineHeight: 17 }, submit: { minHeight: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, submitText: { fontSize: 14, fontWeight: '800' }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 24, marginTop: 18 },
});