import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ScanResult } from '../services/api';

import { ScanScreen } from '../screens/ScanScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { BasketScreen } from '../screens/BasketScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { StoreSelectScreen } from '../screens/StoreSelectScreen';
import { LocationScreen } from '../screens/LocationScreen';

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
  Location: undefined;
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
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const stores = useStoreStore((s) => s.stores);
  const state = useLocationStore((s) => s.state);

  const storeName = stores.find((s) => s.id === selectedStoreId)?.name ?? 'No Store';

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
        name="BasketTab"
        component={BasketScreen}
        options={{
          tabBarLabel: 'Basket',
          tabBarIcon: () => <Text>🛒</Text>,
          title: 'Basket',
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('StoreSelect')} style={{ marginRight: 16 }}>
              <Text style={{ color: '#2563eb', fontWeight: '600' }}>{storeName}</Text>
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
  return (
    <NavigationContainer>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        <Root.Screen name="MainTabs" component={MainTabs} />
        <Root.Screen
          name="StoreSelect"
          component={StoreSelectScreen}
          options={{ headerShown: true, presentation: 'modal', title: 'Select Store' }}
        />
        <Root.Screen
          name="Location"
          component={LocationScreen}
          options={{ headerShown: true, presentation: 'modal', title: 'My Location' }}
        />
      </Root.Navigator>
    </NavigationContainer>
  );
}
