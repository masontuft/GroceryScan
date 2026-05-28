import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected);
    });
    return unsub;
  }, []);

  return { isConnected };
}
