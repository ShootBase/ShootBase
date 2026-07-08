import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Screen } from '@/components/ui/Screen';

export default function ProMessagesScreen() {
  return (
    <Screen title="Messages" subtitle="Conversations with clients">
      <PlaceholderContent
        title="Inbox"
        description="Professional messaging inbox will be built here."
      />
    </Screen>
  );
}
