import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ClientNotificationsScreen() {
  return (
    <Screen title="Notifications" subtitle="Stay up to date">
      <PlaceholderContent
        title="Activity Feed"
        description="Push and in-app notifications will be listed here."
      />
    </Screen>
  );
}
