import { Stack, useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { useAccount } from '../../../src/account/AccountProvider';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useAppData } from '../../../src/data/AppDataContext';
import { EventForm } from '../../../src/events/EventForm';
import { text } from '../../../src/navigation/theme';
import { useOrganizationTab } from '../../../src/orgs/OrganizationTab';
import { useOrganizations } from '../../../src/orgs/OrganizationsProvider';
import { screenStyles } from '../../../src/ui/controls';

export default function CreateEventScreen() {
  const router = useRouter();
  const { api } = useAccount();
  const { now, refresh, offline } = useAppData();
  const { state } = useAuth();
  const { organizations, organization } = useOrganizations();
  const { organizationId } = useOrganizationTab();
  const host = organization(organizationId);

  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: 'Create event' }} />
      {host && api && !offline && state.status === 'signedIn' && state.verified ? (
        <EventForm initial={null} host={host} organizations={organizations} now={now} submitLabel="Create event"
          onSubmit={async (fields) => {
            const event = await api.createEvent({ ...fields, organizationId: host.id });
            void refresh(); // Events and the map show it at once
            router.replace({ pathname: '/organization/event/[eventId]', params: { eventId: event.id } });
          }} />
      ) : <Text style={text.subhead}>Creating events needs the server.</Text>}
    </ScrollView>
  );
}
