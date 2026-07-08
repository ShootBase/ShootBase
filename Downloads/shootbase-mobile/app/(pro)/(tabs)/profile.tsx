import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ProProfileScreen() {
  return (
    <Screen title="Profile" subtitle="Your professional profile">
      <PlaceholderContent
        title="Professional Profile"
        description="Portfolio, services, and credentials will be managed here."
      />
    </Screen>
  );
}
