import { supabase } from './supabase';

export type ActivityType = 'social_post' | 'email_campaign' | 'ad' | 'event' | 'pr' | 'other';
export type ActivityStatus = 'planerad' | 'redo' | 'publicerad' | 'inställd';

export interface MarketingActivity {
  id: string;
  type: ActivityType;
  channel: string | null;
  title: string;
  description: string | null;
  body: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  status: ActivityStatus;
  campaign: string | null;
  case_id: string | null;
  owner: string | null;
  external_url: string | null;
  metrics: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  social_post: 'Social post',
  email_campaign: 'E-postkampanj',
  ad: 'Annons',
  event: 'Event',
  pr: 'PR / Press',
  other: 'Övrigt',
};

export const ACTIVITY_TYPE_ICON: Record<ActivityType, string> = {
  social_post: '📣',
  email_campaign: '✉️',
  ad: '📢',
  event: '📅',
  pr: '📰',
  other: '🔖',
};

export const ACTIVITY_TYPE_COLOR: Record<ActivityType, string> = {
  social_post: '#269dd9',
  email_campaign: '#15a37e',
  ad: '#f5b83d',
  event: '#a270db',
  pr: '#e36868',
  other: '#73848c',
};

export const CHANNELS: Array<{ value: string; label: string; icon: string; composerUrl?: string }> = [
  { value: 'linkedin', label: 'LinkedIn', icon: '💼', composerUrl: 'https://www.linkedin.com/post/new/' },
  { value: 'meta_fb', label: 'Facebook', icon: '📘', composerUrl: 'https://www.facebook.com/' },
  { value: 'meta_ig', label: 'Instagram', icon: '📸', composerUrl: 'https://www.instagram.com/' },
  { value: 'twitter', label: 'X (Twitter)', icon: '𝕏', composerUrl: 'https://twitter.com/compose/post' },
  { value: 'mailerlite', label: 'MailerLite', icon: '📨', composerUrl: 'https://dashboard.mailerlite.com/campaigns' },
  { value: 'blog', label: 'Blogg', icon: '📝', composerUrl: 'https://finance.greenmerc.com/admin' },
  { value: 'press', label: 'Press', icon: '📰' },
  { value: 'event', label: 'Event', icon: '📅' },
  { value: 'other', label: 'Övrig', icon: '🔗' },
];

export function findChannel(value: string | null) {
  return CHANNELS.find((c) => c.value === value);
}

export async function listActivities(): Promise<MarketingActivity[]> {
  const { data, error } = await supabase
    .from('marketing_activities')
    .select('*')
    .order('scheduled_for', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as MarketingActivity[]) ?? [];
}

export async function listActivitiesInRange(fromIso: string, toIso: string): Promise<MarketingActivity[]> {
  const { data, error } = await supabase
    .from('marketing_activities')
    .select('*')
    .gte('scheduled_for', fromIso)
    .lte('scheduled_for', toIso);
  if (error) throw error;
  return (data as MarketingActivity[]) ?? [];
}

export async function createActivity(
  input: Omit<MarketingActivity, 'id' | 'created_at' | 'updated_at' | 'published_at' | 'metrics'>,
): Promise<MarketingActivity> {
  const { data, error } = await supabase.from('marketing_activities').insert(input).select().single();
  if (error) throw error;
  return data as MarketingActivity;
}

export async function updateActivity(id: string, patch: Partial<MarketingActivity>): Promise<MarketingActivity> {
  const { data, error } = await supabase
    .from('marketing_activities')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as MarketingActivity;
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_activities').delete().eq('id', id);
  if (error) throw error;
}
