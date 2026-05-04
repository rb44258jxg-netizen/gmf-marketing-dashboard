interface Channel {
  name: string;
  desc: string;
  icon: string;
  color: string;
  status: 'connected' | 'manual' | 'planned';
  link?: string;
}

interface Recommended {
  name: string;
  desc: string;
  icon: string;
  priority: 'hög' | 'medel';
}

const CHANNELS: Channel[] = [
  { name: 'MailerLite', desc: 'E-postkampanjer, automation, prenumeranter', icon: '✉️', color: '#30C48D', status: 'connected', link: 'https://dashboard.mailerlite.com' },
  { name: 'finance.greenmerc.com Admin', desc: 'Investerare, KYC, emissioner, innehåll', icon: '🌐', color: '#1d8775', status: 'connected', link: 'https://finance.greenmerc.com/admin' },
  { name: 'Slack', desc: 'Internt team & kommunikation', icon: '💬', color: '#4A154B', status: 'connected' },
  { name: 'Gmail', desc: 'E-post & kontakt', icon: '📧', color: '#EA4335', status: 'connected', link: 'https://mail.google.com' },
  { name: 'Google Drive', desc: 'Filer, bilder, pitch decks', icon: '📁', color: '#4285F4', status: 'connected', link: 'https://drive.google.com' },
  { name: 'Google Calendar', desc: 'Planering & möten', icon: '📅', color: '#4285F4', status: 'connected', link: 'https://calendar.google.com' },
  { name: 'LinkedIn', desc: 'B2B-marknadsföring & thought leadership', icon: '💼', color: '#0A66C2', status: 'manual', link: 'https://www.linkedin.com/company/greenmerc/' },
  { name: 'X (Twitter)', desc: 'Kort-format, nyheter', icon: '𝕏', color: '#000', status: 'planned' },
  { name: 'Meta (FB + IG)', desc: 'Community, visuellt, annonsering', icon: '📘', color: '#1877F2', status: 'planned' },
];

const RECOMMENDED: Recommended[] = [
  { name: 'Nyemissioner.se', desc: 'Lista KEY-emissionen — exakt rätt målgrupp', icon: '🎯', priority: 'hög' },
  { name: 'RikaTillsammans Forum', desc: 'Delta i Lekhinken — onoterade investeringar', icon: '💰', priority: 'hög' },
  { name: 'Placera Forum', desc: 'Avanzas community — 100k+ investerare', icon: '📈', priority: 'hög' },
  { name: 'InvesteraMera.se', desc: 'KEY-artikel redan publicerad — dela aktivt', icon: '📰', priority: 'hög' },
  { name: 'Reddit r/Aktier', desc: 'Svensk investerar-subreddit', icon: '🔴', priority: 'medel' },
  { name: 'Investpodden', desc: 'Pitcha gästframträdande — pre-IPO-fokus', icon: '🎙️', priority: 'medel' },
  { name: 'Alla Aktier Discord', desc: '8000+ medlemmar — diskuterar onoterat', icon: '🎮', priority: 'medel' },
  { name: 'Breakit / Realtid', desc: 'PR om GMF-lanseringen som fintech', icon: '📰', priority: 'medel' },
];

const STATUS_BADGE: Record<Channel['status'], { label: string; cls: string }> = {
  connected: { label: 'Kopplad', cls: 'badge-green' },
  manual: { label: 'Manuell', cls: 'badge-yellow' },
  planned: { label: 'Planerad', cls: 'badge-blue' },
};

export default function Channels() {
  return (
    <>
      <div className="card">
        <div className="card-title">Anslutna plattformar & verktyg</div>
        {CHANNELS.map((c) => (
          <Row key={c.name}>
            <Icon icon={c.icon} color={c.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.desc}
              </div>
            </div>
            {c.link && (
              <a href={c.link} target="_blank" rel="noreferrer" className="header-link">
                Öppna →
              </a>
            )}
            <span className={'badge ' + STATUS_BADGE[c.status].cls} style={{ marginLeft: 6 }}>
              {STATUS_BADGE[c.status].label}
            </span>
          </Row>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Rekommenderade kanaler att aktivera</div>
        {RECOMMENDED.map((r) => (
          <Row key={r.name}>
            <Icon icon={r.icon} color="var(--deep-teal)" bg="var(--lilac)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{r.desc}</div>
            </div>
            <span className={'badge ' + (r.priority === 'hög' ? 'badge-green' : 'badge-blue')}>
              {r.priority === 'hög' ? 'Hög' : 'Medel'}
            </span>
          </Row>
        ))}
      </div>
    </>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid var(--border)',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Icon({ icon, color, bg }: { icon: string; color: string; bg?: string }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: bg ?? color + '15',
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
  );
}
