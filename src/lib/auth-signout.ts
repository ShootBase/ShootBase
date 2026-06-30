import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearAllRoleStorage } from "@/lib/role-storage";

// Canonical sign-out teardown. Order matters:
//   1. cancel in-flight queries so they don't 401 after the session is cleared
//   2. clear the query cache so the back button can't restore protected data
//   3. wipe role hints from localStorage so the next user doesn't inherit them
//   4. clear the Supabase session
export async function performSignOut(queryClient?: QueryClient): Promise<void> {
  try {
    if (queryClient) {
      await queryClient.cancelQueries();
      queryClient.clear();
    }
  } catch {}
  clearAllRoleStorage();
  try {
    await supabase.auth.signOut();
  } catch {}
}
