interface SocialCard {
  icon: string;
  name: string;
  status: 'manual' | 'planned';
  metrics: Array<{ value: string; label: string }>;
  description: string;
  cta?: { label: string; href: string };
}

const CARDS: SocialCard[] = [
  {
    icon: '💼',
    name: 'LinkedIn',
    status: 'manual',
    metrics: [
      { value: '—', label: 'Följare' },
      { value: '—', label: 'Inlägg/mån' },
    ],
    description: 'Manuell publicering via linkedin.com',
    cta: { label: 'Öppna LinkedIn →', href: 'https://www.linkedin.com/company/greenmerc/' },
  },
  {
    icon: '𝕏',
    name: 'X (Twitter)',
    status: 'planned',
    metrics: [
      { value: '—', label: 'Följare' },
      { value: '—', label: 'Inlägg/mån' },
    ],
    description: 'Inget konto skapat ännu',
  },
  {
    icon: '📘',
    name: 'Meta',
    status: 'planned',
    metrics: [
      { value: '—', label: 'FB Följare' },
      { value: '—', label: 'IG Följare' },
    ],
    description: 'Inget konto skapat ännu',
  },
];

const ROADMAP = [
  {
    n: 1,
    name: 'LinkedIn — Manuell publicering (NU)',
    desc: 'Publicera via linkedin.com. Founder-story V2 redo att postas.',
    status: 'Redo',
    cls: 'badge-green',
  },
  {
    n: 2,
    name: 'Meta Business Suite — Skapa konton',
    desc: 'Skapa Facebook-sida + Instagram-konto. Gratis API-åtkomst.',
    status: 'Nästa steg',
    cls: 'badge-yellow',
  },
  {
    n: 3,
    name: 'X/Twitter — Skapa konto',
    desc: 'Manuell publicering gratis. API Basic $100/mån för automation.',
    status: 'Planerad',
    cls: 'badge-blue',
  },
];

export default function Social() {
  return (
    <>
      <div className="card card-hero">
        <div className="card-hero-title">Sociala medier — Integrationsstatus</div>
        <div className="card-hero-sub">
          Koppla dina konton för att se live-data och schemalägga inlägg direkt från dashboarden.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {CARDS.map((c) => (
          <div className="card" key={c.name} style={{ textAlign: 'center', padding: 18 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{c.name}</div>
            <div style={{ marginBottom: 10 }}>
              <span className={'badge ' + (c.status === 'manual' ? 'badge-yellow' : 'badge-red')}>
                {c.status === 'manual' ? 'Manuell' : 'Ej kopplad'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 12 }}>
              {c.metrics.map((m) => (
                <div key={m.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--deep-teal)' }}>{m.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 10 }}>{c.description}</div>
            {c.cta ? (
              <a href={c.cta.href} target="_blank" rel="noreferrer" className="header-link">
                {c.cta.label}
              </a>
            ) : (
              <span className="header-link" style={{ opacity: 0.5 }}>
                Inget konto än
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Integrations-roadmap</div>
        {ROADMAP.map((r) => (
          <div
            key={r.n}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'var(--mint)',
                color: 'var(--deep-teal)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {r.n}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{r.desc}</div>
            </div>
            <span className={'badge ' + r.cls}>{r.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}
