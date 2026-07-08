import { PlaceholderContent } from '@/components/PlaceholderContent';
import { SignOutSection } from '@/components/SignOutSection';
import { Screen } from '@/components/ui/Screen';

export default function ClientSettingsScreen() {
  return (
    <Screen title="Settings" subtitle="App preferences">
      <PlaceholderContent
        title="Client Settings"
        description="Notification preferences, privacy, and app settings will live here."
      />
      <SignOutSection />
    </Screen>
  );
}
