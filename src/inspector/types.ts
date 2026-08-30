export type PropertyType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'vector2'
  | 'vector3'
  | 'color'
  | 'enum'
  | 'asset'
  | 'entity'
  | 'array'
  | 'map'
  | 'set'
  | 'object'
  | 'polymorphic'
  | 'action'
  | 'custom';

export interface PropertyMetadata {
  type?: PropertyType;
  label?: string;
  tooltip?: string;
  description?: string;
  order?: number;
  group?: string;
  tab?: string;
  foldout?: string;
  showIf?: string;
  hideIf?: string;
  enableIf?: string;
  disableIf?: string;
  readOnly?: boolean;
  min?: number;
  max?: number;
  step?: number;
  range?: [number, number];
  unit?: string;
  suffix?: string;
  options?: Array<{ label: string; value: unknown }> | string[];
  assetType?: string;
  colorPicker?: boolean;
  polymorphicTypes?: Record<string, any>;
  validate?: string | ((val: unknown, context: any) => string | boolean | null);
  inline?: boolean;
  customDrawer?: string;
}

export interface ActionMetadata {
  id?: string;
  label?: string;
  tooltip?: string;
  description?: string;
  command?: string;
  group?: string;
  tab?: string;
  showIf?: string;
  enableIf?: string;
  riskLevel?: 'safe' | 'medium' | 'high';
  confirmMessage?: string;
  parameters?: Record<string, PropertyMetadata>;
  execute?: (target: any, params?: Record<string, unknown>) => unknown;
}

export interface GroupMetadata {
  type: 'tab' | 'foldout' | 'horizontal' | 'card' | 'box';
  label?: string;
  order?: number;
  defaultOpen?: boolean;
  showIf?: string;
  items?: string[];
}

export interface InspectorSchemaDef {
  title?: string;
  description?: string;
  icon?: string;
  groups?: Record<string, GroupMetadata>;
  properties: Record<string, PropertyMetadata>;
  actions?: Record<string, ActionMetadata>;
  inheritedFrom?: string;
  version?: number;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  validatorId: string;
  message: string;
  path: string; // e.g. "player.combat.stamina"
  entityId?: number;
  assetPath?: string;
  suggestedAction?: string;
  autoFixAvailable?: boolean;
  autoFix?: () => void;
}

export interface ValidationReport {
  timestamp: number;
  valid: boolean;
  totalIssues: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
}

export interface ResolverError {
  schemaPath?: string;
  propertyPath?: string;
  expression: string;
  expectedType?: string;
  actualType?: string;
  message: string;
}

export interface ResolverResult<T = unknown> {
  success: boolean;
  value?: T;
  error?: ResolverError;
}
