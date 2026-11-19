import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { WeekChoices } from './choices';

export const weekChoices = new WeekChoices(AsyncStorage);
export function useWeekChoices() {
  const choices = useSyncExternalStore(weekChoices.subscribe, weekChoices.snapshot, weekChoices.snapshot);
  const [loadFailed, setLoadFailed] = useState(false);
  const retry = useCallback(() => {
    setLoadFailed(false);
    void weekChoices.load().catch(() => setLoadFailed(true));
  }, []);
  useEffect(retry, [retry]);
  return { choices, loadFailed, retry };
}
