import { supabase } from './supabase';

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
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, messages }),
    });
    const body = (await res.json()) as ChatApiResponse;
    if (!res.ok) {
      return {
        error:
          body.error ??
          `HTTP ${res.status}` + (body.hint ? ` — ${body.hint}` : ''),
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
