import { useSearchParams } from 'react-router-dom';
import Personas from './Personas';
import Competitors from './Competitors';

type View = 'personas' | 'competitors';

const VIEWS: Array<{ id: View; label: string; icon: string }> = [
  { id: 'personas', label: 'Personas', icon: '👥' },
  { id: 'competitors', label: 'Konkurrenter', icon: '🏆' },
];

export default function Knowledge() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'personas';

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={'content-filter' + (view === v.id ? ' active' : '')}
            onClick={() => setParams({ view: v.id })}
            style={{ fontSize: 13, padding: '8px 16px' }}
          >
            <span style={{ marginRight: 6 }}>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'personas' && <Personas />}
      {view === 'competitors' && <Competitors />}
    </>
  );
}
