import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BOTS, findBot } from '../lib/bots';
import {
  appendMessage,
  callChat,
  createThread,
  deleteThread,
  listMessages,
  listThreads,
  renameThread,
  type ChatMessage,
  type ChatThread,
} from '../lib/chat';

export default function Chat() {
  const [params, setParams] = useSearchParams();
  const initialBot = params.get('bot') ?? 'marketing-strategist';
  const initialThread = params.get('thread');

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeBot, setActiveBot] = useState<string>(initialBot);
  const [activeThread, setActiveThread] = useState<string | null>(initialThread);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const bot = useMemo(() => findBot(activeBot) ?? BOTS[0], [activeBot]);
  const filteredThreads = useMemo(
    () => threads.filter((t) => t.bot_slug === activeBot),
    [threads, activeBot],
  );

  async function loadThreads() {
    try {
      setThreads(await listThreads());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadMessages(threadId: string | null) {
    if (!threadId) {
      setMessages([]);
      return;
    }
    try {
      setMessages(await listMessages(threadId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    loadMessages(activeThread);
  }, [activeThread]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length, sending]);

  function selectBot(slug: string) {
    setActiveBot(slug);
    setActiveThread(null);
    setMessages([]);
    setError(null);
    setParams({ bot: slug });
  }

  async function selectThread(t: ChatThread) {
    setActiveBot(t.bot_slug);
    setActiveThread(t.id);
    setError(null);
    setParams({ bot: t.bot_slug, thread: t.id });
  }

  async function newThread(prefilledMessage?: string) {
    setError(null);
    if (prefilledMessage !== undefined) {
      setDraft(prefilledMessage);
    } else {
      setDraft('');
    }
    setActiveThread(null);
    setMessages([]);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    let threadId = activeThread;
    try {
      if (!threadId) {
        const title = text.slice(0, 60) + (text.length > 60 ? '…' : '');
        const t = await createThread(bot.slug, title);
        threadId = t.id;
        setActiveThread(t.id);
        setParams({ bot: bot.slug, thread: t.id });
        await loadThreads();
      }

      const userMsg = await appendMessage(threadId, 'user', text);
      const newMsgs = [...messages, userMsg];
      setMessages(newMsgs);
      setDraft('');

      const result = await callChat(
        bot.system_prompt,
        newMsgs.map((m) => ({ role: m.role, content: m.content })),
      );
      if ('error' in result) {
        setError(result.error);
        setSending(false);
        return;
      }

      const assistantMsg = await appendMessage(threadId, 'assistant', result.text);
      setMessages([...newMsgs, assistantMsg]);
      await loadThreads();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function rename(t: ChatThread) {
    const title = prompt('Nytt namn:', t.title);
    if (!title || title === t.title) return;
    await renameThread(t.id, title);
    await loadThreads();
  }

  async function remove(t: ChatThread) {
    if (!confirm(`Radera "${t.title}"? Alla meddelanden försvinner.`)) return;
    await deleteThread(t.id);
    if (activeThread === t.id) {
      setActiveThread(null);
      setMessages([]);
    }
    await loadThreads();
  }

  return (
    <div className="chat-shell">
      {/* Sidebar — bots + threads */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar-section">
          <div className="card-title" style={{ marginBottom: 8 }}>Bottar</div>
          {BOTS.map((b) => (
            <button
              key={b.slug}
              className={'chat-bot-btn' + (b.slug === activeBot ? ' active' : '')}
              onClick={() => selectBot(b.slug)}
              title={b.description}
            >
              <span className="chat-bot-icon" style={{ background: b.color + '20', color: b.color }}>
                {b.icon}
              </span>
              <span className="chat-bot-name">{b.name}</span>
            </button>
          ))}
        </div>

        <div className="chat-sidebar-section">
          <div className="card-title" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Konversationer</span>
            <button
              className="content-action-btn"
              onClick={() => newThread()}
              title="Ny konversation"
            >
              + Ny
            </button>
          </div>
          {filteredThreads.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', padding: '4px 0' }}>
              Inga konversationer än med {bot.name}.
            </div>
          )}
          {filteredThreads.map((t) => (
            <div
              key={t.id}
              className={'chat-thread-item' + (t.id === activeThread ? ' active' : '')}
              onClick={() => selectThread(t)}
            >
              <div className="chat-thread-title">{t.title}</div>
              <div className="chat-thread-actions">
                <button
                  className="content-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    rename(t);
                  }}
                >
                  ✎
                </button>
                <button
                  className="content-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(t);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="chat-main">
        <div className="chat-header">
          <div className="chat-bot-icon" style={{ background: bot.color + '20', color: bot.color, width: 40, height: 40, fontSize: 20 }}>
            {bot.icon}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{bot.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{bot.role}</div>
          </div>
        </div>

        {error && <div className="auth-error" style={{ margin: '8px 0' }}>{error}</div>}

        <div className="chat-messages" ref={scrollerRef}>
          {messages.length === 0 && !sending && (
            <div className="chat-starter">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>{bot.description}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 16 }}>
                Förslag på frågor att börja med:
              </div>
              {bot.starter_questions.map((q) => (
                <button
                  key={q}
                  className="chat-starter-btn"
                  onClick={() => newThread(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={'chat-msg chat-msg-' + m.role}>
              {m.role === 'assistant' && (
                <div className="chat-msg-avatar" style={{ background: bot.color + '20', color: bot.color }}>
                  {bot.icon}
                </div>
              )}
              <div className="chat-msg-bubble">{m.content}</div>
            </div>
          ))}
          {sending && (
            <div className="chat-msg chat-msg-assistant">
              <div className="chat-msg-avatar" style={{ background: bot.color + '20', color: bot.color }}>
                {bot.icon}
              </div>
              <div className="chat-msg-bubble">
                <div className="loading" style={{ padding: 0, justifyContent: 'flex-start' }}>
                  <div className="spinner" />
                  Skriver…
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="chat-input">
          <textarea
            className="persona-input"
            rows={3}
            placeholder={`Skriv till ${bot.name}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              ⌘+Enter för att skicka
            </span>
            <button className="btn-primary" onClick={send} disabled={!draft.trim() || sending}>
              {sending ? 'Skickar…' : 'Skicka'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
