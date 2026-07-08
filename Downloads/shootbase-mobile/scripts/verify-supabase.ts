/**
 * Verifies ShootBase Supabase connectivity using project env vars.
 * Run: npx tsx scripts/verify-supabase.ts
 */
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function assertEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid EXPO_PUBLIC_SUPABASE_URL: ${supabaseUrl}`);
  }
}

async function main() {
  assertEnv();

  const supabase = createClient<Database>(supabaseUrl!, supabaseAnonKey!);

  const health = await supabase.auth.getSession();
  if (health.error) {
    throw new Error(`Auth service unreachable: ${health.error.message}`);
  }

  const { error: profileError } = await supabase.from('profiles').select('id').limit(1);

  if (profileError) {
    throw new Error(`Profiles query failed: ${profileError.message}`);
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: 'verify-connection@shootbase.invalid',
    password: 'invalid-password-for-verification',
  });

  if (!signInError || !signInError.message.toLowerCase().includes('invalid login credentials')) {
    throw new Error('Auth sign-in endpoint did not return the expected validation response.');
  }

  console.log('Supabase connection verified.');
  console.log(`URL: ${supabaseUrl}`);
  console.log('Auth service: reachable');
  console.log('Auth sign-in endpoint: reachable');
  console.log('Profiles table: reachable');
}

main().catch((error: unknown) => {
  console.error('Supabase verification failed:', error);
  process.exit(1);
});
