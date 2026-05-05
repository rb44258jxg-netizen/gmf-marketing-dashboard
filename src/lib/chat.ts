import { supabase } from './supabase';
import { AI_ACTIONS_ENABLED } from './featureFlags';

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatThread {
  id: string;
  user_id: string;
  bot_slug: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatApiResponse {
  text?: string;
  error?: string;
  hint?: string;
  detail?: string;
  status?: number;
}

export async function callChat(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<{ text: string } | { error: string }> {
  if (!AI_ACTIONS_ENABLED) {
    return {
      error:
        'AI-anrop är pausade tills Vercel-infra är fixad. Använd Claude Code/claude.ai för att prata med boten och paste:a in resultatet i dashboarden.',
    };
  }
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, messages }),
    });

    // Läs som text först — vissa felsvar (Vercel timeout, runtime crash)
    // är HTML/text och kraschar res.json() med oförståelig SyntaxError.
    const raw = await res.text();
    let body: ChatApiResponse = {};
    try {
      body = JSON.parse(raw) as ChatApiResponse;
    } catch {
      return {
        error: `Servern svarade med icke-JSON (HTTP ${res.status}). Troligen timeout — vänta 5 sek och prova igen. (${raw.slice(0, 120)})`,
      };
    }

    if (!res.ok) {
      return {
        error:
          (body.error ?? `HTTP ${res.status}`) + (body.hint ? ` — ${body.hint}` : ''),
      };
    }
    return { text: body.text ?? '' };
  } catch (e) {
    return { error: 'Kunde inte nå /api/chat — ' + String(e) };
  }
}

export async function listThreads(): Promise<ChatThread[]> {
  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as ChatThread[]) ?? [];
}

export async function listMessages(threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChatMessage[]) ?? [];
}

export async function createThread(botSlug: string, title: string): Promise<ChatThread> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('chat_threads')
    .insert({ user_id: userData.user.id, bot_slug: botSlug, title })
    .select()
    .single();
  if (error) throw error;
  return data as ChatThread;
}

export async function appendMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ thread_id: threadId, role, content })
    .select()
    .single();
  if (error) throw error;
  // bumping updated_at on the thread is auto via trigger? — no, only on UPDATE.
  // Manual bump so thread sorts to top.
  await supabase
    .from('chat_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId);
  return data as ChatMessage;
}

export async function renameThread(threadId: string, title: string) {
  const { error } = await supabase
    .from('chat_threads')
    .update({ title })
    .eq('id', threadId);
  if (error) throw error;
}

export async function deleteThread(threadId: string) {
  const { error } = await supabase.from('chat_threads').delete().eq('id', threadId);
  if (error) throw error;
}
