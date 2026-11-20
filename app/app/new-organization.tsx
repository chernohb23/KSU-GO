import { Stack, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { useAccount } from '../src/account/AccountProvider';
import { useAuth } from '../src/auth/AuthProvider';
import { useAppData } from '../src/data/AppDataContext';
import { OrganizationForm } from '../src/orgs/OrganizationForm';
import { useOrganizations } from '../src/orgs/OrganizationsProvider';
import { SELECTED_ORGANIZATION_KEY } from '../src/orgs/OrganizationTab';
import { Notice, screenStyles } from '../src/ui/controls';

export default function CreateOrganization() {
  const { api, storage } = useAccount();
  const { state, controller } = useAuth();
  const { offline } = useAppData();
  const { upsert } = useOrganizations();
  const router = useRouter();
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: 'Create organization' }} />
      {api && state.status === 'signedIn' && state.verified && !offline ? <OrganizationForm initial={null} submitLabel="Create organization"
        onSubmit={async (body) => {
          const organization = await api.createOrganization(body);
          upsert(organization);
          await storage.setItem(SELECTED_ORGANIZATION_KEY, organization.id).catch(() => {});
          await controller.setUser(await api.me());
          router.replace('/organization');
        }} /> : <Notice kind="info" message="Sign in and connect to create an organization." />}
    </ScrollView>
  );
}
