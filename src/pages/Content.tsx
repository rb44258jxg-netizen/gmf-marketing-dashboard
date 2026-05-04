import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import AskBot from '../components/AskBot';
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

interface DraftItem {
  title: string;
  type: ContentType;
  status: ContentStatus;
  track: ContentTrack | '';
  file: string;
  notes: string;
}

const EMPTY_DRAFT: DraftItem = {
  title: '',
  type: 'blogg',
  status: 'utkast',
  track: '',
  file: '',
  notes: '',
};

export default function Content() {
  const [items, setItems] = useState<ContentItemRow[] | null>(null);
  const [filter, setFilter] = useState<ContentType | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftItem>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error: err } = await supabase
      .from('content_items')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setItems(data as ContentItemRow[]);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    return filter === 'all' ? items : items.filter((i) => i.type === filter);
  }, [items, filter]);

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
      file: draft.file.trim() || null,
      notes: draft.notes.trim() || null,
    };
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

      <div className="content-filters">
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
            <div>Typ</div>
            <div>Status</div>
            <div>Åtgärd</div>
          </div>
          {filtered.length === 0 && (
            <div className="empty-state">
              <strong>Inget innehåll än</strong>
              Klicka "+ Nytt innehåll" för att lägga till.
            </div>
          )}
          {filtered.map((item) => {
            const t = TYPE_LABEL[item.type];
            return (
              <div className="content-item" key={item.id}>
                <div>
                  <div className="content-item-title">{item.title}</div>
                  {item.file && (
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{item.file}</div>
                  )}
                </div>
                <div>
                  <span className={'badge ' + t.cls}>{t.label}</span>
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
                  <button className="content-action-btn" onClick={() => openEdit(item)}>
                    Redigera
                  </button>
                  <button className="content-action-btn" onClick={() => remove(item)}>
                    Radera
                  </button>
                </div>
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
            <label className="persona-input-label">Spår (valfritt)</label>
            <select
              className="persona-input"
              value={draft.track}
              onChange={(e) => setDraft({ ...draft, track: e.target.value as ContentTrack | '' })}
            >
              <option value="">(inget)</option>
              <option value="case">Case</option>
              <option value="platform">Plattform</option>
              <option value="internal">Internt</option>
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
