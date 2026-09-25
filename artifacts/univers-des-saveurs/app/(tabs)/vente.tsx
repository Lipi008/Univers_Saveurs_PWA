import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useLocalAuth';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Crypto from 'expo-crypto';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Category, formatCFA, Product, useOrder } from '@/context/OrderContext';
import { getGetAuthMeQueryKey, getGetProductsQueryKey, getGetSalesEpochQueryKey, Sale, useCreateSale, useGetAuthMe, useGetCategories, useGetDiningLocations, useGetProducts, useGetSalesEpoch } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineSync } from '@/context/OfflineSyncContext';
import { compactReceiptNumber } from '@/utils/receipt';
import {
  printReceiptOverBluetooth,
  printReceiptOverUsb,
  supportsDirectBluetoothPrinting,
  supportsDirectUsbPrinting,
  ThermalReceipt,
} from '@/utils/directThermalPrinter';

const THERMAL_PAPER_WIDTH = '58mm';

const receiptLogoModule = require('../../assets/images/icon.png');

type PaymentDetails = {
  paymentMethod: string;
  cashTendered: number;
  cashAmount: number;
  waveAmount: number;
  orangeMoneyAmount: number;
};

function amountInput(value: string) {
  const parsed = Number(value.replace(/\D/g, ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function productImageUrl(imageUrl: string | null) {
  if (!imageUrl) return null;
  if (Platform.OS === 'web' || /^https?:\/\//i.test(imageUrl)) return imageUrl;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}` : imageUrl;
}

function mapProduct(product: import('@workspace/api-client-react').Product): Product {
  return {
    id: product.id,
    name: product.name,
    category: product.category.name,
    price: product.price,
    note: product.category.name,
    color: '#B86A3A',
    stockQuantity: product.stockQuantity,
    imageUrl: product.imageUrl,
  };
}

function ProductCard({ product, quantity, onAdd, onDecrease, isTest }: { product: Product; quantity: number; onAdd: () => void; onDecrease: () => void; isTest: boolean }) {
  const colors = useColors();
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getToken().then((value) => { if (active) setToken(value); });
    return () => { active = false; };
  }, [getToken]);
  const imageUrl = productImageUrl(product.imageUrl);
  const soldOut = !isTest && product.stockQuantity <= 0;
  const atLimit = !isTest && quantity >= product.stockQuantity;
  return (
    <Pressable
      testID={`product-${product.id}`}
      onPress={onAdd}
      style={({ pressed }) => [styles.productCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}
    >
      <View style={[styles.productArt, { backgroundColor: product.color }]}>
        {imageUrl ? <ExpoImage source={{ uri: imageUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.productImage} contentFit="cover" /> : <Feather name={product.category.toLowerCase().includes('boisson') ? 'droplet' : product.category.toLowerCase().includes('pât') ? 'coffee' : 'award'} size={25} color="#FFF8E6" />}
        {quantity > 0 && (
          <View style={[styles.quantityBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.quantityBadgeText, { color: colors.primaryForeground }]}>{quantity}</Text>
          </View>
        )}
      </View>
      <View style={styles.productCopy}>
        <Text numberOfLines={1} style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
        <Text numberOfLines={1} style={[styles.productNote, { color: colors.mutedForeground }]}>{product.note}</Text>
        <Text style={[styles.productPrice, { color: colors.primary }]}>{formatCFA(product.price)}</Text>
        <Text style={[styles.stockText, { color: soldOut ? '#B42318' : colors.mutedForeground }]}>{soldOut ? 'Rupture de stock' : `${product.stockQuantity} disponible${product.stockQuantity > 1 ? 's' : ''}`}</Text>
      </View>
      <View style={[styles.addButton, { backgroundColor: colors.secondary, opacity: soldOut || atLimit ? 0.4 : 1 }]}>
        <Feather name="plus" size={18} color={colors.primary} />
      </View>
      {quantity > 0 && (
        <Pressable
          testID={`decrease-product-${product.id}`}
          accessibilityLabel={`Réduire la quantité de ${product.name}`}
          onPress={(event) => {
            event.stopPropagation();
            onDecrease();
          }}
          style={[styles.removeButton, { backgroundColor: colors.primary }]}
        >
          <Feather name="minus" size={16} color={colors.primaryForeground} />
        </Pressable>
      )}
    </Pressable>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character);
}

async function getPrintableLogoUri() {
  if (Platform.OS === 'web') {
    const sourceUri = Asset.fromModule(receiptLogoModule).uri;
    const response = await fetch(sourceUri);
    if (!response.ok) throw new Error("Le logo n'a pas pu être chargé.");
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Le logo n'a pas pu être intégré au reçu."));
      reader.readAsDataURL(blob);
    });
  }

  const asset = Asset.fromModule(receiptLogoModule);
  await asset.downloadAsync();
  const localUri = asset.localUri ?? asset.uri;
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:image/png;base64,${base64}`;
}

function ReceiptModal({ visible, onClose, onNewOrder, payment, isTest }: { visible: boolean; onClose: () => void; onNewOrder: () => void; payment: PaymentDetails; isTest: boolean }) {
  const colors = useColors();
  const { cart, subtotal, table, clearCart } = useOrder();
  const createSale = useCreateSale();
  const queryClient = useQueryClient();
  const { isOnline, catalog, enqueueSale, optimisticReduceStock } = useOfflineSync();
  const epochQuery = useGetSalesEpoch({ query: { queryKey: getGetSalesEpochQueryKey(), enabled: isOnline, staleTime: 0, refetchOnMount: 'always' } });
  const [printing, setPrinting] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [saveError, setSaveError] = useState('');
  const [pendingSync, setPendingSync] = useState(false);
  const submissionStarted = useRef(false);
  const clientRequestId = useRef(Crypto.randomUUID());
  const now = sale ? new Date(sale.createdAt) : new Date();
  const receiptNumber = sale ? compactReceiptNumber(sale.receiptNumber) : 'Enregistrement…';
  const receiptLines = sale?.items ?? cart;
  const receiptSubtotal = sale?.subtotal ?? subtotal;
  const receiptTable = sale?.tableLabel ?? table;
  const receiptPayment = sale?.paymentMethod ?? payment.paymentMethod;
  const cashTendered = sale?.cashTendered ?? payment.cashTendered;
  const cashAmount = sale?.cashAmount ?? payment.cashAmount;
  const waveAmount = sale?.waveAmount ?? payment.waveAmount;
  const orangeMoneyAmount = sale?.orangeMoneyAmount ?? payment.orangeMoneyAmount;
  const changeDue = sale?.changeDue ?? Math.max(0, cashTendered - cashAmount);
  const totalReceived = cashAmount + waveAmount + orangeMoneyAmount;
  const isTakeaway = receiptTable.trim().toLocaleLowerCase('fr-FR') === 'à emporter';
  const diningMode = isTakeaway ? 'À EMPORTER' : 'SUR PLACE';
  const lineAmount = (line: (typeof receiptLines)[number]) =>
    'lineTotal' in line ? line.lineTotal : line.price * line.quantity;

  useEffect(() => {
    if (!visible || cart.length === 0 || submissionStarted.current || sale) return;
    if (isOnline && !epochQuery.data) {
      if (epochQuery.isError) setSaveError('Impossible de vérifier la synchronisation. Réessayez une fois la connexion rétablie.');
      return;
    }
    submissionStarted.current = true;
    setSaveError('');
    const payload = {
      tableLabel: table,
      paymentMethod: payment.paymentMethod,
      cashTendered: payment.cashTendered,
      cashAmount: payment.cashAmount,
      waveAmount: payment.waveAmount,
      orangeMoneyAmount: payment.orangeMoneyAmount,
      clientRequestId: clientRequestId.current,
      salesEpoch: isOnline ? epochQuery.data!.epoch : (catalog?.salesEpoch ?? 0),
      testEpoch: isOnline ? epochQuery.data!.testEpoch : (catalog?.testEpoch ?? 0),
      isTest,
      items: cart.map((line) => ({ productId: line.id, quantity: line.quantity })),
    };
    const queueLocally = async () => {
      await enqueueSale(payload);
      if (!isTest) await optimisticReduceStock(payload.items);
      const localSale = {
        id: `local-${clientRequestId.current}`,
        receiptNumber: `${isTest ? 'ESSAI-HL' : 'HL'}-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${clientRequestId.current.slice(0, 5).toUpperCase()}`,
        isTest,
        clerkUserId: '',
        tableLabel: table,
        paymentMethod: payment.paymentMethod,
        subtotal,
        cashTendered: payment.cashTendered,
        cashAmount: payment.cashAmount,
        waveAmount: payment.waveAmount,
        orangeMoneyAmount: payment.orangeMoneyAmount,
        changeDue: Math.max(0, payment.cashTendered - payment.cashAmount),
        createdAt: new Date().toISOString(),
        items: cart.map((line) => ({ id: `local-item-${line.id}`, saleId: `local-${clientRequestId.current}`, productId: line.id, name: line.name, unitPrice: line.price, quantity: line.quantity, lineTotal: line.price * line.quantity })),
      } as Sale;
      setPendingSync(true);
      setSale(localSale);
      clearCart();
    };
    if (!isOnline) {
      void queueLocally();
      return;
    }
    void createSale.mutateAsync({ data: payload }).then((result) => {
      setSale(result);
      clearCart();
      void queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
    }).catch((error: unknown) => {
      const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
      if (!status) {
        void queueLocally();
        return;
      }
      submissionStarted.current = false;
      setSaveError(error instanceof Error && error.message ? `La vente n’a pas pu être enregistrée. ${error.message}` : 'La vente n’a pas pu être enregistrée. Vérifiez les articles puis réessayez.');
    });
  }, [cart, catalog?.salesEpoch, catalog?.testEpoch, clearCart, createSale, enqueueSale, epochQuery.data, epochQuery.isError, isOnline, isTest, optimisticReduceStock, payment, queryClient, sale, subtotal, table, visible]);

  useEffect(() => {
    if (visible) return;
    submissionStarted.current = false;
    setSale(null);
    setPendingSync(false);
    setSaveError('');
    clientRequestId.current = Crypto.randomUUID();
  }, [visible]);

  const retrySave = () => {
    submissionStarted.current = false;
    setSale(null);
    setPendingSync(false);
    clientRequestId.current = Crypto.randomUUID();
    setSaveError('');
  };

  const startNewOrder = () => {
    if (!sale) return;
    clearCart();
    submissionStarted.current = false;
    setSale(null);
    setPendingSync(false);
    clientRequestId.current = Crypto.randomUUID();
    setSaveError('');
    onClose();
    onNewOrder();
  };

  const printReceipt = async () => {
    if (!sale) {
      Alert.alert('Vente non enregistrée', 'Enregistrez la vente avant de l’imprimer.');
      return;
    }
    setPrinting(true);
    if (Platform.OS === 'web') {
      const previousPrintStyles = document.getElementById('univers-receipt-print-styles');
      previousPrintStyles?.remove();

      const printStyles = document.createElement('style');
      printStyles.id = 'univers-receipt-print-styles';
      printStyles.textContent = `
        @page { size: ${THERMAL_PAPER_WIDTH} auto; margin: 0; }
        @media print {
          html,
          body {
            background: #FFFFFF !important;
            margin: 0 !important;
            padding: 0 !important;
            width: ${THERMAL_PAPER_WIDTH} !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-receipt,
          #printable-receipt * {
            visibility: visible !important;
          }
          #printable-receipt {
            background: #FFFFFF !important;
            border-radius: 0 !important;
            bottom: auto !important;
            color: #000000 !important;
            left: 0 !important;
            margin: 0 !important;
            max-height: none !important;
            max-width: ${THERMAL_PAPER_WIDTH} !important;
            overflow: visible !important;
            padding: 2mm !important;
            position: absolute !important;
            top: 0 !important;
            transform: none !important;
            width: ${THERMAL_PAPER_WIDTH} !important;
          }
          #printable-receipt * {
            border-color: #000000 !important;
            color: #000000 !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          #printable-receipt-lines {
            max-height: none !important;
            overflow: visible !important;
          }
          [data-testid^="receipt-item-row-"] {
            align-items: start !important;
            display: grid !important;
            grid-template-columns: 6.5mm minmax(0, 1fr) 17mm !important;
            column-gap: 0 !important;
            margin-bottom: 1.5mm !important;
          }
          [data-testid^="receipt-item-quantity-"] {
            font-size: 10.5px !important;
            font-variant-numeric: tabular-nums;
            line-height: 1.25 !important;
            text-align: left !important;
            white-space: nowrap !important;
          }
          [data-testid^="receipt-item-name-"] {
            font-size: 10.5px !important;
            line-height: 1.25 !important;
            overflow-wrap: anywhere !important;
            padding-right: 2mm !important;
            text-align: left !important;
          }
          [data-testid^="receipt-item-amount-"],
          [data-testid="receipt-total-amount"] {
            font-variant-numeric: tabular-nums;
            text-align: right !important;
            white-space: nowrap !important;
          }
          [data-testid^="receipt-item-amount-"] {
            font-size: 10.5px !important;
            line-height: 1.25 !important;
          }
          [data-testid="receipt-total-row"] {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 17mm !important;
          }
          #printable-receipt img {
            filter: grayscale(1) contrast(1.35);
            opacity: 1 !important;
          }
          [data-testid="print-receipt"],
          [data-testid="close-receipt"],
          [data-testid="new-order"] {
            display: none !important;
          }
        }
      `;
      document.head.appendChild(printStyles);

      const cleanup = () => printStyles.remove();
      window.addEventListener('afterprint', cleanup, { once: true });
      try {
        window.print();
      } catch (error) {
        cleanup();
        Alert.alert('Impression impossible', error instanceof Error ? error.message : "La fenêtre d'impression n'a pas pu être ouverte.");
      } finally {
        window.setTimeout(cleanup, 60_000);
        setPrinting(false);
      }
      return;
    }

    try {
      const logoUri = await getPrintableLogoUri();
       const lines = receiptLines.map((line) => `
        <tr>
          <td class="quantity">${line.quantity} ×</td>
          <td class="item-name">${escapeHtml(line.name)}</td>
           <td class="amount">${escapeHtml(formatCFA(lineAmount(line)))}</td>
        </tr>
      `).join('');
      const html = `
          <!doctype html>
          <html lang="fr">
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Reçu ${escapeHtml(receiptNumber)}</title>
              <style>
                 @page { size: ${THERMAL_PAPER_WIDTH} auto; margin: 0; }
                * { box-sizing: border-box; }
                html, body { background: #FFFFFF; color: #000000; font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; width: ${THERMAL_PAPER_WIDTH}; }
                .receipt { background: #FFFFFF; color: #000000; margin: 0; padding: 2mm; width: ${THERMAL_PAPER_WIDTH}; }
                .header { border-bottom: 1px dashed #000000; padding-bottom: 2mm; text-align: center; }
                .logo { display: block; filter: grayscale(1) contrast(1.35); height: 15mm; margin: 0 auto 1.5mm; object-fit: contain; width: 15mm; }
                h1 { color: #000000; font-size: 14px; margin: 0 0 1mm; }
                p { color: #000000; font-size: 9px; margin: .75mm 0; }
                table { border-collapse: collapse; font-size: 9px; line-height: 1.2; margin: 2mm 0; table-layout: fixed; width: 100%; }
                td { padding: 1mm 0; vertical-align: top; }
                .quantity { font-variant-numeric: tabular-nums; text-align: left; white-space: nowrap; width: 6.5mm; }
                .item-name { overflow-wrap: anywhere; padding-right: 1mm; text-align: left; }
                .amount { font-variant-numeric: tabular-nums; padding-left: 1mm; text-align: right; white-space: nowrap; width: 17mm; }
                .total { border-top: 1px dashed #000000; display: flex; font-size: 12px; font-weight: bold; justify-content: space-between; padding-top: 2mm; }
                .total span:last-child { color: #000000; font-size: 14px; font-variant-numeric: tabular-nums; min-width: 17mm; text-align: right; white-space: nowrap; }
                 .payment { align-items: center; display: flex; justify-content: space-between; margin-top: 1.5mm; }
                .payment-pill { border: 1px solid #000000; border-radius: 0; color: #000000; font-size: 9px; font-weight: bold; padding: .75mm 1.5mm; }
                 .sale-status { border: 1px solid #000000; font-size: 9px; font-weight: bold; margin-top: 2mm; padding: 1.5mm; text-align: center; }
                .thanks { color: #000000; font-weight: bold; margin-top: 3mm; text-align: center; }
                 .print-action { background: #D9AA32; border: 0; border-radius: 10px; color: #2B1813; cursor: pointer; display: block; font-size: 13px; font-weight: bold; margin: 12px auto; max-width: 320px; padding: 11px 16px; width: calc(100% - 16px); }
                @media print { .print-action { display: none; } }
              </style>
            </head>
            <body>
             <button class="print-action" onclick="window.print()">Imprimer ce reçu (58 mm)</button>
              <main class="receipt">
                <div class="header">
                  <img class="logo" src="${escapeHtml(logoUri)}" alt="Logo L'Univers des Saveurs" />
                  <h1>L'Univers des Saveurs</h1>
                  <p>${isTest ? 'VENTE D’ESSAI · SANS ENCAISSEMENT RÉEL' : 'Reçu de caisse'} • ${escapeHtml(receiptNumber)}</p>
            <p>${escapeHtml(now.toLocaleDateString('fr-FR'))} à ${escapeHtml(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</p>
            <p><strong>MODE : ${escapeHtml(diningMode)}</strong>${isTakeaway ? '' : ` • ${escapeHtml(receiptTable)}`}</p>
                </div>
                <table><tbody>${lines}</tbody></table>
                 <div class="total"><span>TOTAL À PAYER</span><span>${escapeHtml(formatCFA(receiptSubtotal))}</span></div>
                  <div class="sale-status">STATUT : PAYÉ</div>
                 <div class="payment"><p>Paiement</p><span class="payment-pill">${escapeHtml(receiptPayment)}</span></div>
                 ${cashAmount > 0 ? `<p>Espèces : ${escapeHtml(formatCFA(cashAmount))}</p>` : ''}
                 ${waveAmount > 0 ? `<p>Wave : ${escapeHtml(formatCFA(waveAmount))}</p>` : ''}
                 ${orangeMoneyAmount > 0 ? `<p>Orange Money : ${escapeHtml(formatCFA(orangeMoneyAmount))}</p>` : ''}
                 <p><strong>Montant reçu : ${escapeHtml(formatCFA(totalReceived))}</strong></p>
                 ${cashTendered > cashAmount ? `<p>Espèces remises : ${escapeHtml(formatCFA(cashTendered))}</p>` : ''}
                 ${changeDue > 0 ? `<p><strong>Monnaie : ${escapeHtml(formatCFA(changeDue))}</strong></p>` : ''}
                <div class="thanks">Merci et à bientôt !</div>
              </main>
            </body>
          </html>
        `;

      await Print.printAsync({ html });
    } catch (error) {
      Alert.alert('Impression impossible', error instanceof Error ? error.message : "Le reçu n'a pas pu être préparé.");
    } finally {
      setPrinting(false);
    }
  };

  const directReceipt: ThermalReceipt = {
    logoUri: Asset.fromModule(receiptLogoModule).uri,
    receiptNumber,
    isTest,
    date: `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    mode: diningMode,
    table: isTakeaway ? undefined : receiptTable,
    lines: receiptLines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      amount: formatCFA(lineAmount(line)),
    })),
    total: formatCFA(receiptSubtotal),
    paymentMethod: receiptPayment,
    paymentLines: [
      ...(cashAmount > 0 ? [{ label: 'Espèces', amount: formatCFA(cashAmount) }] : []),
      ...(waveAmount > 0 ? [{ label: 'Wave', amount: formatCFA(waveAmount) }] : []),
      ...(orangeMoneyAmount > 0 ? [{ label: 'Orange Money', amount: formatCFA(orangeMoneyAmount) }] : []),
    ],
    totalReceived: formatCFA(totalReceived),
    cashTendered: cashTendered > cashAmount ? formatCFA(cashTendered) : undefined,
    changeDue: changeDue > 0 ? formatCFA(changeDue) : undefined,
  };

  const printDirectly = async (connection: 'bluetooth' | 'usb') => {
    if (!sale) return;
    setPrinting(true);
    try {
      if (connection === 'bluetooth') await printReceiptOverBluetooth(directReceipt);
      else await printReceiptOverUsb(directReceipt);
      Alert.alert('Impression envoyée', 'Le reçu a été envoyé à l’imprimante.');
    } catch (error) {
      const message = error instanceof Error ? error.message : "L'imprimante n'a pas pu être utilisée.";
      if (!/cancel|annul|No device selected/i.test(message)) Alert.alert('Impression impossible', message);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View nativeID="printable-receipt" style={[styles.receiptSheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.receiptTop}>
            <Image source={receiptLogoModule} style={styles.receiptLogo} resizeMode="contain" />
            <Text style={[styles.receiptBrand, { color: colors.primary }]}>L'Univers des Saveurs</Text>
            <Text style={[styles.receiptMeta, { color: isTest ? colors.primary : colors.mutedForeground }]}>{isTest ? 'VENTE D’ESSAI · SANS ENCAISSEMENT RÉEL' : 'Reçu de caisse'} • {receiptNumber}</Text>
             <Text style={[styles.receiptMeta, { color: colors.mutedForeground }]}>{sale ? `${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Enregistrement en cours…'}</Text>
             <Text testID="receipt-dining-mode" style={[styles.receiptMode, { color: colors.foreground }]}>MODE : {diningMode}{isTakeaway ? '' : ` · ${receiptTable}`}</Text>
          </View>
          <View style={[styles.dashedRule, { borderColor: colors.border }]} />
          <ScrollView nativeID="printable-receipt-lines" style={styles.receiptLines} showsVerticalScrollIndicator={false}>
             {receiptLines.map((line) => (
              <View key={line.id} testID={`receipt-item-row-${line.id}`} style={styles.receiptLine}>
                <Text testID={`receipt-item-quantity-${line.id}`} style={[styles.receiptQuantity, { color: colors.foreground }]}>{line.quantity} ×</Text>
                <Text testID={`receipt-item-name-${line.id}`} style={[styles.receiptItemName, { color: colors.foreground }]}>{line.name}</Text>
                 <Text testID={`receipt-item-amount-${line.id}`} style={[styles.receiptAmount, { color: colors.foreground }]}>{formatCFA(lineAmount(line))}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={[styles.dashedRule, { borderColor: colors.border }]} />
          <View testID="receipt-total-row" style={styles.totalLine}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>TOTAL À PAYER</Text>
             <Text testID="receipt-total-amount" style={[styles.totalValue, { color: colors.primary }]}>{formatCFA(receiptSubtotal)}</Text>
          </View>
           <View testID="receipt-paid-status" style={[styles.paidStatus, { borderColor: colors.foreground }]}>
             <Feather name="check-circle" size={15} color={colors.primary} />
             <Text style={[styles.paidStatusText, { color: colors.foreground }]}>STATUT : PAYÉ</Text>
           </View>
          <View style={styles.paymentLine}>
            <Text style={[styles.receiptMeta, { color: colors.mutedForeground }]}>Paiement</Text>
             <Text style={[styles.paymentPill, { backgroundColor: colors.secondary, color: colors.secondaryForeground }]}>{receiptPayment}</Text>
          </View>
           {cashAmount > 0 && <View style={styles.paymentDetail}><Text style={[styles.receiptMeta, { color: colors.mutedForeground }]}>Espèces</Text><Text style={[styles.paymentDetailAmount, { color: colors.foreground }]}>{formatCFA(cashAmount)}</Text></View>}
           {waveAmount > 0 && <View style={styles.paymentDetail}><Text style={[styles.receiptMeta, { color: colors.mutedForeground }]}>Wave</Text><Text style={[styles.paymentDetailAmount, { color: colors.foreground }]}>{formatCFA(waveAmount)}</Text></View>}
           {orangeMoneyAmount > 0 && <View style={styles.paymentDetail}><Text style={[styles.receiptMeta, { color: colors.mutedForeground }]}>Orange Money</Text><Text style={[styles.paymentDetailAmount, { color: colors.foreground }]}>{formatCFA(orangeMoneyAmount)}</Text></View>}
           <View style={styles.paymentDetail}><Text style={[styles.receiptMeta, { color: colors.mutedForeground }]}>Montant reçu</Text><Text style={[styles.paymentDetailAmount, { color: colors.foreground }]}>{formatCFA(totalReceived)}</Text></View>
           {cashTendered > cashAmount && <View style={styles.paymentDetail}><Text style={[styles.receiptMeta, { color: colors.mutedForeground }]}>Espèces remises</Text><Text style={[styles.paymentDetailAmount, { color: colors.foreground }]}>{formatCFA(cashTendered)}</Text></View>}
           {changeDue > 0 && <View style={[styles.changeLine, { backgroundColor: colors.secondary }]}><Text style={[styles.changeLabel, { color: colors.secondaryForeground }]}>MONNAIE À RENDRE</Text><Text style={[styles.changeAmount, { color: colors.primary }]}>{formatCFA(changeDue)}</Text></View>}
            {saveError ? <View style={styles.saveError}><Feather name="alert-circle" size={16} color="#B42318" /><Text style={styles.saveErrorText}>{saveError}</Text><Pressable onPress={retrySave}><Text style={[styles.retryText, { color: colors.primary }]}>Réessayer</Text></Pressable></View> : pendingSync ? <View style={styles.saveError}><Feather name="wifi-off" size={16} color={colors.accentForeground} /><Text style={[styles.saveErrorText, { color: colors.foreground }]}>Reçu local · En attente de synchronisation</Text></View> : !sale ? <Text style={[styles.savingText, { color: colors.mutedForeground }]}>Enregistrement de la vente…</Text> : null}
          <Text style={[styles.thanks, { color: colors.primary }]}>Merci et à bientôt !</Text>
           {Platform.OS === 'web' && supportsDirectBluetoothPrinting() && (
             <View style={styles.directPrintActions}>
               <Pressable testID="print-receipt-bluetooth" onPress={() => { void printDirectly('bluetooth'); }} disabled={printing || !sale} style={[styles.directPrintButton, { backgroundColor: colors.primary, opacity: printing || !sale ? 0.65 : 1 }]}>
                 <Feather name="bluetooth" size={17} color={colors.primaryForeground} />
                 <Text style={[styles.directPrintText, { color: colors.primaryForeground }]}>Bluetooth</Text>
               </Pressable>
               {supportsDirectUsbPrinting() && (
                 <Pressable testID="print-receipt-usb" onPress={() => { void printDirectly('usb'); }} disabled={printing || !sale} style={[styles.directPrintButton, { backgroundColor: colors.primary, opacity: printing || !sale ? 0.65 : 1 }]}>
                   <Feather name="smartphone" size={17} color={colors.primaryForeground} />
                   <Text style={[styles.directPrintText, { color: colors.primaryForeground }]}>USB-C</Text>
                 </Pressable>
               )}
             </View>
           )}
           <Pressable testID="print-receipt" onPress={() => { void printReceipt(); }} disabled={printing || !sale} style={[styles.printButton, { backgroundColor: colors.accent, opacity: printing || !sale ? 0.65 : 1 }]}>
            <Feather name="printer" size={17} color={colors.accentForeground} />
             <Text style={[styles.printButtonText, { color: colors.accentForeground }]}>{printing ? 'Préparation...' : 'Autres options d’impression'}</Text>
          </Pressable>
          <View style={styles.receiptActions}>
            <Pressable testID="close-receipt" onPress={onClose} style={[styles.secondaryButton, { borderColor: colors.border }]}>
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Fermer</Text>
            </Pressable>
             <Pressable testID="new-order" disabled={!sale} onPress={startNewOrder} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: sale ? 1 : 0.55 }]}>
              <Feather name="plus" size={17} color={colors.primaryForeground} />
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Nouvelle commande</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarOffset = Platform.OS === 'web' ? 84 : 49 + insets.bottom;
  const { addToCart, cart, decrease, itemCount, setTable, subtotal, table, syncProducts } = useOrder();
  const productsQuery = useGetProducts();
  const categoriesQuery = useGetCategories();
  const locationsQuery = useGetDiningLocations();
  const { catalog, isOnline, saveCatalog } = useOfflineSync();
  const [selectedCategory, setSelectedCategory] = useState<Category>('Tout');
  const [search, setSearch] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [tablePickerVisible, setTablePickerVisible] = useState(false);
  const [paymentPickerVisible, setPaymentPickerVisible] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [paymentMode, setPaymentMode] = useState<'Espèces' | 'Wave' | 'Orange Money' | 'Mixte'>('Espèces');
  const [cashPartInput, setCashPartInput] = useState('');
  const [cashTenderedInput, setCashTenderedInput] = useState('');
  const [waveInput, setWaveInput] = useState('');
  const [orangeInput, setOrangeInput] = useState('');
  const authMe = useGetAuthMe({ query: { queryKey: getGetAuthMeQueryKey(), staleTime: 60_000 } });
  const salesEpochQuery = useGetSalesEpoch({ query: { queryKey: getGetSalesEpochQueryKey(), enabled: isOnline, staleTime: 0, refetchOnMount: 'always' } });
  const firstName = authMe.data?.firstName?.trim() || authMe.data?.username || 'Utilisateur';
  const initial = firstName.charAt(0).toUpperCase();

  const products = useMemo(
    () => ((isOnline ? productsQuery.data : catalog?.products) ?? catalog?.products ?? productsQuery.data ?? []).map(mapProduct),
    [catalog?.products, isOnline, productsQuery.data],
  );
  useEffect(() => {
    if (productsQuery.data) syncProducts(products, testMode);
  }, [products, productsQuery.data, syncProducts, testMode]);
  const categories = useMemo(() => ['Tout', ...(categoriesQuery.data ?? catalog?.categories ?? []).map((category) => category.name)], [catalog?.categories, categoriesQuery.data]);
  const diningChoices = useMemo(() => [...(locationsQuery.data ?? catalog?.diningLocations ?? []).map((location) => location.name), 'À emporter'], [catalog?.diningLocations, locationsQuery.data]);
  useEffect(() => {
    if (locationsQuery.data && !diningChoices.includes(table)) setTable(diningChoices[0] ?? 'À emporter');
  }, [diningChoices, locationsQuery.data, setTable, table]);
  useEffect(() => {
    if (productsQuery.data && categoriesQuery.data && locationsQuery.data && salesEpochQuery.data) void saveCatalog(productsQuery.data, categoriesQuery.data, locationsQuery.data, salesEpochQuery.data.epoch, salesEpochQuery.data.testEpoch);
  }, [categoriesQuery.data, locationsQuery.data, productsQuery.data, salesEpochQuery.data, saveCatalog]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const categoryMatches = selectedCategory === 'Tout' || product.category === selectedCategory;
    return categoryMatches && `${product.name} ${product.note}`.toLowerCase().includes(search.toLowerCase());
  }), [products, search, selectedCategory]);
  const cashPart = paymentMode === 'Espèces' ? subtotal : paymentMode === 'Mixte' ? amountInput(cashPartInput) : 0;
  const wavePart = paymentMode === 'Wave' ? subtotal : paymentMode === 'Mixte' ? amountInput(waveInput) : 0;
  const orangePart = paymentMode === 'Orange Money' ? subtotal : paymentMode === 'Mixte' ? amountInput(orangeInput) : 0;
  const cashTendered = paymentMode === 'Mixte' ? cashPart : cashPart > 0 ? amountInput(cashTenderedInput) : 0;
  const allocatedPayment = cashPart + wavePart + orangePart;
  const usedPaymentCount = [cashPart, wavePart, orangePart].filter((amount) => amount > 0).length;
  const paymentIsValid = allocatedPayment === subtotal
    && (cashPart === 0 || cashTendered >= cashPart)
    && (paymentMode !== 'Mixte' || usedPaymentCount >= 2);
  const paymentRemainder = subtotal - allocatedPayment;
  const previewChange = Math.max(0, cashTendered - cashPart);

  useEffect(() => {
    if (itemCount === 0 && paymentPickerVisible) setPaymentPickerVisible(false);
  }, [itemCount, paymentPickerVisible]);

  useEffect(() => {
    if (!paymentPickerVisible || paymentMode !== 'Espèces') return;
    setCashTenderedInput(String(subtotal));
  }, [subtotal, paymentPickerVisible, paymentMode]);

  const selectPaymentMode = (mode: typeof paymentMode) => {
    setPaymentMode(mode);
    setCashPartInput('');
    setWaveInput('');
    setOrangeInput('');
    setCashTenderedInput(mode === 'Espèces' ? String(subtotal) : '');
  };

  const confirmPayment = () => {
    const nextCashAmount = paymentMode === 'Espèces' ? subtotal : paymentMode === 'Mixte' ? amountInput(cashPartInput) : 0;
    const nextWaveAmount = paymentMode === 'Wave' ? subtotal : paymentMode === 'Mixte' ? amountInput(waveInput) : 0;
    const nextOrangeAmount = paymentMode === 'Orange Money' ? subtotal : paymentMode === 'Mixte' ? amountInput(orangeInput) : 0;
    const nextCashTendered = paymentMode === 'Mixte' ? nextCashAmount : nextCashAmount > 0 ? amountInput(cashTenderedInput) : 0;
    const nextAllocated = nextCashAmount + nextWaveAmount + nextOrangeAmount;
    const nextUsedMethods = [nextCashAmount, nextWaveAmount, nextOrangeAmount].filter((amount) => amount > 0).length;

    if (nextAllocated !== subtotal) {
      Alert.alert('Répartition incomplète', `Les montants doivent totaliser exactement ${formatCFA(subtotal)}.`);
      return;
    }
    if (paymentMode === 'Mixte' && nextUsedMethods < 2) {
      Alert.alert('Paiement mixte', 'Saisissez un montant dans au moins deux modes de paiement.');
      return;
    }
    if (nextCashAmount > 0 && nextCashTendered < nextCashAmount) {
      Alert.alert('Montant reçu insuffisant', `Le client doit donner au moins ${formatCFA(nextCashAmount)} en espèces.`);
      return;
    }

    setPaymentDetails({
      paymentMethod: paymentMode,
      cashTendered: nextCashTendered,
      cashAmount: nextCashAmount,
      waveAmount: nextWaveAmount,
      orangeMoneyAmount: nextOrangeAmount,
    });
    setPaymentPickerVisible(false);
    setReceiptVisible(true);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/images/icon.png')} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={[styles.eyebrow, { color: colors.accentForeground }]}>SERVICE DU SOIR</Text>
            <Text style={[styles.greeting, { color: colors.foreground }]}>Bonjour, {firstName}</Text>
          </View>
        </View>
        <Pressable testID="profile-button" style={[styles.profile, { backgroundColor: colors.primary }]}>
          <Text style={styles.profileText}>{initial}</Text>
        </Pressable>
      </View>

      <View style={[styles.statusBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statusDot} />
        <Text style={[styles.statusText, { color: colors.foreground }]}>Caisse ouverte</Text>
        <Text style={[styles.statusTime, { color: colors.mutedForeground }]}>depuis 18:30</Text>
        <Feather name="wifi" size={15} color={colors.accentForeground} />
        <Text style={[styles.syncText, { color: colors.accentForeground }]}>{isOnline ? 'Synchronisé' : catalog ? `Hors ligne · ${new Date(catalog.syncedAt).toLocaleDateString('fr-FR')}` : 'Hors ligne'}</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          testID="product-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un article..."
          placeholderTextColor={colors.mutedForeground}
         style={[styles.searchInput, { color: colors.foreground }]}
         />
        <Feather name="sliders" size={17} color={colors.primary} />
      </View>
      {authMe.data?.role === 'admin' && authMe.data.username?.toLowerCase() === 'marlon' && <Pressable testID="test-sale-mode" onPress={() => {
        if (testMode && cart.some((line) => line.quantity > (products.find((product) => product.id === line.id)?.stockQuantity ?? 0))) {
          Alert.alert('Commande d’essai en cours', 'Retirez les articles indisponibles ou terminez la vente d’essai avant de revenir aux ventes réelles.'); return;
        }
        setTestMode((current) => !current);
      }} style={[styles.testMode, { backgroundColor: testMode ? colors.secondary : colors.card, borderColor: testMode ? colors.primary : colors.border }]}>
        <Feather name={testMode ? 'check-square' : 'square'} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}><Text style={[styles.testModeTitle, { color: colors.foreground }]}>Mode vente d’essai {testMode ? 'activé' : 'désactivé'}</Text><Text style={[styles.testModeDetail, { color: colors.mutedForeground }]}>Les essais ne modifient ni le stock, ni les recettes, ni les numéros de reçu réels.</Text></View>
      </Pressable>}

      <ScrollView horizontal style={styles.categoryScroller} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categories.map((category) => {
          const active = category === selectedCategory;
          return (
            <Pressable key={category} testID={`category-${category}`} onPress={() => setSelectedCategory(category)} style={[styles.categoryChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}>
              <Feather name={category === 'Tout' ? 'grid' : 'tag'} size={15} color={active ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.categoryText, { color: active ? colors.primaryForeground : colors.foreground }]}>{category}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeading}>
        <View style={styles.sectionHeadingCopy}>
          <Text numberOfLines={1} style={[styles.sectionTitle, { color: colors.foreground }]}>Prendre une commande</Text>
           <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>{visibleProducts.length} articles disponibles</Text>
        </View>
        <Pressable testID="table-picker" onPress={() => setTablePickerVisible(true)} style={[styles.tableButton, { backgroundColor: colors.secondary }]}>
          <Feather name="map-pin" size={15} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.tableButtonText, { color: colors.secondaryForeground }]}>{table}</Text>
          <Feather name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
      </View>

       {productsQuery.isLoading && !catalog ? <View style={styles.empty}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Chargement des articles…</Text></View> : productsQuery.isError && !catalog ? <View style={styles.empty}><Feather name="alert-circle" size={28} color="#B42318" /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Impossible de charger les articles.</Text><Pressable onPress={() => { void productsQuery.refetch(); }}><Text style={[styles.retryText, { color: colors.primary }]}>Réessayer</Text></Pressable></View> : <FlatList
        style={styles.productsScroll}
        data={visibleProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={[
          styles.productList,
          { paddingBottom: itemCount > 0 ? tabBarOffset + 96 : tabBarOffset + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={visibleProducts.length > 0}
        renderItem={({ item }) => (
          <ProductCard
            isTest={testMode}
            product={item}
            quantity={cart.find((line) => line.id === item.id)?.quantity ?? 0}
             onAdd={() => { if (testMode || item.stockQuantity > (cart.find((line) => line.id === item.id)?.quantity ?? 0)) { void Haptics.selectionAsync(); addToCart(item, testMode); } }}
             onDecrease={() => { void Haptics.selectionAsync(); decrease(item.id); }}
           />
        )}
         ListEmptyComponent={<View style={styles.empty}><Feather name="search" size={28} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun article trouvé</Text></View>}
       />}

       {itemCount > 0 && (productsQuery.isSuccess || !!catalog) && (
        <View style={[styles.cartBar, { backgroundColor: colors.primary, bottom: tabBarOffset }]}>
          <View style={styles.cartSummary}>
            <View style={styles.cartBadge}><Text style={[styles.cartBadgeText, { color: colors.primary }]}>{itemCount}</Text></View>
            <View>
              <Text style={styles.cartLabel}>Commande en cours</Text>
              <Text style={styles.cartTable}>{table}</Text>
            </View>
          </View>
          <Pressable testID="checkout-button" onPress={() => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); selectPaymentMode('Espèces'); setPaymentPickerVisible(true); }} style={[styles.checkoutButton, { backgroundColor: colors.accent }]}>
            <View>
              <Text style={[styles.checkoutLabel, { color: colors.accentForeground }]}>Voir le reçu</Text>
              <Text style={[styles.checkoutText, { color: colors.accentForeground }]}>{formatCFA(subtotal)}</Text>
            </View>
            <Feather name="arrow-right" size={18} color={colors.accentForeground} />
          </Pressable>
        </View>
      )}

      {paymentDetails && <ReceiptModal visible={receiptVisible} payment={paymentDetails} isTest={testMode} onClose={() => setReceiptVisible(false)} onNewOrder={() => setPaymentDetails(null)} />}
      <Modal visible={paymentPickerVisible} transparent animationType="fade" onRequestClose={() => setPaymentPickerVisible(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaymentPickerVisible(false)} />
          <ScrollView
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            contentContainerStyle={styles.paymentPickerScroll}
          >
            <View style={[styles.pickerCard, { backgroundColor: colors.card }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.foreground, marginBottom: 0 }]}>Commande</Text>
              <Pressable onPress={() => setPaymentPickerVisible(false)} hitSlop={12} style={styles.pickerClose}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={[styles.orderSummary, { borderColor: colors.border, backgroundColor: colors.background }]}>
              {cart.map((line) => {
                const product = products.find((p) => p.id === line.id);
                const atLimit = !testMode && product !== undefined && line.quantity >= product.stockQuantity;
                return (
                  <View key={line.id} style={[styles.orderSummaryRow, { borderTopColor: colors.border }]}>
                    <View style={styles.orderQtyRow}>
                      <Pressable onPress={() => { void Haptics.selectionAsync(); decrease(line.id); }} style={[styles.orderQtyBtn, { backgroundColor: colors.secondary }]}>
                        <Feather name="minus" size={12} color={colors.primary} />
                      </Pressable>
                      <Text style={[styles.orderQtyText, { color: colors.foreground }]}>{line.quantity}</Text>
                      <Pressable disabled={atLimit} onPress={() => { if (product) { void Haptics.selectionAsync(); addToCart(product, testMode); } }} style={[styles.orderQtyBtn, { backgroundColor: colors.secondary, opacity: atLimit ? 0.35 : 1 }]}>
                        <Feather name="plus" size={12} color={colors.primary} />
                      </Pressable>
                    </View>
                    <Text numberOfLines={1} style={[styles.orderItemName, { color: colors.foreground }]}>{line.name}</Text>
                    <Text style={[styles.orderItemAmount, { color: colors.foreground }]}>{formatCFA(line.price * line.quantity)}</Text>
                  </View>
                );
              })}
              <View style={[styles.orderSummaryTotal, { borderTopColor: colors.border }]}>
                <Text style={[styles.orderSummaryTotalLabel, { color: colors.mutedForeground }]}>Total à encaisser</Text>
                <Text style={[styles.orderSummaryTotalAmount, { color: colors.primary }]}>{formatCFA(subtotal)}</Text>
              </View>
            </View>
            <Text style={[styles.pickerSubtitle, { color: colors.foreground, fontWeight: '800', marginBottom: 6 }]}>Mode de règlement</Text>
            <View style={styles.paymentModes}>
            {[
              { label: 'Espèces', icon: 'dollar-sign' as const },
              { label: 'Wave', icon: 'smartphone' as const },
              { label: 'Orange Money', icon: 'smartphone' as const },
              { label: 'Mixte', icon: 'shuffle' as const },
            ].map((choice) => (
              <Pressable
                key={choice.label}
                testID={`payment-${choice.label.toLowerCase().replaceAll(' ', '-')}`}
                onPress={() => selectPaymentMode(choice.label as typeof paymentMode)}
                style={[styles.paymentMode, { borderColor: choice.label === paymentMode ? colors.primary : colors.border, backgroundColor: choice.label === paymentMode ? colors.secondary : colors.background }]}
              >
                <Feather name={choice.icon} size={17} color={colors.primary} />
                <Text style={[styles.paymentModeText, { color: colors.foreground }]}>{choice.label}</Text>
              </Pressable>
            ))}
            </View>
            {paymentMode === 'Mixte' && (
              <View style={styles.paymentFields}>
                <Text style={[styles.paymentFieldLabel, { color: colors.foreground }]}>Part en espèces</Text>
                <TextInput testID="cash-part" value={cashPartInput} onChangeText={setCashPartInput} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.paymentInput, { borderColor: colors.border, color: colors.foreground }]} />
                <Text style={[styles.paymentFieldLabel, { color: colors.foreground }]}>Part Wave</Text>
                <TextInput testID="wave-part" value={waveInput} onChangeText={setWaveInput} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.paymentInput, { borderColor: colors.border, color: colors.foreground }]} />
                <Text style={[styles.paymentFieldLabel, { color: colors.foreground }]}>Part Orange Money</Text>
                <TextInput testID="orange-part" value={orangeInput} onChangeText={setOrangeInput} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.mutedForeground} style={[styles.paymentInput, { borderColor: colors.border, color: colors.foreground }]} />
              </View>
            )}
            {paymentMode === 'Espèces' && cashPart > 0 && (
              <View style={styles.paymentFields}>
                <Text style={[styles.paymentFieldLabel, { color: colors.foreground }]}>Montant donné par le client</Text>
                <TextInput testID="cash-tendered" value={cashTenderedInput} onChangeText={setCashTenderedInput} keyboardType="number-pad" placeholder={String(cashPart)} placeholderTextColor={colors.mutedForeground} style={[styles.paymentInput, { borderColor: colors.border, color: colors.foreground }]} />
                <View style={[styles.changePreview, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.changePreviewLabel, { color: colors.secondaryForeground }]}>Monnaie à rendre</Text>
                  <Text style={[styles.changePreviewAmount, { color: colors.primary }]}>{formatCFA(previewChange)}</Text>
                </View>
              </View>
            )}
            {paymentMode === 'Mixte' && (
              <Text style={[styles.paymentBalance, { color: paymentRemainder === 0 ? colors.accentForeground : '#B42318' }]}>
                {paymentRemainder === 0 ? 'Total entièrement réparti' : paymentRemainder > 0 ? `Reste à répartir : ${formatCFA(paymentRemainder)}` : `Dépassement : ${formatCFA(Math.abs(paymentRemainder))}`}
              </Text>
            )}
            <Pressable testID="confirm-payment" onPress={confirmPayment} style={[styles.confirmPayment, { backgroundColor: paymentIsValid ? colors.accent : colors.primary }]}>
              <Text style={[styles.primaryButtonText, { color: paymentIsValid ? colors.accentForeground : colors.primaryForeground }]}>Valider le paiement</Text>
            </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={tablePickerVisible} transparent animationType="fade" onRequestClose={() => setTablePickerVisible(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setTablePickerVisible(false)}>
          <View style={[styles.pickerCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Choisir l’espace</Text>
            {diningChoices.map((choice) => (
              <Pressable key={choice} onPress={() => { setTable(choice); setTablePickerVisible(false); }} style={[styles.pickerChoice, { borderBottomColor: colors.border }]}>
                <Feather name={choice === 'À emporter' ? 'shopping-bag' : 'map-pin'} size={17} color={choice === table ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.pickerChoiceText, { color: choice === table ? colors.primary : colors.foreground }]}>{choice}</Text>
                {choice === table && <Feather name="check" size={17} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  testMode: { marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderRadius: 12, flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12 },
  testModeTitle: { fontSize: 13, fontWeight: '800' },
  testModeDetail: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 51, height: 51, borderRadius: 16 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.35 },
  greeting: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  profile: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  profileText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  statusBar: { marginHorizontal: 20, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, height: 39, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: '#42A66A' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTime: { fontSize: 12, flex: 1 },
  syncText: { fontSize: 11, fontWeight: '600' },
  searchBar: { marginHorizontal: 20, marginTop: 16, borderWidth: 1, borderRadius: 14, height: 47, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  categoryScroller: { flexGrow: 0 },
  categoryRow: { paddingHorizontal: 20, paddingVertical: 15, gap: 8 },
  categoryChip: { height: 35, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryText: { fontSize: 12, fontWeight: '600' },
  sectionHeading: { minHeight: 54, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeadingCopy: { flex: 1, minWidth: 0, paddingRight: 9 },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  tableButton: { maxWidth: 142, borderRadius: 10, paddingHorizontal: 9, height: 34, flexDirection: 'row', alignItems: 'center', gap: 5 },
  tableButtonText: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  productsScroll: { flex: 1 },
  productList: { paddingHorizontal: 20 },
  productRow: { gap: 10, marginBottom: 10 },
  productCard: { flex: 1, minHeight: 194, borderRadius: 16, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  productArt: { height: 93, alignItems: 'center', justifyContent: 'center' },
  productImage: { ...StyleSheet.absoluteFill },
  quantityBadge: { position: 'absolute', right: 9, top: 9, minWidth: 25, height: 25, borderRadius: 13, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  quantityBadgeText: { fontSize: 12, fontWeight: '800' },
  productCopy: { padding: 10, paddingRight: 37 },
  productName: { fontSize: 13, fontWeight: '700' },
  productNote: { fontSize: 10, marginTop: 4 },
  productPrice: { fontSize: 13, fontWeight: '800', marginTop: 8 },
  stockText: { fontSize: 10, marginTop: 4 },
  addButton: { position: 'absolute', right: 9, bottom: 10, width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeButton: { position: 'absolute', right: 43, bottom: 10, width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 50, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14 },
  cartBar: { position: 'absolute', left: 0, right: 0, minHeight: 72, paddingVertical: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  cartSummary: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cartBadge: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#FFF9F0', alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { fontSize: 13, fontWeight: '800' },
  cartLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  cartTable: { color: '#F7EAD2', fontSize: 11, marginTop: 2 },
  checkoutButton: { borderRadius: 12, minHeight: 48, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkoutLabel: { fontSize: 11, fontWeight: '600' },
  checkoutText: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(43,24,19,0.42)', justifyContent: 'flex-end' },
  receiptSheet: { borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 18, maxHeight: '91%' },
  sheetHandle: { width: 39, height: 4, borderRadius: 3, backgroundColor: '#D7C7B5', alignSelf: 'center', marginBottom: 18 },
  receiptTop: { alignItems: 'center' },
  receiptLogo: { width: 58, height: 58, borderRadius: 17 },
  receiptBrand: { fontSize: 16, fontWeight: '800', marginTop: 5 },
  receiptMeta: { fontSize: 10, marginTop: 3 },
  receiptMode: { fontSize: 11, fontWeight: '800', marginTop: 5 },
  dashedRule: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 11 },
  receiptLines: { maxHeight: 160 },
  receiptLine: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7 },
  receiptQuantity: { width: 32, fontSize: 12, fontVariant: ['tabular-nums'] },
  receiptItemName: { flex: 1, fontSize: 12, paddingRight: 6 },
  receiptAmount: { width: 78, fontSize: 12, fontVariant: ['tabular-nums'], textAlign: 'right' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 12, fontWeight: '800' },
  totalValue: { fontSize: 19, fontWeight: '800' },
  paidStatus: { minHeight: 34, borderWidth: 1, marginTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  paidStatusText: { fontSize: 11, fontWeight: '800' },
  paymentLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  paymentPill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, fontSize: 10, fontWeight: '700' },
  paymentDetail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  paymentDetailAmount: { fontSize: 10, fontWeight: '700' },
  changeLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 9, padding: 9, marginTop: 9 },
  changeLabel: { fontSize: 10, fontWeight: '800' },
  changeAmount: { fontSize: 15, fontWeight: '800' },
  savingText: { textAlign: 'center', fontSize: 11, marginTop: 12 },
  saveError: { alignItems: 'center', gap: 6, marginTop: 12 },
  saveErrorText: { color: '#B42318', fontSize: 12, textAlign: 'center' },
  retryText: { fontSize: 12, fontWeight: '800' },
  thanks: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 16 },
  printButton: { height: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 16 },
  printButtonText: { fontSize: 13, fontWeight: '800' },
  directPrintActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  directPrintButton: { flex: 1, height: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  directPrintText: { fontSize: 13, fontWeight: '800' },
  receiptActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryButton: { flex: 1, height: 47, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  primaryButton: { flex: 1.45, height: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  primaryButtonText: { fontSize: 13, fontWeight: '800' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(43,24,19,0.25)', justifyContent: 'flex-end' },
  paymentPickerScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  pickerCard: { borderTopLeftRadius: 23, borderTopRightRadius: 23, padding: 20, paddingBottom: 26 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pickerClose: { padding: 4 },
  pickerTitle: { fontSize: 18, fontWeight: '800' },
  pickerSubtitle: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  orderSummary: { borderWidth: 1, borderRadius: 14, marginBottom: 14, overflow: 'hidden' },
  orderSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 9 },
  orderQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderQtyBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  orderQtyText: { fontSize: 13, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  orderItemName: { flex: 1, fontSize: 12, fontWeight: '600' },
  orderItemAmount: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  orderSummaryTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: 11, paddingVertical: 10 },
  orderSummaryTotalLabel: { fontSize: 11, fontWeight: '700' },
  orderSummaryTotalAmount: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pickerChoice: { height: 51, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1 },
  pickerChoiceText: { flex: 1, fontSize: 14, fontWeight: '600' },
  paymentModes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  paymentMode: { width: '48%', minHeight: 45, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentModeText: { fontSize: 12, fontWeight: '700' },
  paymentFields: { gap: 5, marginTop: 9 },
  paymentFieldLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  paymentInput: { height: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontWeight: '700' },
  changePreview: { marginTop: 6, borderRadius: 10, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changePreviewLabel: { fontSize: 12, fontWeight: '700' },
  changePreviewAmount: { fontSize: 18, fontWeight: '800' },
  paymentBalance: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 9 },
  confirmPayment: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
});