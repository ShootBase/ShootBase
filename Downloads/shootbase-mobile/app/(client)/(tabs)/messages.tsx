import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ClientMessagesScreen() {
  return (
    <Screen title="Messages" subtitle="Conversations with professionals">
      <PlaceholderContent
        title="Inbox"
        description="Real-time messaging between clients and professionals will be built here."
      />
    </Screen>
  );
}
