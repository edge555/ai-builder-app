import { BarChart2, Globe, CheckSquare, ShoppingCart, MessageCircle, Cloud, FileText, Sparkles, type LucideIcon } from 'lucide-react';
import { useState, useMemo, useRef } from 'react';

import type { StarterTemplate } from '@/data/templates';
import type { UserTemplate } from '@/services/storage';
import './TemplateGrid.css';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Dashboard: BarChart2,
  Marketing: Globe,
  Productivity: CheckSquare,
  'E-Commerce': ShoppingCart,
  Social: MessageCircle,
  Utility: Cloud,
  Content: FileText,
  'My Templates': Sparkles,
};

interface TemplateGridProps {
  templates: StarterTemplate[];
  onSelect: (template: StarterTemplate) => void;
  userTemplates?: UserTemplate[];
  onSelectUserTemplate?: (template: UserTemplate) => void;
  onDeleteUserTemplate?: (id: string) => void;
}

const CATEGORIES = [
  'All',
  'My Templates',
  'Dashboard',
  'Marketing',
  'Productivity',
  'E-Commerce',
  'Social',
  'Utility',
  'Content',
];

export function TemplateGrid({ templates, onSelect, userTemplates = [], onSelectUserTemplate, onDeleteUserTemplate }: TemplateGridProps) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'My Templates') {
      return [];
    }

    let filtered = templates;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter((t) => t.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [templates, selectedCategory, searchQuery]);

  const filteredUserTemplates = useMemo(() => {
    if (selectedCategory !== 'All' && selectedCategory !== 'My Templates') {
      return [];
    }

    let filtered = userTemplates;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [userTemplates, selectedCategory, searchQuery]);

  const totalCount = filteredTemplates.length + filteredUserTemplates.length;

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <div className="template-grid-container">
      {/* Announce filter changes to screen readers */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {totalCount} {totalCount === 1 ? 'template' : 'templates'} found
        {selectedCategory !== 'All' && ` in ${selectedCategory}`}
        {searchQuery && ` matching "${searchQuery}"`}
      </div>

      <div className="template-filters-container">
        <div className="template-filters" role="group" aria-label="Template category filters">
          <div className="template-filters-scroll">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                className={`filter-pill ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
                aria-pressed={selectedCategory === category}
                aria-label={`Filter by ${category} category`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="template-search" role="search">
          <div className="search-input-wrapper">
            <svg
              className="search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="template-search-input"
              aria-label="Search templates"
            />
            {searchQuery && (
              <button
                className="search-clear-button"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="template-grid">
        {filteredUserTemplates.map((template) => (
          <button
            key={template.id}
            className="template-card template-card--user"
            onClick={() => onSelectUserTemplate?.(template)}
            aria-label={`Select ${template.name} template`}
            data-category="My Templates"
          >
            {template.screenshot ? (
              <div className="template-card-screenshot">
                <img src={template.screenshot} alt={`${template.name} preview`} />
              </div>
            ) : (
              <div className="template-card-icon-container" data-category="My Templates">
                {(() => { const Icon = CATEGORY_ICONS['My Templates'] ?? Sparkles; return <Icon size={28} className="template-card-icon" strokeWidth={1.5} />; })()}
              </div>
            )}
            <div className="template-card-content">
              <h3 className="template-card-title">{template.name}</h3>
              <p className="template-card-description">{template.description}</p>
            </div>
            {onDeleteUserTemplate && (
              <button
                className="template-card-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteUserTemplate(template.id);
                }}
                aria-label={`Delete ${template.name} template`}
                title="Delete template"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <div className="template-card-arrow" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
        ))}

        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            className="template-card"
            onClick={() => onSelect(template)}
            aria-label={`Select ${template.name} template`}
            data-category={template.category}
          >
            <div className="template-card-icon-container" data-category={template.category}>
              {(() => { const Icon = CATEGORY_ICONS[template.category] ?? Sparkles; return <Icon size={28} className="template-card-icon" strokeWidth={1.5} />; })()}
            </div>
            <div className="template-card-content">
              <h3 className="template-card-title">{template.name}</h3>
              <p className="template-card-description">{template.description}</p>
            </div>
            <div className="template-card-arrow" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {totalCount === 0 && (
        <div className="template-empty-state">
          <div className="empty-state-icon">🔍</div>
          <p>
            {searchQuery
              ? `No templates matching "${searchQuery}" found.`
              : "No templates found in this category."}
          </p>
          {searchQuery && (
            <button
              className="ui-button ui-button-ghost"
              onClick={handleClearSearch}
              style={{ marginTop: '12px' }}
            >
              Clear Search
            </button>
          )}
        </div>
      )}
    </div>
  );
}
