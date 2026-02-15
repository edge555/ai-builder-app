import { useState, useMemo, useRef } from 'react';

import type { StarterTemplate } from '@/data/templates';
import './TemplateGrid.css';

interface TemplateGridProps {
  templates: StarterTemplate[];
  onSelect: (template: StarterTemplate) => void;
}

const CATEGORIES = [
  'All',
  'Dashboard',
  'Marketing',
  'Productivity',
  'E-Commerce',
  'Social',
  'Utility',
  'Content',
];

export function TemplateGrid({ templates, onSelect }: TemplateGridProps) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = useMemo(() => {
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

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <div className="template-grid-container">
      {/* Announce filter changes to screen readers */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {filteredTemplates.length} {filteredTemplates.length === 1 ? 'template' : 'templates'} found
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
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            className="template-card"
            onClick={() => onSelect(template)}
            aria-label={`Select ${template.name} template`}
            data-category={template.category}
          >
            <div className="template-card-icon-container" data-category={template.category}>
              <span className="template-card-icon">{template.icon}</span>
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

      {filteredTemplates.length === 0 && (
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
