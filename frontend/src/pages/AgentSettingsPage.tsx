import { ArrowUp, ArrowDown, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { SiteFooter } from '@/components/SiteFooter/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader/SiteHeader';
import {
  fetchAgentConfig,
  saveAgentConfig,
  fetchProviderConfig,
  saveProviderConfig,
  type AgentConfig,
  type TaskType,
  type ModelEntry,
  type AIProviderName,
  type ProviderConfigResponse,
} from '@/services/agent-config-service';
import './AgentSettingsPage.css';

const TASK_TYPES: { type: TaskType; label: string }[] = [
  { type: 'intent', label: 'Intent Detection' },
  { type: 'planning', label: 'Planning' },
  { type: 'coding', label: 'Coding' },
  { type: 'debugging', label: 'Debugging' },
  { type: 'documentation', label: 'Documentation' },
];

function createDefaultConfig(): AgentConfig {
  const tasks = {} as AgentConfig['tasks'];
  for (const { type } of TASK_TYPES) {
    tasks[type] = { taskType: type, models: [] };
  }
  return { version: 1, tasks };
}

interface StatusMessage {
  type: 'success' | 'error';
  text: string;
}

export function AgentSettingsPage() {
  const [config, setConfig] = useState<AgentConfig>(createDefaultConfig);
  const [activeTab, setActiveTab] = useState<TaskType>('intent');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [newModelId, setNewModelId] = useState('');

  // Provider state
  const [providerConfig, setProviderConfig] = useState<ProviderConfigResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AIProviderName>('openrouter');

  useEffect(() => {
    Promise.all([fetchAgentConfig(), fetchProviderConfig()])
      .then(([agentCfg, providerCfg]) => {
        setConfig(agentCfg);
        setProviderConfig(providerCfg);
        setSelectedProvider(providerCfg.provider);
      })
      .catch(() => setStatus({ type: 'error', text: 'Failed to load configuration' }))
      .finally(() => setIsLoading(false));
  }, []);

  // Clear status after 3 seconds
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  const activeModels = config.tasks[activeTab]?.models ?? [];

  const updateModels = useCallback(
    (taskType: TaskType, updater: (models: ModelEntry[]) => ModelEntry[]) => {
      setConfig((prev) => ({
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskType]: {
            ...prev.tasks[taskType],
            models: updater(prev.tasks[taskType].models),
          },
        },
      }));
    },
    []
  );

  const handleToggleActive = (index: number) => {
    updateModels(activeTab, (models) =>
      models.map((m, i) => (i === index ? { ...m, active: !m.active } : m))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    updateModels(activeTab, (models) => {
      const next = [...models];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((m, i) => ({ ...m, priority: i + 1 }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= activeModels.length - 1) return;
    updateModels(activeTab, (models) => {
      const next = [...models];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((m, i) => ({ ...m, priority: i + 1 }));
    });
  };

  const handleRemove = (index: number) => {
    updateModels(activeTab, (models) =>
      models.filter((_, i) => i !== index).map((m, i) => ({ ...m, priority: i + 1 }))
    );
  };

  const handleAddModel = () => {
    const trimmed = newModelId.trim();
    if (!trimmed) return;
    if (activeModels.some((m) => m.id === trimmed)) {
      setStatus({ type: 'error', text: `Model "${trimmed}" already exists in this task` });
      return;
    }
    updateModels(activeTab, (models) => [
      ...models,
      { id: trimmed, active: true, priority: models.length + 1 },
    ]);
    setNewModelId('');
  };

  const handleResetProvider = () => {
    if (providerConfig) {
      setSelectedProvider(providerConfig.envProvider);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      const providerOverride =
        providerConfig && selectedProvider === providerConfig.envProvider
          ? null
          : selectedProvider;

      const [savedAgent, savedProvider] = await Promise.all([
        saveAgentConfig(config),
        saveProviderConfig(providerOverride),
      ]);
      setConfig(savedAgent);
      setProviderConfig(savedProvider);
      setSelectedProvider(savedProvider.provider);
      setStatus({ type: 'success', text: 'Configuration saved successfully' });
    } catch {
      setStatus({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setIsSaving(false);
    }
  };

  const isProviderOverridden =
    providerConfig !== null && selectedProvider !== providerConfig.envProvider;

  // Header actions: save button
  const headerActions = (
    <button
      className="agent-settings-save-btn"
      onClick={handleSave}
      disabled={isSaving}
    >
      {isSaving ? (
        <Loader2 size={15} className="agent-settings-spinner" />
      ) : (
        <Save size={15} />
      )}
      <span>{isSaving ? 'Saving...' : 'Save'}</span>
    </button>
  );

  if (isLoading) {
    return (
      <div className="agent-settings-page">
        <SiteHeader />
        <div className="agent-settings-loading">
          <Loader2 size={24} className="agent-settings-spinner" />
          <span>Loading configuration...</span>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="agent-settings-page">
      <SiteHeader actions={headerActions} />

      <div className="agent-settings-body">
        {/* Page title */}
        <div className="agent-settings-page-title-row">
          <h1 className="agent-settings-page-title">Agent Settings</h1>
        </div>

        {/* Status message */}
        {status && (
          <div className={`agent-settings-status agent-settings-status-${status.type}`}>
            {status.text}
          </div>
        )}

        {/* Provider Selection */}
        <div className="agent-settings-provider-section">
          <div className="agent-settings-provider-header">
            <h2 className="agent-settings-section-title">AI Provider</h2>
            {providerConfig?.source === 'env' && !isProviderOverridden && (
              <span className="agent-settings-provider-badge agent-settings-provider-badge-env">
                from .env
              </span>
            )}
            {isProviderOverridden && (
              <span className="agent-settings-provider-badge agent-settings-provider-badge-override">
                override active
              </span>
            )}
          </div>
          <div className="agent-settings-provider-options">
            <button
              className={`agent-settings-provider-option ${selectedProvider === 'openrouter' ? 'agent-settings-provider-option-active' : ''}`}
              onClick={() => setSelectedProvider('openrouter')}
            >
              <span className="agent-settings-provider-name">OpenRouter</span>
              <span className="agent-settings-provider-desc">
                Route requests to any model via OpenRouter
              </span>
              {providerConfig?.envProvider === 'openrouter' && (
                <span className="agent-settings-provider-env-label">.env default</span>
              )}
            </button>
            <button
              className={`agent-settings-provider-option ${selectedProvider === 'modal' ? 'agent-settings-provider-option-active' : ''}`}
              onClick={() => setSelectedProvider('modal')}
            >
              <span className="agent-settings-provider-name">Modal</span>
              <span className="agent-settings-provider-desc">
                Run on Modal serverless infrastructure
              </span>
              {providerConfig?.envProvider === 'modal' && (
                <span className="agent-settings-provider-env-label">.env default</span>
              )}
            </button>
          </div>
          {isProviderOverridden && (
            <button className="agent-settings-provider-reset" onClick={handleResetProvider}>
              Reset to .env default ({providerConfig?.envProvider})
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="agent-settings-tabs-wrapper">
          {selectedProvider === 'modal' && (
            <p className="agent-settings-modal-notice">
              Model routing is not used in Modal mode. Switch to OpenRouter to configure per-task
              models.
            </p>
          )}
          <div className="agent-settings-tabs">
            {TASK_TYPES.map(({ type, label }) => (
              <button
                key={type}
                className={`agent-settings-tab ${activeTab === type ? 'agent-settings-tab-active' : ''}`}
                onClick={() => setActiveTab(type)}
                disabled={selectedProvider === 'modal'}
              >
                {label}
                <span className="agent-settings-tab-count">
                  {config.tasks[type]?.models.length ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Model list */}
        <div
          className={`agent-settings-content ${selectedProvider === 'modal' ? 'agent-settings-content-disabled' : ''}`}
        >
          <div className="agent-settings-model-list">
            {activeModels.length === 0 ? (
              <div className="agent-settings-empty">
                No models configured for this task. Add one below.
              </div>
            ) : (
              activeModels.map((model, index) => (
                <div
                  key={model.id}
                  className={`agent-settings-model-row ${!model.active ? 'agent-settings-model-row-inactive' : ''}`}
                >
                  <label className="agent-settings-model-checkbox">
                    <input
                      type="checkbox"
                      checked={model.active}
                      onChange={() => handleToggleActive(index)}
                    />
                  </label>
                  <span className="agent-settings-model-priority">{index + 1}</span>
                  <span className="agent-settings-model-id">{model.id}</span>
                  <div className="agent-settings-model-actions">
                    <button
                      className="agent-settings-icon-btn"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      aria-label="Move up"
                      title="Move up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="agent-settings-icon-btn"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === activeModels.length - 1}
                      aria-label="Move down"
                      title="Move down"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="agent-settings-icon-btn agent-settings-icon-btn-danger"
                      onClick={() => handleRemove(index)}
                      aria-label="Remove model"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add model */}
          <div className="agent-settings-add-model">
            <input
              type="text"
              className="agent-settings-add-model-input"
              placeholder="OpenRouter model ID (e.g. openai/gpt-4o)"
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddModel();
                }
              }}
              disabled={selectedProvider === 'modal'}
            />
            <button
              className="agent-settings-add-model-btn"
              onClick={handleAddModel}
              disabled={!newModelId.trim() || selectedProvider === 'modal'}
            >
              <Plus size={16} />
              <span>Add Model</span>
            </button>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

export default AgentSettingsPage;
