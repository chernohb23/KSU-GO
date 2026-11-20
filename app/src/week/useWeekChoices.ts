import { useAccount } from '../account/AccountProvider';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export function useWeekChoices() {
  const { weekChoices } = useAccount();
  const choices = useSyncExternalStore(weekChoices.subscribe, weekChoices.snapshot, weekChoices.snapshot);
  const [loadFailed, setLoadFailed] = useState(false);
  const retry = useCallback(() => {
    setLoadFailed(false);
    void weekChoices.load().catch(() => setLoadFailed(true));
  }, [weekChoices]);
  useEffect(retry, [retry]);
  return { choices, loadFailed, retry };
}
