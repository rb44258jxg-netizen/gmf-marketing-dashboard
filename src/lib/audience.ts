import { supabase } from './supabase';

export type AudienceKind = 'investor' | 'project_owner';
export type MemberStatus = 'aktiv' | 'pausad' | 'konverterad' | 'borttagen';
export type FunnelStepType = 'email' | 'linkedin_dm' | 'team_review' | 'tag_event' | 'wait';
export type AudienceEventType =
  | 'joined'
  | 'step_started'
  | 'step_completed'
  | 'step_skipped'
  | 'opened'
  | 'clicked'
  | 'converted'
  | 'manual_note'
  | 'mailerlite_synced';

export interface Funnel {
  id: string;
  kind: AudienceKind;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface FunnelStep {
  id: string;
  funnel_id: string;
  step_index: number;
  delay_days: number;
  type: FunnelStepType;
  title: string;
  description: string | null;
  channel: string | null;
  template_id: string | null;
  body: string | null;
}

export interface AudienceMember {
  id: string;
  kind: AudienceKind;
  external_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  registered_at: string | null;
  joined_funnel_at: string;
  funnel_id: string | null;
  current_step: number;
  status: MemberStatus;
  segment_tags: string[];
  source: string | null;
  notes: string | null;
  converted_at: string | null;
  conversion_value: number | null;
  mailerlite_subscriber_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudienceEvent {
  id: string;
  audience_member_id: string;
  funnel_step_id: string | null;
  event_type: AudienceEventType;
  occurred_at: string;
  data: Record<string, unknown> | null;
}

export const KIND_LABEL: Record<AudienceKind, string> = {
  investor: 'Investerare',
  project_owner: 'Projektägare',
};

export const STATUS_LABEL: Record<MemberStatus, string> = {
  aktiv: 'Aktiv i tunnel',
  pausad: 'Pausad',
  konverterad: 'Konverterad ✓',
  borttagen: 'Borttagen',
};

export const STATUS_BADGE: Record<MemberStatus, string> = {
  aktiv: 'badge-blue',
  pausad: 'badge-gray',
  konverterad: 'badge-green',
  borttagen: 'badge-red',
};

export const STEP_TYPE_LABEL: Record<FunnelStepType, string> = {
  email: 'E-post',
  linkedin_dm: 'LinkedIn-DM',
  team_review: 'Team-review',
  tag_event: 'Event/tagg',
  wait: 'Väntan',
};

export const STEP_TYPE_ICON: Record<FunnelStepType, string> = {
  email: '✉️',
  linkedin_dm: '💼',
  team_review: '👀',
  tag_event: '🏷️',
  wait: '⏳',
};

// ----------------------------------------------------------------------------
// Funnels
// ----------------------------------------------------------------------------

export async function listFunnels(kind?: AudienceKind): Promise<Funnel[]> {
  let q = supabase.from('funnels').select('*').eq('active', true).order('created_at', { ascending: true });
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Funnel[]) ?? [];
}

export async function listFunnelSteps(funnelId: string): Promise<FunnelStep[]> {
  const { data, error } = await supabase
    .from('funnel_steps')
    .select('*')
    .eq('funnel_id', funnelId)
    .order('step_index', { ascending: true });
  if (error) throw error;
  return (data as FunnelStep[]) ?? [];
}

// ----------------------------------------------------------------------------
// Audience members
// ----------------------------------------------------------------------------

export async function listAudienceMembers(kind?: AudienceKind): Promise<AudienceMember[]> {
  let q = supabase.from('audience_members').select('*').neq('status', 'borttagen').order('joined_funnel_at', { ascending: false });
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data as AudienceMember[]) ?? [];
}

export async function getAudienceMember(id: string): Promise<AudienceMember | null> {
  const { data, error } = await supabase.from('audience_members').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as AudienceMember | null;
}

export async function createAudienceMember(input: {
  kind: AudienceKind;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  registered_at?: string | null;
  external_id?: string | null;
  funnel_id?: string | null;
  segment_tags?: string[];
  source?: string | null;
  notes?: string | null;
}): Promise<AudienceMember> {
  const { data, error } = await supabase
    .from('audience_members')
    .insert({
      kind: input.kind,
      email: input.email.trim().toLowerCase(),
      full_name: input.full_name ?? null,
      phone: input.phone ?? null,
      registered_at: input.registered_at ?? null,
      external_id: input.external_id ?? null,
      funnel_id: input.funnel_id ?? null,
      segment_tags: input.segment_tags ?? [],
      source: input.source ?? 'manuell',
      notes: input.notes ?? null,
      current_step: 0,
      status: 'aktiv',
    })
    .select()
    .single();
  if (error) throw error;
  return data as AudienceMember;
}

export async function findExistingEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const lower = emails.map((e) => e.toLowerCase());
  const { data, error } = await supabase
    .from('audience_members')
    .select('email')
    .in('email', lower);
  if (error) throw error;
  const set = new Set<string>();
  ((data as Array<{ email: string | null }>) ?? []).forEach((r) => {
    if (r.email) set.add(r.email.toLowerCase());
  });
  return set;
}

export async function updateAudienceMember(id: string, patch: Partial<AudienceMember>): Promise<AudienceMember> {
  const { data, error } = await supabase
    .from('audience_members')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as AudienceMember;
}

// ----------------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------------

export async function listAudienceEvents(memberId: string): Promise<AudienceEvent[]> {
  const { data, error } = await supabase
    .from('audience_events')
    .select('*')
    .eq('audience_member_id', memberId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as AudienceEvent[]) ?? [];
}

export async function logAudienceEvent(input: {
  audience_member_id: string;
  funnel_step_id?: string | null;
  event_type: AudienceEventType;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase.from('audience_events').insert({
    audience_member_id: input.audience_member_id,
    funnel_step_id: input.funnel_step_id ?? null,
    event_type: input.event_type,
    data: input.data ?? null,
  });
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// MailerLite-subscribe (best-effort)
// ----------------------------------------------------------------------------

export async function subscribeToMailerLite(input: {
  email: string;
  full_name?: string | null;
  funnel_kind: AudienceKind;
  funnel_name: string;
}): Promise<{ ok: true; subscriber_id?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/audience-subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const raw = await res.text();
    let body: { subscriber_id?: string; error?: string } = {};
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, error: `Icke-JSON svar (HTTP ${res.status}): ${raw.slice(0, 100)}` };
    }
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    return { ok: true, subscriber_id: body.subscriber_id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ----------------------------------------------------------------------------
// Aggregated stats för översikten
// ----------------------------------------------------------------------------

export interface FunnelStats {
  funnel: Funnel;
  total_members: number;
  by_step: Array<{ step: number; count: number }>;
  converted: number;
  paused: number;
}

export async function getFunnelStats(funnelId: string): Promise<FunnelStats | null> {
  const [{ data: funnel }, { data: members }] = await Promise.all([
    supabase.from('funnels').select('*').eq('id', funnelId).maybeSingle(),
    supabase.from('audience_members').select('current_step, status').eq('funnel_id', funnelId).neq('status', 'borttagen'),
  ]);
  if (!funnel) return null;
  const list = (members as Array<{ current_step: number; status: MemberStatus }>) ?? [];
  const byStep = new Map<number, number>();
  let converted = 0;
  let paused = 0;
  list.forEach((m) => {
    if (m.status === 'konverterad') converted++;
    else if (m.status === 'pausad') paused++;
    byStep.set(m.current_step, (byStep.get(m.current_step) ?? 0) + 1);
  });
  return {
    funnel: funnel as Funnel,
    total_members: list.length,
    by_step: Array.from(byStep.entries())
      .sort(([a], [b]) => a - b)
      .map(([step, count]) => ({ step, count })),
    converted,
    paused,
  };
}
