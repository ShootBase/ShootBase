import { PlaceholderContent } from '@/components/PlaceholderContent';
import { SignOutSection } from '@/components/SignOutSection';
import { Screen } from '@/components/ui/Screen';

export default function ProSettingsScreen() {
  return (
    <Screen title="Settings" subtitle="App preferences">
      <PlaceholderContent
        title="Professional Settings"
        description="Business settings, payouts, and notification preferences will live here."
      />
      <SignOutSection />
    </Screen>
  );
}
