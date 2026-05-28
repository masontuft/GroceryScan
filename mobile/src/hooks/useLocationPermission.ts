import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

export function useLocationPermission() {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null);

  const request = useCallback(async () => {
    const { status: s } = await Location.requestForegroundPermissionsAsync();
    setStatus(s);
    return s === 'granted';
  }, []);

  return { status, request };
}
