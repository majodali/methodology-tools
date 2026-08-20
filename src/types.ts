// Vocabulary types (spec: methodology docs/vocabulary.md — Article 3:
// where this code and the documents disagree, the documents are right).

export const C_TIERS = ['C0', 'C1', 'C2', 'C3'] as const;
export const S_LEVELS = ['S0', 'S1', 'S2'] as const;

// Field value sets are amendment-controlled (vocabulary: Classification).
export const TYPES = [
  'web-app',
  'backend-service',
  'component/library',
  'language/tool platform',
  'exploration',
  'ops',
  'docs-corpus',
  'methodology-corpus',
] as const;
export const TARGETS = [
  'none/local',
  'static site',
  'serverless-aws',
  'package registry',
  'home infrastructure',
] as const;

export type ProjectType = (typeof TYPES)[number];
export type Target = (typeof TARGETS)[number];

// Derived conditions, in vocabulary precedence order, most specific
// first (`deployed` entails `deployable`).
export const DERIVED = ['deployed', 'deployable'] as const;
export type Derived = (typeof DERIVED)[number];

/** Inclusive numeric range over an ordered scale (C-tier or S-level). */
export interface Range {
  min: number;
  max: number;
}

/**
 * Applicability conditions of one rule (Article 4 stage 1), after tag
 * parsing and defaulting. Absent field = unconstrained (full range).
 */
export interface Conditions {
  c: Range; // default [C1+] per Article 5
  s: Range; // default all S-levels
  types: ProjectType[] | null; // null = all
  targets: Target[] | null; // null = all
  derived: Derived[]; // required-true derived conditions
}

export interface Rule {
  id: string;
  title: string;
  file: string;
  line: number;
  appliesRaw: string;
  applies: Conditions;
  keywords: string[];
}

export interface DeviationEntry {
  text: string;
  /** Rule ID the deviation cites, e.g. "W-006"; null = missing citation (a finding). */
  ruleRef: string | null;
}

export interface Classification {
  /** True when no docs/classification.md exists (C0 by definition, Article 4). */
  implicit: boolean;
  ctier: number; // 0..3
  slevel: number; // 0..2
  type: ProjectType;
  target: Target;
  /** Pinned methodology version; null = latest (legal at C0 only). */
  pinned: string | null;
  /** Workflow declaration format is methodology open item 4; until it is
   *  defined we can only distinguish "none declared" from "declared". */
  workflow: 'none' | 'declared';
  deviations: DeviationEntry[];
  customDefinitions: string[];
  /** Form findings raised while parsing the declaration. */
  findings: string[];
}

/** The Article 4 decidability basis, resolved for one project. */
export interface ProjectState {
  ctier: number;
  slevel: number;
  type: ProjectType;
  target: Target;
  deployable: boolean;
  deployed: boolean;
}

export function deriveState(c: Classification): ProjectState {
  const deployable = c.target !== 'none/local';
  // `deployed` needs a declared Workflow plus a Backlog entry at a live
  // stage. The Workflow declaration format is undefined (methodology
  // open item 4), so with any declaration we still cannot read stages:
  // deployed stays false and classification parsing raises a finding.
  const deployed = false;
  return {
    ctier: c.ctier,
    slevel: c.slevel,
    type: c.type,
    target: c.target,
    deployable,
    deployed,
  };
}
