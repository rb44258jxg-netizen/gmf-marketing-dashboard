import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import AskBot from '../components/AskBot';
import { autoReviewWithBrandGuardian, listComments, addUserComment, type ContentComment } from '../lib/comments';
import { createCampaign } from '../lib/mailerlite';
import type {
  ContentItemInsert,
  ContentItemRow,
  ContentItemUpdate,
  ContentStatus,
  ContentTrack,
  ContentType,
} from '../lib/database.types';

const TYPE_FILTERS: Array<{ value: ContentType | 'all'; label: string }> = [
  { value: 'all', label: 'Alla' },
  { value: 'blogg', label: 'Blogg' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email', label: 'E-post' },
  { value: 'annons', label: 'Annons' },
  { value: 'web', label: 'Webb' },
];

const TYPE_LABEL: Record<ContentType, { label: string; cls: string }> = {
  blogg: { label: 'Blogg', cls: 'badge-purple' },
  linkedin: { label: 'LinkedIn', cls: 'badge-blue' },
  email: { label: 'E-post', cls: 'badge-green' },
  annons: { label: 'Annons', cls: 'badge-orange' },
  web: { label: 'Dokument', cls: 'badge-gray' },
};

const STATUS_LABEL: Record<ContentStatus, { label: string; cls: string }> = {
  utkast: { label: 'Utkast', cls: 'badge-gray' },
  granskning: { label: 'Granskning', cls: 'badge-yellow' },
  redo: { label: 'Redo', cls: 'badge-green' },
  publicerad: { label: 'Publicerad', cls: 'badge-blue' },
};

const STATUS_VALUES: ContentStatus[] = ['utkast', 'granskning', 'redo', 'publicerad'];

const TRACK_LABEL: Record<ContentTrack, { label: string; cls: string; description: string }> = {
  platform: { label: 'GMF', cls: 'badge-blue', description: 'Plattform — features, ECSPR, varumärke' },
  case: { label: 'Case', cls: 'badge-purple', description: 'Specifikt investmentcase (t.ex. KEY Experience)' },
  internal: { label: 'Internt', cls: 'badge-gray', description: 'Strategi-dokument, ej publicerat externt' },
};

const TRACK_FILTERS: Array<{ value: ContentTrack | 'all'; label: string }> = [
  { value: 'all', label: 'Alla spår' },
  { value: 'platform', label: 'GMF' },
  { value: 'case', label: 'Case' },
  { value: 'internal', label: 'Internt' },
];

interface DraftItem {
  title: string;
  type: ContentType;
  status: ContentStatus;
  track: ContentTrack | '';
  case_id: string;
  file: string;
  notes: string;
}

const EMPTY_DRAFT: DraftItem = {
  title: '',
  type: 'blogg',
  status: 'utkast',
  track: '',
  case_id: '',
  file: '',
  notes: '',
};

interface CaseRef {
  id: string;
  name: string;
}

export default function Content() {
  const [params] = useSearchParams();
  const caseFilterParam = params.get('case');
  const [items, setItems] = useState<ContentItemRow[] | null>(null);
  const [cases, setCases] = useState<CaseRef[]>([]);
  const [filter, setFilter] = useState<ContentType | 'all'>('all');
  const [trackFilter, setTrackFilter] = useState<ContentTrack | 'all'>('all');
  const [expandedCommentsId, setExpandedCommentsId] = useState<string | null>(null);
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftItem>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data, error: err }, caseRes] = await Promise.all([
      supabase.from('content_items').select('*').order('created_at', { ascending: false }),
      supabase.from('cases').select('id, name').order('name'),
    ]);
    if (err) setError(err.message);
    else setItems(data as ContentItemRow[]);
    setCases((caseRes.data as CaseRef[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((i) => {
      if (filter !== 'all' && i.type !== filter) return false;
      if (trackFilter !== 'all' && i.track !== trackFilter) return false;
      if (caseFilterParam && (i as ContentItemRow & { case_id?: string | null }).case_id !== caseFilterParam)
        return false;
      return true;
    });
  }, [items, filter, trackFilter, caseFilterParam]);

  const counts = useMemo(() => {
    const c = { utkast: 0, granskning: 0, redo: 0, publicerad: 0 };
    items?.forEach((i) => {
      c[i.status] = (c[i.status] ?? 0) + 1;
    });
    return c;
  }, [items]);

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setShowCreate(true);
    setError(null);
  }

  function openEdit(item: ContentItemRow) {
    setDraft({
      title: item.title,
      type: item.type,
      status: item.status,
      track: item.track ?? '',
      case_id: (item as ContentItemRow & { case_id?: string | null }).case_id ?? '',
      file: item.file ?? '',
      notes: item.notes ?? '',
    });
    setEditingId(item.id);
    setShowCreate(true);
    setError(null);
  }

  function close() {
    setShowCreate(false);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  async function save() {
    if (!draft.title.trim()) {
      setError('Titel krävs');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: draft.title.trim(),
      type: draft.type,
      status: draft.status,
      track: draft.track ? (draft.track as ContentTrack) : null,
      case_id: draft.case_id || null,
      file: draft.file.trim() || null,
      notes: draft.notes.trim() || null,
    } as ContentItemInsert & { case_id: string | null };
    if (editingId) {
      const before = items?.find((i) => i.id === editingId);
      const update: ContentItemUpdate = payload;
      const { data, error: err } = await supabase
        .from('content_items')
        .update(update)
        .eq('id', editingId)
        .select()
        .single();
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      await logAudit({
        action: 'content.update',
        entity_type: 'content_item',
        entity_id: editingId,
        before,
        after: data,
      });
    } else {
      const insert: ContentItemInsert = payload;
      const { data, error: err } = await supabase
        .from('content_items')
        .insert(insert)
        .select()
        .single();
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      await logAudit({
        action: 'content.create',
        entity_type: 'content_item',
        entity_id: data?.id ?? null,
        before: null,
        after: data,
      });
    }
    close();
    await load();
  }

  async function setStatus(item: ContentItemRow, status: ContentStatus) {
    if (status === item.status) return;
    const before = { ...item };
    const { data, error: err } = await supabase
      .from('content_items')
      .update({ status })
      .eq('id', item.id)
      .select()
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    await logAudit({
      action: 'content.status',
      entity_type: 'content_item',
      entity_id: item.id,
      before,
      after: data,
    });
    await load();

    // Approval workflow: när status sätts till "granskning", auto-trigga Brand Guardian
    if (status === 'granskning' && before.status !== 'granskning') {
      setBusyId(item.id);
      try {
        await autoReviewWithBrandGuardian({
          id: item.id,
          title: item.title,
          notes: item.notes,
          type: item.type,
        });
      } finally {
        setBusyId(null);
      }
    }
  }

  async function loadComments(itemId: string) {
    if (expandedCommentsId === itemId) {
      setExpandedCommentsId(null);
      setComments([]);
      return;
    }
    setExpandedCommentsId(itemId);
    setCommentDraft('');
    try {
      const c = await listComments(itemId);
      setComments(c);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function postComment() {
    if (!expandedCommentsId || !commentDraft.trim()) return;
    try {
      await addUserComment(expandedCommentsId, commentDraft.trim());
      setCommentDraft('');
      const c = await listComments(expandedCommentsId);
      setComments(c);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pushToMailerLite(item: ContentItemRow) {
    if (item.type !== 'email') return;
    setBusyId(item.id);
    try {
      const result = await createCampaign({
        name: item.title,
        subject: item.title,
        content: item.notes ?? '<p>(Body ej angivet ännu — fyll i i MailerLite)</p>',
      });
      if ('error' in result) {
        setError('MailerLite: ' + result.error);
        return;
      }
      await supabase
        .from('content_items')
        .update({
          mailerlite_campaign_id: result.campaign.id,
          mailerlite_dashboard_url: result.campaign.dashboard_url,
        })
        .eq('id', item.id);
      await logAudit({
        action: 'content.mailerlite.create_draft',
        entity_type: 'content_item',
        entity_id: item.id,
        before: null,
        after: { campaign_id: result.campaign.id },
      });
      await load();
      if (result.campaign.dashboard_url) window.open(result.campaign.dashboard_url, '_blank');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: ContentItemRow) {
    if (!confirm(`Radera "${item.title}"? Detta går inte att ångra.`)) return;
    const { error: err } = await supabase.from('content_items').delete().eq('id', item.id);
    if (err) {
      setError(err.message);
      return;
    }
    await logAudit({
      action: 'content.delete',
      entity_type: 'content_item',
      entity_id: item.id,
      before: item,
      after: null,
    });
    await load();
  }

  if (items === null) {
    return (
      <div className="loading">
        <div className="spinner" />
        Laddar innehåll…
      </div>
    );
  }

  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Content Library</div>
        <div className="card-hero-sub">
          Allt producerat marknadsmaterial. Granska, redigera och godkänn innan publicering.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AskBot botSlug="content-writer" label="Skriv nytt innehåll" />
          <AskBot botSlug="brand-guardian" label="Granska text" />
          <AskBot botSlug="seo-strategist" label="SEO-brief" />
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 4 }}>
            Spår
          </div>
          <div className="content-filters" style={{ marginBottom: 0 }}>
            {TRACK_FILTERS.map((f) => (
              <button
                key={f.value}
                className={'content-filter' + (trackFilter === f.value ? ' active' : '')}
                onClick={() => setTrackFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 4 }}>
            Typ
          </div>
          <div className="content-filters" style={{ marginBottom: 0 }}>
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                className={'content-filter' + (filter === f.value ? ' active' : '')}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Material
          <button className="btn-primary" onClick={openCreate}>
            + Nytt innehåll
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div className="content-item header-row">
            <div>Titel</div>
            <div>Typ / Spår</div>
            <div>Status</div>
            <div>Åtgärd</div>
          </div>
          {filtered.length === 0 && (
            <div className="empty-state">
              <strong>Inget innehåll matchar filtren</strong>
              Justera spår/typ ovan eller klicka "+ Nytt innehåll".
            </div>
          )}
          {filtered.map((item) => {
            const t = TYPE_LABEL[item.type];
            const tr = item.track ? TRACK_LABEL[item.track] : null;
            return (
              <div className="content-item" key={item.id}>
                <div>
                  <div className="content-item-title">{item.title}</div>
                  {item.file && (
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{item.file}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className={'badge ' + t.cls}>{t.label}</span>
                  {tr && <span className={'badge ' + tr.cls}>{tr.label}</span>}
                </div>
                <div>
                  <select
                    className="persona-input"
                    style={{ marginBottom: 0, padding: '4px 8px', fontSize: 11 }}
                    value={item.status}
                    onChange={(e) => setStatus(item, e.target.value as ContentStatus)}
                    aria-label="Status"
                  >
                    {STATUS_VALUES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="content-actions">
                  <AskBot
                    botSlug="brand-guardian"
                    label="Granska"
                    size="small"
                    prefill={`Granska detta ${TYPE_LABEL[item.type].label.toLowerCase()}-innehåll: "${item.title}"${item.notes ? '\n\n' + item.notes : ''}`}
                  />
                  <AskBot
                    botSlug="content-writer"
                    label="Förbättra"
                    size="small"
                    prefill={`Förbättra denna text: "${item.title}"${item.notes ? '\n\n' + item.notes : ''}`}
                  />
                  {item.type === 'email' &&
                    (item as ContentItemRow & { mailerlite_dashboard_url?: string }).mailerlite_dashboard_url ? (
                      <a
                        className="content-action-btn"
                        href={(item as ContentItemRow & { mailerlite_dashboard_url?: string }).mailerlite_dashboard_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ background: 'var(--green-bg)', color: '#0d6e54', borderColor: 'var(--green)' }}
                      >
                        ML →
                      </a>
                    ) : item.type === 'email' ? (
                      <button
                        className="content-action-btn"
                        onClick={() => pushToMailerLite(item)}
                        disabled={busyId === item.id}
                        title="Skapa utkast i MailerLite"
                      >
                        {busyId === item.id ? '…' : '→ ML'}
                      </button>
                    ) : null}
                  <button className="content-action-btn" onClick={() => loadComments(item.id)}>
                    💬
                  </button>
                  <button className="content-action-btn" onClick={() => openEdit(item)}>
                    Redigera
                  </button>
                  <button className="content-action-btn" onClick={() => remove(item)}>
                    Radera
                  </button>
                </div>
                {expandedCommentsId === item.id && (
                  <div style={{ gridColumn: '1 / -1', padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                    {comments.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                        Inga kommentarer än. När statusen sätts till "Granskning" kommenterar Brand Guardian automatiskt.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {comments.map((cm) => (
                          <div
                            key={cm.id}
                            style={{
                              padding: 10,
                              background: cm.author_kind === 'bot' ? 'var(--mint)' : 'var(--soft-cloud)',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--deep-teal)', marginBottom: 4 }}>
                              {cm.author_kind === 'bot' ? `🤖 ${cm.bot_slug}` : `👤 ${cm.author_email ?? 'okänd'}`}
                              <span style={{ marginLeft: 8, color: 'var(--muted-foreground)', fontWeight: 500 }}>
                                {new Date(cm.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{cm.body}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <input
                        className="persona-input"
                        style={{ marginBottom: 0, flex: 1 }}
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="Lägg till kommentar…"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') postComment();
                        }}
                      />
                      <button className="btn-primary" onClick={postComment} disabled={!commentDraft.trim()}>
                        Posta
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Content pipeline</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' }}>
          <Pipe count={counts.utkast} label="Utkast" color="var(--muted-foreground)" />
          <Pipe count={counts.granskning} label="Granskning" color="var(--yellow)" />
          <Pipe count={counts.redo} label="Redo" color="var(--green)" />
          <Pipe count={counts.publicerad} label="Publicerad" color="var(--deep-teal)" />
        </div>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Redigera innehåll' : 'Nytt innehåll'}</h2>
            {error && <div className="auth-error">{error}</div>}
            <label className="persona-input-label">Titel</label>
            <input
              className="persona-input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoFocus
            />
            <label className="persona-input-label">Typ</label>
            <select
              className="persona-input"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as ContentType })}
            >
              {(Object.keys(TYPE_LABEL) as ContentType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t].label}
                </option>
              ))}
            </select>
            <label className="persona-input-label">Status</label>
            <select
              className="persona-input"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as ContentStatus })}
            >
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s].label}
                </option>
              ))}
            </select>
            <label className="persona-input-label">Spår</label>
            <select
              className="persona-input"
              value={draft.track}
              onChange={(e) => setDraft({ ...draft, track: e.target.value as ContentTrack | '' })}
            >
              <option value="">— välj spår —</option>
              <option value="platform">GMF — plattform & feature-uppdateringar</option>
              <option value="case">Case — specifikt investeringscase</option>
              <option value="internal">Internt — strategi-dokument</option>
            </select>
            <label className="persona-input-label">Koppla till case (valfritt)</label>
            <select
              className="persona-input"
              value={draft.case_id}
              onChange={(e) => setDraft({ ...draft, case_id: e.target.value })}
            >
              <option value="">— inget case —</option>
              {cases.map((cse) => (
                <option key={cse.id} value={cse.id}>
                  {cse.name}
                </option>
              ))}
            </select>
            <label className="persona-input-label">Filnamn (valfritt)</label>
            <input
              className="persona-input"
              value={draft.file}
              onChange={(e) => setDraft({ ...draft, file: e.target.value })}
              placeholder="t.ex. blogg_3_ecspr.md"
            />
            <label className="persona-input-label">Anteckningar</label>
            <textarea
              className="persona-input"
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={close} disabled={busy}>
                Avbryt
              </button>
              <button className="btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Sparar…' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Pipe({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{count}</div>
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}
