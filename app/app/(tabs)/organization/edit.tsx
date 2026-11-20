import { Stack, useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { useAccount } from '../../../src/account/AccountProvider';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useAppData } from '../../../src/data/AppDataContext';
import { text } from '../../../src/navigation/theme';
import { OrganizationForm } from '../../../src/orgs/OrganizationForm';
import { useOrganizationTab } from '../../../src/orgs/OrganizationTab';
import { useOrganizations } from '../../../src/orgs/OrganizationsProvider';
import { screenStyles } from '../../../src/ui/controls';

export default function EditOrganizationScreen() {
  const router = useRouter();
  const { api } = useAccount();
  const { state } = useAuth();
  const { offline } = useAppData();
  const { organization, upsert } = useOrganizations();
  const { organizationId } = useOrganizationTab();
  const org = organization(organizationId);

  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: 'Edit organization' }} />
      {org && api && !offline && state.status === 'signedIn' && state.verified ? (
        <OrganizationForm key={org.id} initial={org} submitLabel="Save changes" onSubmit={async (body) => {
          upsert(await api.updateOrganization(org.id, body));
          router.back();
        }} />
      ) : <Text style={text.subhead}>Editing needs the server.</Text>}
    </ScrollView>
  );
}
