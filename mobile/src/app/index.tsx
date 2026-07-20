import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import Constants from 'expo-constants';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PostHogProvider } from 'posthog-react-native';
import type { ScanResult } from '../services/api';
import { posthog } from '../services/analytics';

import { ScanScreen } from '../screens/ScanScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { BasketScreen } from '../screens/BasketScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { StoreSelectScreen } from '../screens/StoreSelectScreen';
import { RemindersListSelectScreen } from '../screens/RemindersListSelectScreen';
import { LocationScreen } from '../screens/LocationScreen';
import { ManualPriceScreen } from '../screens/ManualPriceScreen';
import { QuickEntryScreen } from '../screens/QuickEntryScreen';
import { ReceiptScanScreen } from '../screens/ReceiptScanScreen';
import { DevScreen } from '../screens/DevScreen';
import { AppAlertProvider } from '../components/AppAlert';

import { useBasketStore } from '../stores/basketStore';
import { useProductStore } from '../stores/productStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';

export type ScanStackParamList = {
  Scan: undefined;
  ProductDetail: { scanResult: ScanResult; barcode: string };
};

export type SearchStackParamList = {
  Search: undefined;
  ProductDetail: { scanResult: ScanResult; barcode: string };
};

export type RootStackParamList = {
  MainTabs: undefined;
  StoreSelect: undefined;
  RemindersListSelect: undefined;
  Location: undefined;
  Dev: undefined;
  ReceiptScan: undefined;
  ManualPrice: {
    productId: string;          // barcode string (unknown product) OR real product UUID (known, no price)
    productName: string;
    imageUrl: string | null;
    productNameEditable?: boolean;   // true → came from "Not Found"; show editable name field
    productIdIsBarcode?: boolean;    // true → productId is a raw barcode, must upsert product in DB
    rawBarcode?: string;             // the actual camera-scanned code, when productId is an OCR-reconstructed UPC that may differ from it
    initialPrice?: number;           // pre-fill from OCR
    initialBrand?: string;           // pre-fill from product lookup
    initialSize?: string;
    initialUnit?: string;
    initialCategories?: string[];    // pre-fill from product lookup / Open Food Facts
    initialByWeight?: boolean;       // carry over the "priced by weight" toggle from ProductDetail
    initialWeightUnit?: 'lb' | 'kg';
  };
};

const ScanStack = createNativeStackNavigator<ScanStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const Tab = createBottomTabNavigator();
const Root = createNativeStackNavigator<RootStackParamList>();

function ScanNavigator() {
  return (
    <ScanStack.Navigator>
      <ScanStack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
      <ScanStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product' }} />
    </ScanStack.Navigator>
  );
}

function SearchNavigator() {
  return (
    <SearchStack.Navigator>
      <SearchStack.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      <SearchStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product' }} />
    </SearchStack.Navigator>
  );
}

function MainTabs({ navigation }: { navigation: any }) {
  const state = useLocationStore((s) => s.state);

  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleVersionTap = () => {
    tapCount.current += 1;
    clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      navigation.navigate('Dev');
    } else {
      tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
    }
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen
        name="ScanTab"
        component={ScanNavigator}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: () => <Text>📷</Text>,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="QuickEntryTab"
        component={QuickEntryScreen}
        options={{
          tabBarLabel: 'Quick Add',
          tabBarIcon: () => <Text>⚡</Text>,
          title: 'Quick Add',
        }}
      />
      <Tab.Screen
        name="BasketTab"
        component={BasketScreen}
        options={{
          tabBarLabel: 'Basket',
          tabBarIcon: () => <Text>🛒</Text>,
          title: 'Basket',
          headerLeft: () => (
            <TouchableOpacity onPress={handleVersionTap} style={{ marginLeft: 16 }}>
              <Text style={{ color: '#cbd5e1', fontSize: 11 }}>v{appVersion}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchNavigator}
        options={{
          tabBarLabel: 'Search',
          tabBarIcon: () => <Text>🔍</Text>,
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  useEffect(() => {
    useBasketStore.persist.rehydrate();
    useProductStore.persist.rehydrate();
    useStoreStore.persist.rehydrate();
    useLocationStore.persist.rehydrate();
  }, []);

  return (
    <NavigationContainer>
      <PostHogProvider client={posthog ?? undefined} autocapture={{ captureTouches: false }}>
        <Root.Navigator screenOptions={{ headerShown: false }}>
          <Root.Screen name="MainTabs" component={MainTabs} />
          <Root.Screen
            name="StoreSelect"
            component={StoreSelectScreen}
            options={{ headerShown: true, presentation: 'modal', title: 'Select Store' }}
          />
          <Root.Screen
            name="RemindersListSelect"
            component={RemindersListSelectScreen}
            options={{ headerShown: true, presentation: 'modal', title: 'Reminders List' }}
          />
          <Root.Screen
            name="Location"
            component={LocationScreen}
            options={{ headerShown: true, presentation: 'modal', title: 'My Location' }}
          />
          <Root.Screen
            name="ManualPrice"
            component={ManualPriceScreen}
            options={{ headerShown: true, presentation: 'modal', title: 'Enter Price' }}
          />
          <Root.Screen
            name="Dev"
            component={DevScreen}
            options={{ headerShown: true, title: 'Developer Settings' }}
          />
          <Root.Screen
            name="ReceiptScan"
            component={ReceiptScanScreen}
            options={{ headerShown: true, presentation: 'modal', title: 'Scan Receipt' }}
          />
        </Root.Navigator>
      </PostHogProvider>
      <AppAlertProvider />
    </NavigationContainer>
  );
}
