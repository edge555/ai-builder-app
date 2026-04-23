export type DeliveryStage = 'acceptance' | 'runtime_smoke' | 'repair' | 'approved';

export type RepairLevelReached = 'none' | 'deterministic' | 'targeted-ai' | 'broad-ai' | 'rollback';

export interface QualityIssue {
  source: 'acceptance' | 'runtime_smoke' | 'repair';
  type: string;
  message: string;
  file?: string;
}

export interface QualityReport {
  deliveryStage: DeliveryStage;
  issues: QualityIssue[];
  repairAttempts: number;
  repairLevelReached: RepairLevelReached;
}
