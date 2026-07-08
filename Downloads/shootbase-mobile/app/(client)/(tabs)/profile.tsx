import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ClientProfileScreen() {
  return (
    <Screen title="Profile" subtitle="Your client profile">
      <PlaceholderContent
        title="Client Profile"
        description="Profile details, preferences, and account info will be managed here."
      />
    </Screen>
  );
}
