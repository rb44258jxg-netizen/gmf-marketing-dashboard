import { useSearchParams } from 'react-router-dom';
import Analytics from './Analytics';
import Briefing from './Briefing';
import Runs from './Runs';
import Audit from './Audit';

const VIEWS = [
  { key: 'analytics', label: 'Analytics', Component: Analytics },
  { key: 'briefing', label: 'Briefing', Component: Briefing },
  { key: 'runs', label: 'Körningar', Component: Runs },
  { key: 'audit', label: 'Audit', Component: Audit },
] as const;

type ViewKey = typeof VIEWS[number]['key'];

export default function Insights() {
  const [params, setParams] = useSearchParams();
  const active = (params.get('view') ?? 'analytics') as ViewKey;
  const View = VIEWS.find((v) => v.key === active) ?? VIEWS[0];

  return (
    <>
      <SubNav active={active} onChange={(k) => setParams({ view: k }, { replace: true })} />
      <View.Component />
    </>
  );
}

function SubNav({ active, onChange }: { active: ViewKey; onChange: (k: ViewKey) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '4px',
        marginBottom: 14,
        background: 'var(--bg-soft, rgba(0,0,0,0.04))',
        borderRadius: 8,
        flexWrap: 'wrap',
      }}
    >
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={'tab' + (active === v.key ? ' active' : '')}
          style={{ cursor: 'pointer', flex: '0 0 auto' }}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
