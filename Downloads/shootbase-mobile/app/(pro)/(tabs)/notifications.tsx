import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ProNotificationsScreen() {
  return (
    <Screen title="Notifications" subtitle="Stay up to date">
      <PlaceholderContent
        title="Activity Feed"
        description="Booking alerts and job notifications will be listed here."
      />
    </Screen>
  );
}
