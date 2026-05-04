import { supabase } from './supabase';

interface LogArgs {
  action: string;
  entity_type: string;
  entity_id: string | null;
  before?: unknown;
  after?: unknown;
}

export async function logAudit({ action, entity_type, entity_id, before, after }: LogArgs) {
  const { data: userData } = await supabase.auth.getUser();
  const actor = userData.user;
  const { error } = await supabase.from('audit_log').insert({
    actor_id: actor?.id ?? null,
    actor_email: actor?.email ?? null,
    action,
    entity_type,
    entity_id,
    before: (before as Record<string, unknown>) ?? null,
    after: (after as Record<string, unknown>) ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write log', error);
  }
}
