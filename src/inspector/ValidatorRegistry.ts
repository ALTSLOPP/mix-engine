import { PropertyTree } from './PropertyTree';
import { SafeResolver } from './SafeResolver';
import type { ValidationIssue, ValidationReport, ValidationSeverity } from './types';

export type ValidatorFunction = (
  target: any,
  context: { path?: string; tree?: PropertyTree },
) => ValidationIssue[] | ValidationIssue | string | null;

export interface RegisteredValidator {
  id: string;
  name: string;
  severity: ValidationSeverity;
  validate: ValidatorFunction;
  autoFix?: (target: any) => void;
}

/**
 * ValidatorRegistry — Live and global validation system for assets, entities, and schemas.
 */
export class ValidatorRegistry {
  private static validators: RegisteredValidator[] = [];

  static register(validator: RegisteredValidator): void {
    this.validators.push(validator);
  }

  static validateTarget(
    target: any,
    tree?: PropertyTree,
    options: { dryRun?: boolean; autoFix?: boolean } = {},
  ): ValidationReport {
    const report: ValidationReport = {
      timestamp: performance.now(),
      valid: true,
      totalIssues: 0,
      errors: [],
      warnings: [],
      infos: [],
    };

    if (!target) return report;

    const propTree = tree ?? new PropertyTree(target);
    const nodes = propTree.getAllNodes();

    // 1. Evaluate property-level validation metadata
    for (const node of nodes) {
      if (!node.path) continue;
      const val = node.value;
      const meta = node.metadata;

      // Range check
      if (meta.range && typeof val === 'number') {
        const [min, max] = meta.range;
        if (val < min || val > max) {
          const issue: ValidationIssue = {
            severity: 'error',
            validatorId: 'range_check',
            message: `Property '${node.path}' (${val}) out of range [${min}, ${max}]`,
            path: node.path,
            suggestedAction: `Clamp value between ${min} and ${max}`,
            autoFixAvailable: true,
            autoFix: () => {
              node.value = Math.max(min, Math.min(max, val));
            },
          };
          report.errors.push(issue);
          if (options.autoFix && !options.dryRun && issue.autoFix) {
            issue.autoFix();
          }
        }
      }

      // Custom expression validation via SafeResolver
      if (typeof meta.validate === 'string') {
        const context = {
          $value: val,
          [node.name]: val,
          ...((typeof target === 'object' ? target : {}) as Record<string, unknown>),
        };
        const valid = SafeResolver.evaluateBoolean(meta.validate, context, true);
        if (!valid) {
          const issue: ValidationIssue = {
            severity: 'error',
            validatorId: 'schema_expression',
            message: `Validation failed for '${node.path}': expression '${meta.validate}' evaluated to false`,
            path: node.path,
          };
          report.errors.push(issue);
        }
      } else if (typeof meta.validate === 'function') {
        const res = meta.validate(val, target);
        if (typeof res === 'string') {
          report.errors.push({
            severity: 'error',
            validatorId: 'custom_function',
            message: res,
            path: node.path,
          });
        } else if (res === false) {
          report.errors.push({
            severity: 'error',
            validatorId: 'custom_function',
            message: `Validation check failed for '${node.path}'`,
            path: node.path,
          });
        }
      }
    }

    // 2. Evaluate registered global validators
    for (const v of this.validators) {
      try {
        const issues = v.validate(target, { tree: propTree });
        if (issues) {
          const issueList = Array.isArray(issues)
            ? issues
            : typeof issues === 'string'
              ? [{ severity: v.severity, validatorId: v.id, message: issues, path: '' }]
              : [issues];

          for (const issue of issueList) {
            if (issue.severity === 'error') report.errors.push(issue);
            else if (issue.severity === 'warning') report.warnings.push(issue);
            else report.infos.push(issue);

            if (options.autoFix && !options.dryRun && v.autoFix) {
              v.autoFix(target);
            }
          }
        }
      } catch (e) {
        console.error(`[ValidatorRegistry] Error in validator '${v.id}':`, e);
      }
    }

    report.totalIssues = report.errors.length + report.warnings.length + report.infos.length;
    report.valid = report.errors.length === 0;

    return report;
  }
}
