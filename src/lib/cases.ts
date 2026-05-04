import { supabase } from './supabase';

export type CaseStatus = 'prospect' | 'onboarding' | 'active' | 'closed' | 'paused';

export interface Case {
  id: string;
  slug: string;
  name: string;
  sector: string;
  description: string;
  target_amount_sek: number | null;
  emission_open: string | null;
  emission_close: string | null;
  status: CaseStatus;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  marketing_plan: MarketingPlan | null;
  plan_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CasePhase {
  name: string;
  starts_days_before_close?: number;
  ends_days_before_close?: number;
  objective: string;
  content_items?: Array<{
    title: string;
    type: string;
    channel: string;
    description: string;
    kpi: string;
  }>;
}

export interface MarketingPlan {
  summary?: string;
  primary_persona?: string;
  key_message?: string;
  channels_priority?: string[];
  phases?: CasePhase[];
  risks?: string[];
  success_metrics?: string[];
  raw_text?: string;
  parse_error?: boolean;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  description: string | null;
  uploaded_at: string;
}

export const STATUS_LABEL: Record<CaseStatus, { label: string; cls: string }> = {
  prospect: { label: 'Prospect', cls: 'badge-gray' },
  onboarding: { label: 'Onboarding', cls: 'badge-yellow' },
  active: { label: 'Aktiv', cls: 'badge-green' },
  paused: { label: 'Pausad', cls: 'badge-orange' },
  closed: { label: 'Stängd', cls: 'badge-blue' },
};

export async function listCases(): Promise<Case[]> {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('emission_close', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as Case[]) ?? [];
}

export async function getCase(id: string): Promise<Case | null> {
  const { data, error } = await supabase.from('cases').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Case;
}

export async function createCase(input: {
  slug: string;
  name: string;
  sector?: string;
  description?: string;
  target_amount_sek?: number;
  emission_open?: string | null;
  emission_close?: string | null;
  status?: CaseStatus;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}): Promise<Case> {
  const { data, error } = await supabase.from('cases').insert(input).select().single();
  if (error) throw error;
  return data as Case;
}

export async function updateCase(id: string, patch: Partial<Case>): Promise<Case> {
  const { data, error } = await supabase.from('cases').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as Case;
}

export async function deleteCase(id: string) {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) throw error;
}

export async function listDocuments(caseId: string): Promise<CaseDocument[]> {
  const { data, error } = await supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data as CaseDocument[]) ?? [];
}

export async function uploadDocument(
  caseId: string,
  file: File,
  description?: string,
): Promise<CaseDocument> {
  const path = `${caseId}/${Date.now()}-${slugify(file.name)}`;
  const { error: upErr } = await supabase.storage.from('case-documents').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('case_documents')
    .insert({
      case_id: caseId,
      file_name: file.name,
      file_path: path,
      file_type: file.type,
      file_size: file.size,
      description: description ?? null,
      uploaded_by: userData.user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CaseDocument;
}

export async function getDocumentSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('case-documents')
    .createSignedUrl(filePath, 60 * 60); // 1 timme
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocument(doc: CaseDocument) {
  await supabase.storage.from('case-documents').remove([doc.file_path]);
  const { error } = await supabase.from('case_documents').delete().eq('id', doc.id);
  if (error) throw error;
}

export async function generateMarketingPlan(caseId: string): Promise<MarketingPlan | { error: string }> {
  try {
    const res = await fetch('/api/case-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ case_id: caseId }),
    });
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { error: 'Icke-JSON svar: ' + raw.slice(0, 100) };
    }
    if (!res.ok) {
      return { error: (body.error as string) ?? `HTTP ${res.status}` };
    }
    return body.plan as MarketingPlan;
  } catch (e) {
    return { error: 'fetch failed: ' + String(e) };
  }
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
