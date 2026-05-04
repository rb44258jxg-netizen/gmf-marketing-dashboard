import { supabase } from './supabase';
import { findBot } from './bots';
import { callChat } from './chat';

export interface ContentComment {
  id: string;
  content_item_id: string;
  author_id: string | null;
  author_email: string | null;
  author_kind: 'user' | 'bot';
  bot_slug: string | null;
  body: string;
  created_at: string;
}

export async function listComments(contentItemId: string): Promise<ContentComment[]> {
  const { data, error } = await supabase
    .from('content_comments')
    .select('*')
    .eq('content_item_id', contentItemId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ContentComment[]) ?? [];
}

export async function addUserComment(contentItemId: string, body: string): Promise<ContentComment> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('content_comments')
    .insert({
      content_item_id: contentItemId,
      author_id: userData.user?.id ?? null,
      author_email: userData.user?.email ?? null,
      author_kind: 'user',
      body,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ContentComment;
}

export async function addBotComment(
  contentItemId: string,
  botSlug: string,
  body: string,
): Promise<ContentComment> {
  const { data, error } = await supabase
    .from('content_comments')
    .insert({
      content_item_id: contentItemId,
      author_kind: 'bot',
      bot_slug: botSlug,
      author_email: null,
      body,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ContentComment;
}

/**
 * Auto-trigga Brand Guardian när content går till "granskning"-status.
 * Boten får titel + notes + typ, genererar feedback och sparar som kommentar.
 */
export async function autoReviewWithBrandGuardian(item: {
  id: string;
  title: string;
  notes: string | null;
  type: string;
}): Promise<{ ok: true } | { error: string }> {
  const bot = findBot('brand-guardian');
  if (!bot) return { error: 'brand-guardian saknas' };

  const userMsg = `Granska följande ${item.type}-innehåll:

**Titel:** ${item.title}

${item.notes ? `**Innehåll:**\n${item.notes}` : '(ingen kropp angiven än — bedöm bara titeln)'}

Ge feedback enligt ditt vanliga format: helhetsomdöme, specifika problem, tre konkreta ändringar.`;

  const result = await callChat(bot.system_prompt, [{ role: 'user', content: userMsg }]);
  if ('error' in result) return result;

  await addBotComment(item.id, 'brand-guardian', result.text);
  return { ok: true };
}
