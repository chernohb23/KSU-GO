import { ScreenScrollView as ScrollView } from '../ui/ScreenScrollView';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {  } from 'react-native';

import { useAppData } from '../data/AppDataContext';
import { EventForm } from '../events/EventForm';
import { Notice, screenStyles } from '../ui/controls';
import { useOrganizations } from './OrganizationsProvider';
import { useManagedEvent } from './useManagedEvent';

export default function EditEvent() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { event, api, canManage, error } = useManagedEvent(eventId);
  const { now, refresh } = useAppData();
  const { organizations, organization } = useOrganizations();
  const host = organization(event?.organizationId);
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: 'Edit event' }} />
      <Notice message={error} />
      {event && host && api && canManage && event.status === 'active' && Date.parse(event.endsAt) > now.getTime() ? (
        <EventForm key={event.id} initial={event} host={host} organizations={organizations} now={now} submitLabel="Save changes"
          onSubmit={async (fields) => {
            await api.editEvent(eventId, fields);
            await refresh();
            router.back();
          }} />
      ) : <Notice kind="info" message="This event is unavailable for editing." />}
    </ScrollView>
  );
}
