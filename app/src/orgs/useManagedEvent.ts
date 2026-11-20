import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { Event } from '../../../shared/types';
import { useAccount } from '../account/AccountProvider';
import { useAuth } from '../auth/AuthProvider';
import { useAppData } from '../data/AppDataContext';

/** Read on each visit, including after an edit changes the room or directions. */
export function useManagedEvent(eventId: string) {
  const { api } = useAccount();
  const { state } = useAuth();
  const { offline } = useAppData();
  const [record, setRecord] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!api || offline) return;
    setError(null);
    void api.getEvent(eventId).then(
      (event) => { if (active) setRecord(event); },
      (problem: unknown) => { if (active) setError(problem instanceof Error ? problem.message : 'Could not load this event.'); },
    );
    return () => { active = false; };
  }, [api, eventId, offline]));
  const event = record?.id === eventId ? record : null;
  const owner = event && state.status === 'signedIn' && state.user.ownedOrganizationIds.includes(event.organizationId);
  const canManage = !!owner && state.status === 'signedIn' && state.verified && !offline;
  return { event: owner ? event : null, api, canManage, error, setEvent: setRecord };
}
