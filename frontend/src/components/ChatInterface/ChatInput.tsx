import type { ImageAttachment } from '@ai-app-builder/shared/types';
import { useState, useRef, useEffect, useCallback } from 'react';

import { uploadImage, getImagesFromClipboard, getImagesFromDrop, createPreviewUrl } from '@/services/image-upload';

import './ChatInterface.css';

const MAX_ATTACHMENTS = 5;

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
  uploading: boolean;
  error?: string;
  attachment?: ImageAttachment;
}

export interface ChatInputProps {
  /** Callback when user submits a prompt */
  onSubmit: (prompt: string, attachments?: ImageAttachment[]) => Promise<void>;
  /** Whether submission is disabled (e.g., during loading) */
  disabled?: boolean;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether to show abort button */
  showAbort?: boolean;
  /** Callback to abort current request */
  onAbort?: () => void;
}

/**
 * Chat input component with textarea, image attachments, and submit button.
 * Supports Ctrl+Enter / Cmd+Enter for quick submission.
 * Supports image paste (Ctrl+V), drag-and-drop, and file picker.
 */
export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = 'Describe your app or request a modification... (or paste/drop images)',
  showAbort = false,
  onAbort,
}: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // Only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addImages = useCallback(async (files: File[]) => {
    if (disabled) return;

    const remaining = MAX_ATTACHMENTS - pendingImages.length;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length === 0) return;

    // Create pending entries with previews
    const newPending: PendingImage[] = toAdd.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: createPreviewUrl(file),
      uploading: true,
    }));

    setPendingImages((prev) => [...prev, ...newPending]);

    // Upload each image
    for (const pending of newPending) {
      const result = await uploadImage(pending.file);
      setPendingImages((prev) =>
        prev.map((img) =>
          img.id === pending.id
            ? {
                ...img,
                uploading: false,
                attachment: result.attachment,
                error: result.error,
              }
            : img
        )
      );
    }
  }, [disabled, pendingImages.length]);

  const removeImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || disabled) return;

    // Check if any images are still uploading
    const stillUploading = pendingImages.some((img) => img.uploading);
    if (stillUploading) return;

    // Collect successful attachments
    const attachments = pendingImages
      .filter((img) => img.attachment)
      .map((img) => img.attachment!);

    // Clear state
    setInputValue('');
    pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setPendingImages([]);

    await onSubmit(trimmedInput, attachments.length > 0 ? attachments : undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = getImagesFromClipboard(e.nativeEvent);
    if (files.length > 0) {
      e.preventDefault();
      addImages(files);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const files = getImagesFromDrop(e.nativeEvent);
    if (files.length > 0) {
      addImages(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addImages(files);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const hasImages = pendingImages.length > 0;
  const isUploading = pendingImages.some((img) => img.uploading);
  const canSubmit = inputValue.trim() && !disabled && !isUploading;

  return (
    <form
      className={`chat-input-form ${isDragOver ? 'chat-input-form--drag-over' : ''}`}
      onSubmit={handleSubmit}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="chat-input-row">
        {/* Image attach button */}
        <button
          type="button"
          className="chat-input-attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || pendingImages.length >= MAX_ATTACHMENTS}
          aria-label="Attach image"
          title={pendingImages.length >= MAX_ATTACHMENTS ? `Maximum ${MAX_ATTACHMENTS} images reached` : "Attach image (or paste/drop)"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          aria-hidden="true"
        />

        <textarea
          ref={inputRef}
          className="chat-input ui-textarea"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          aria-label="Chat input"
        />
        <button
          type="submit"
          className="chat-submit-button ui-button"
          data-variant="primary"
          disabled={!canSubmit}
          aria-label="Send message"
          title={isUploading ? "Waiting for images to upload..." : undefined}
        >
          {disabled ? (
            <span className="export-button-spinner"></span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          )}
        </button>
      </div>

      {/* Image thumbnails — horizontal scroll strip below textarea */}
      {hasImages && (
        <div className="chat-input-thumbnails">
          {pendingImages.map((img) => (
            <div
              key={img.id}
              className={`chat-input-thumbnail ${img.uploading ? 'chat-input-thumbnail--uploading' : ''} ${img.error ? 'chat-input-thumbnail--error' : ''}`}
            >
              <img src={img.previewUrl} alt={img.file.name} />
              {img.uploading && (
                <div className="chat-input-thumbnail-overlay">
                  <span className="chat-input-thumbnail-spinner"></span>
                </div>
              )}
              {img.error && (
                <div className="chat-input-thumbnail-overlay chat-input-thumbnail-overlay--error" title={img.error}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                  </svg>
                </div>
              )}
              <button
                type="button"
                className="chat-input-thumbnail-remove"
                onClick={() => removeImage(img.id)}
                aria-label={`Remove ${img.file.name}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {disabled && showAbort && onAbort && (
        <button
          type="button"
          className="chat-abort-button"
          onClick={onAbort}
          aria-label="Stop generating"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
          Stop generating
        </button>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="chat-input-drag-overlay">
          <span>Drop images here</span>
        </div>
      )}
    </form>
  );
}
