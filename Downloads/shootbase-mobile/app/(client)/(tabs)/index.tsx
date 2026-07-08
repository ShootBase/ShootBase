import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ClientDashboardScreen() {
  return (
    <Screen title="Client Dashboard" subtitle="Your shoots and bookings at a glance">
      <PlaceholderContent
        title="Dashboard"
        description="Client dashboard widgets and quick actions will appear here."
      />
    </Screen>
  );
}
