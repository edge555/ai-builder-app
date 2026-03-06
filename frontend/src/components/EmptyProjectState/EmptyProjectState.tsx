import { Sparkles, MonitorPlay, Code2, History } from 'lucide-react';
import './EmptyProjectState.css';

const FEATURES = [
  { icon: MonitorPlay, label: 'Live Preview', desc: 'See your app instantly' },
  { icon: Code2, label: 'Code Editor', desc: 'Edit files directly' },
  { icon: History, label: 'Version History', desc: 'Undo any change' },
];

export function EmptyProjectState() {
  return (
    <div className="empty-project-state">
      <div className="empty-project-state__card">
        <div className="empty-project-state__icon">
          <Sparkles size={32} />
        </div>
        <h2 className="empty-project-state__title">Your project will appear here</h2>
        <p className="empty-project-state__subtitle">
          Describe what you want to build in the chat panel and watch it come to life.
        </p>
        <div className="empty-project-state__features">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="empty-project-state__feature">
              <Icon size={18} className="empty-project-state__feature-icon" />
              <span className="empty-project-state__feature-label">{label}</span>
              <span className="empty-project-state__feature-desc">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
