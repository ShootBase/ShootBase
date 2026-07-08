import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ProDashboardScreen() {
  return (
    <Screen title="Professional Dashboard" subtitle="Manage your shoots and clients">
      <PlaceholderContent
        title="Pro Dashboard"
        description="Bookings, availability, and earnings overview will appear here."
      />
    </Screen>
  );
}
