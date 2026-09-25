import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useLocalAuth';
import { Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createSale, getGetAdminSalesQueryKey, getGetCategoriesQueryKey, getGetDiningLocationsQueryKey, getGetProductsQueryKey } from '@workspace/api-client-react';
import type { Category, DiningLocation, Product, SaleInput } from '@workspace/api-client-react';

type CatalogSnapshot = { products: Product[]; categories: Category[]; diningLocations?: DiningLocation[]; salesEpoch?: number; testEpoch?: number; syncedAt: string };
export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'action-needed';
export type SaleOutboxItem = {
  id: string;
  clientRequestId: string;
  payload: SaleInput;
  createdAt: string;
  status: OutboxStatus;
  retryCount: number;
  error: string | null;
};

type OfflineContextValue = {
  isOnline: boolean;
  catalog: CatalogSnapshot | null;
  outbox: SaleOutboxItem[];
  pendingCount: number;
  failedCount: number;
  saveCatalog: (products: Product[], categories: Category[], diningLocations?: DiningLocation[], salesEpoch?: number, testEpoch?: number) => Promise<void>;
  enqueueSale: (payload: SaleInput) => Promise<SaleOutboxItem>;
  optimisticReduceStock: (items: SaleInput['items']) => Promise<void>;
  syncNow: () => Promise<void>;
  syncing: boolean;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);
const CATALOG_KEY = 'univers-offline-catalog-v3';
const OUTBOX_KEY = 'univers-offline-sales-v3';

type SQLiteDb = {
  execSync: (sql: string) => void;
  runSync: (sql: string, ...params: unknown[]) => void;
  getAllSync: <T>(sql: string, ...params: unknown[]) => T[];
};
let nativeDb: SQLiteDb | null | undefined;

function getNativeDb(): SQLiteDb | null {
  if (Platform.OS === 'web') return null;
  if (nativeDb !== undefined) return nativeDb;
  // expo-sqlite is deliberately loaded only on native; web uses AsyncStorage.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as { openDatabaseSync: (name: string) => SQLiteDb };
  nativeDb = SQLite.openDatabaseSync('univers-offline.db');
  nativeDb.execSync(`
    CREATE TABLE IF NOT EXISTS catalog_v3 (
      id INTEGER PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales_outbox_v3 (
      id TEXT PRIMARY KEY NOT NULL,
      client_request_id TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
  `);
  return nativeDb;
}

async function readCatalog(): Promise<CatalogSnapshot | null> {
  const db = getNativeDb();
  if (db) {
    const rows = db.getAllSync<{ payload: string; synced_at: string }>('SELECT payload, synced_at FROM catalog_v3 WHERE id = 1');
    const row = rows[0];
    if (!row) return null;
    return { ...(JSON.parse(row.payload) as Omit<CatalogSnapshot, 'syncedAt'>), syncedAt: row.synced_at };
  }
  const value = await AsyncStorage.getItem(CATALOG_KEY);
  return value ? JSON.parse(value) as CatalogSnapshot : null;
}

async function writeCatalog(catalog: CatalogSnapshot) {
  const db = getNativeDb();
  if (db) {
    db.runSync('INSERT OR REPLACE INTO catalog_v3 (id, payload, synced_at) VALUES (1, ?, ?)', JSON.stringify({ products: catalog.products, categories: catalog.categories, diningLocations: catalog.diningLocations, salesEpoch: catalog.salesEpoch, testEpoch: catalog.testEpoch }), catalog.syncedAt);
    return;
  }
  await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
}

async function readOutbox(): Promise<SaleOutboxItem[]> {
  const db = getNativeDb();
  if (db) {
    return db.getAllSync<{ id: string; client_request_id: string; payload: string; created_at: string; status: OutboxStatus; retry_count: number; error: string | null }>('SELECT id, client_request_id, payload, created_at, status, retry_count, error FROM sales_outbox_v3 ORDER BY created_at ASC').map((row) => ({
      id: row.id,
      clientRequestId: row.client_request_id,
      payload: JSON.parse(row.payload) as SaleInput,
      createdAt: row.created_at,
      status: row.status,
      retryCount: row.retry_count,
      error: row.error,
    }));
  }
  const value = await AsyncStorage.getItem(OUTBOX_KEY);
  return value ? JSON.parse(value) as SaleOutboxItem[] : [];
}

async function writeOutbox(items: SaleOutboxItem[]) {
  const db = getNativeDb();
  if (db) {
    db.execSync('DELETE FROM sales_outbox_v3');
    for (const item of items) {
      db.runSync('INSERT OR REPLACE INTO sales_outbox_v3 (id, client_request_id, payload, created_at, status, retry_count, error) VALUES (?, ?, ?, ?, ?, ?, ?)', item.id, item.clientRequestId, JSON.stringify(item.payload), item.createdAt, item.status, item.retryCount, item.error);
    }
    return;
  }
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

function networkError(error: unknown) {
  return !error || typeof error !== 'object' || !('status' in error) || !Number((error as { status?: number }).status);
}

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [outbox, setOutbox] = useState<SaleOutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  const reloadOutbox = useCallback(async () => {
    const items = await readOutbox();
    setOutbox(items);
  }, []);

  useEffect(() => {
    let mounted = true;
    void Promise.all([readCatalog(), readOutbox()]).then(([savedCatalog, savedOutbox]) => {
      if (!mounted) return;
      setCatalog(savedCatalog);
      setOutbox(savedOutbox);
    });
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false)));
    void NetInfo.fetch().then((state) => {
      if (mounted) setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const saveCatalog = useCallback(async (products: Product[], categories: Category[], diningLocations?: DiningLocation[], salesEpoch?: number, testEpoch?: number) => {
    const saved = diningLocations === undefined ? await readCatalog() : null;
    const next = { products, categories, diningLocations: diningLocations ?? saved?.diningLocations, salesEpoch: salesEpoch ?? saved?.salesEpoch ?? 0, testEpoch: testEpoch ?? saved?.testEpoch ?? 0, syncedAt: new Date().toISOString() };
    await writeCatalog(next);
    setCatalog(next);
  }, []);

  const enqueueSale = useCallback(async (payload: SaleInput) => {
    const existing = (await readOutbox()).find((item) => item.clientRequestId === payload.clientRequestId);
    if (existing) {
      setOutbox((current) => current.some((item) => item.id === existing.id) ? current : [...current, existing]);
      return existing;
    }
    const item: SaleOutboxItem = {
      id: `sale-${payload.clientRequestId}`,
      clientRequestId: payload.clientRequestId ?? `sale-${Date.now()}`,
      payload,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      error: null,
    };
    const next = [...(await readOutbox()), item];
    await writeOutbox(next);
    setOutbox(next);
    return item;
  }, []);

  const optimisticReduceStock = useCallback(async (items: SaleInput['items']) => {
    setCatalog((current) => {
      if (!current) return current;
      const products = current.products.map((product) => {
        const sold = items.find((item) => item.productId === product.id)?.quantity ?? 0;
        return sold ? { ...product, stockQuantity: Math.max(0, product.stockQuantity - sold) } : product;
      });
      const next = { ...current, products };
      void writeCatalog(next);
      return next;
    });
  }, []);

  const syncNow = useCallback(async () => {
    if (!isOnline || !authLoaded || !isSignedIn || syncing) return;
    setSyncing(true);
    try {
      let items = await readOutbox();
      for (const item of items) {
        if (item.status === 'action-needed') continue;
        if (item.retryCount > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 500 * 2 ** Math.min(item.retryCount, 6))));
        const syncingItem = { ...item, status: 'syncing' as const };
        items = items.map((candidate) => candidate.id === item.id ? syncingItem : candidate);
        await writeOutbox(items);
        setOutbox([...items]);
        try {
          const token = Platform.OS !== 'web' ? await getToken() : null;
          await createSale(item.payload, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
          items = items.filter((candidate) => candidate.id !== item.id);
          await writeOutbox(items);
          setOutbox([...items]);
          await queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          await queryClient.invalidateQueries({ queryKey: getGetAdminSalesQueryKey() });
        } catch (error) {
          const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
          const message = error instanceof Error ? error.message : 'La synchronisation a échoué.';
          const failed = { ...item, status: status === 400 ? 'action-needed' as const : 'pending' as const, retryCount: item.retryCount + 1, error: message };
          items = items.map((candidate) => candidate.id === item.id ? failed : candidate);
          await writeOutbox(items);
          setOutbox([...items]);
          if (!networkError(error) && status !== 400) break;
          if (status === 400) continue;
          break;
        }
      }
      await queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetDiningLocationsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetAdminSalesQueryKey() });
    } finally {
      setSyncing(false);
    }
  }, [authLoaded, getToken, isOnline, isSignedIn, queryClient, syncing]);

  useEffect(() => {
    if (isOnline && isSignedIn && outbox.some((item) => item.status === 'pending' || item.status === 'failed')) void syncNow();
  }, [isOnline, isSignedIn, outbox, syncNow]);

  const value = useMemo<OfflineContextValue>(() => ({
    isOnline,
    catalog,
    outbox,
    pendingCount: outbox.filter((item) => item.status === 'pending' || item.status === 'syncing').length,
    failedCount: outbox.filter((item) => item.status === 'failed' || item.status === 'action-needed').length,
    saveCatalog,
    enqueueSale,
    optimisticReduceStock,
    syncNow,
    syncing,
  }), [catalog, enqueueSale, isOnline, optimisticReduceStock, outbox, saveCatalog, syncNow, syncing]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOfflineSync() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOfflineSync must be used inside OfflineSyncProvider');
  return context;
}