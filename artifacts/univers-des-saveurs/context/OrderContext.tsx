import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Category = string;

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  note: string;
  color: string;
  stockQuantity: number;
  imageUrl: string | null;
};

export type CartLine = Product & { quantity: number };

type OrderContextValue = {
  cart: CartLine[];
  table: string;
  setTable: (table: string) => void;
  addToCart: (product: Product, allowBeyondStock?: boolean) => void;
  decrease: (productId: string) => void;
  removeLine: (productId: string) => void;
  clearCart: () => void;
  syncProducts: (products: Product[], allowBeyondStock?: boolean) => void;
  subtotal: number;
  itemCount: number;
  isLoaded: boolean;
};

const OrderContext = createContext<OrderContextValue | null>(null);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [table, setTable] = useState('Table 04');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['univers-cart', 'univers-table'])
      .then((entries) => {
        const savedCart = entries[0][1];
        const savedTable = entries[1][1];
        if (savedCart) setCart(JSON.parse(savedCart) as CartLine[]);
        if (savedTable) setTable(savedTable);
      })
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    void AsyncStorage.setItem('univers-cart', JSON.stringify(cart));
    void AsyncStorage.setItem('univers-table', table);
  }, [cart, table, isLoaded]);

  const value = useMemo<OrderContextValue>(() => {
    const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
    return {
      cart,
      table,
      setTable,
      addToCart: (product, allowBeyondStock = false) =>
        setCart((current) => {
          const found = current.find((line) => line.id === product.id);
          if (found) {
            if (!allowBeyondStock && found.quantity >= product.stockQuantity) return current;
            return current.map((line) => line.id === product.id ? { ...line, ...product, quantity: line.quantity + 1 } : line);
          }
          return [...current, { ...product, quantity: 1 }];
        }),
      decrease: (productId) =>
        setCart((current) =>
          current
            .map((line) => line.id === productId ? { ...line, quantity: line.quantity - 1 } : line)
            .filter((line) => line.quantity > 0),
        ),
      removeLine: (productId) => setCart((current) => current.filter((line) => line.id !== productId)),
      clearCart: () => setCart([]),
      syncProducts: (products, allowBeyondStock = false) => setCart((current) => current
        .map((line) => {
          const product = products.find((item) => item.id === line.id);
          if (!product || (!allowBeyondStock && product.stockQuantity <= 0)) return null;
          return { ...product, quantity: allowBeyondStock ? line.quantity : Math.min(line.quantity, product.stockQuantity) };
        })
        .filter((line): line is CartLine => line !== null && line.quantity > 0)),
      subtotal,
      itemCount,
      isLoaded,
    };
  }, [cart, isLoaded, table]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) throw new Error('useOrder must be used inside OrderProvider');
  return context;
}

export function formatCFA(amount: number) {
  return `${amount.toLocaleString('fr-FR')} F`;
}