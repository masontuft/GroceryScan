import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

type LocationPermissionTuple = [
  status: Location.PermissionStatus | null,
  request: () => Promise<boolean>,
];

export function useLocationPermission(): LocationPermissionTuple {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null);

  const request = useCallback(async () => {
    const { status: s } = await Location.requestForegroundPermissionsAsync();
    setStatus(s);
    return s === 'granted';
  }, []);

  return [status, request];
}
