import type { StarterTemplate } from '@/data/templates';
import './TemplateGrid.css';

interface TemplateGridProps {
  templates: StarterTemplate[];
  onSelect: (template: StarterTemplate) => void;
}

export function TemplateGrid({ templates, onSelect }: TemplateGridProps) {
  return (
    <div className="template-grid">
      {templates.map((template) => (
        <button
          key={template.id}
          className="template-card"
          onClick={() => onSelect(template)}
          aria-label={`Select ${template.name} template`}
        >
          <div className="template-card-icon-container">
            <span className="template-card-icon">{template.icon}</span>
          </div>
          <div className="template-card-content">
            <div className="template-card-header">
              <h3 className="template-card-title">{template.name}</h3>
              <span className="template-card-category">{template.category}</span>
            </div>
            <p className="template-card-description">{template.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
