import { useState, useRef, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import './EditableProjectName.css';

export interface EditableProjectNameProps {
  /** Current project name */
  name: string;
  /** Callback when name is changed */
  onRename: (newName: string) => void;
  /** Optional CSS class for styling */
  className?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
}

/**
 * Inline editable project name component.
 * Shows name as text with pencil icon on hover.
 * Click to edit, Enter/blur to commit, Escape to cancel.
 */
export function EditableProjectName({
  name,
  onRename,
  className = '',
  disabled = false,
}: EditableProjectNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Update edit value when name prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(name);
    }
  }, [name, isEditing]);

  const startEditing = () => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(name);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValue(name);
  };

  const commitEdit = () => {
    const trimmedValue = editValue.trim();

    if (!trimmedValue) {
      // Don't allow empty names
      cancelEditing();
      return;
    }

    if (trimmedValue !== name) {
      onRename(trimmedValue);
    }

    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const handleBlur = () => {
    commitEdit();
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={`editable-project-name-input ${className}`}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        maxLength={100}
      />
    );
  }

  return (
    <div
      className={`editable-project-name ${disabled ? 'editable-project-name--disabled' : ''} ${className}`}
      onClick={startEditing}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEditing();
        }
      }}
      aria-label="Click to edit project name"
    >
      <span className="editable-project-name-text">{name}</span>
      {!disabled && (
        <Pencil size={14} className="editable-project-name-icon" aria-hidden="true" />
      )}
    </div>
  );
}
