// Article 4, implemented literally.
// Stage 1: a rule is in play iff the project's declared state satisfies
// its conditions. Stage 2: precedence among conflicting in-play rules —
// deviation, then custom definition (both read from the Classification
// by the caller), then rule specificity, else corpus defect.

import {
  Conditions,
  DERIVED,
  Derived,
  ProjectState,
  Range,
  Rule,
  TARGETS,
  TYPES,
} from './types.js';

// ---------- Stage 1 — applicability ----------

export function inPlay(rule: Rule, p: ProjectState): boolean {
  const a = rule.applies;
  if (p.ctier < a.c.min || p.ctier > a.c.max) return false;
  if (p.slevel < a.s.min || p.slevel > a.s.max) return false;
  if (a.types !== null && !a.types.includes(p.type)) return false;
  if (a.targets !== null && !a.targets.includes(p.target)) return false;
  for (const d of a.derived) {
    if (d === 'deployable' && !p.deployable) return false;
    if (d === 'deployed' && !p.deployed) return false;
  }
  return true;
}

// ---------- Stage 2.3 — specificity over effective constraining conditions ----------

// Weight order per Article 4 stage 2.3(c): S-level, then C-tier, then
// type, then target, then derived conditions (vocabulary ranks among
// derived: `deployed` before `deployable`).
type Field = 's' | 'c' | 'type' | 'target' | 'derived';
const FIELD_WEIGHT: Field[] = ['s', 'c', 'type', 'target', 'derived'];

interface Constraint {
  field: Field;
  /** Number of field values the condition still admits (smaller = narrower). */
  breadth: number;
}

/**
 * Normalize to effective constraining conditions — stated or defaulted:
 * a condition constrains iff it excludes at least one possible value of
 * its field; vacuous tags are dropped, and restating a default is never
 * a specificity advantage (notation never beats semantics).
 */
export function constraints(a: Conditions): Constraint[] {
  const out: Constraint[] = [];
  const rangeSize = (r: Range) => r.max - r.min + 1;
  if (rangeSize(a.c) < 4) out.push({ field: 'c', breadth: rangeSize(a.c) });
  if (rangeSize(a.s) < 3) out.push({ field: 's', breadth: rangeSize(a.s) });
  if (a.types !== null && a.types.length < TYPES.length)
    out.push({ field: 'type', breadth: a.types.length });
  if (a.targets !== null && a.targets.length < TARGETS.length)
    out.push({ field: 'target', breadth: a.targets.length });
  if (a.derived.length > 0) {
    // `deployed` entails `deployable`: the effective derived condition is
    // the most specific one; requiring both is not two constraints.
    const strongest = DERIVED.find((d) => a.derived.includes(d)) as Derived;
    // Breadth ranks by the vocabulary's derived-condition order (most
    // specific first): deployed=1, deployable=2.
    out.push({ field: 'derived', breadth: DERIVED.indexOf(strongest) + 1 });
  }
  return out;
}

export type PrecedenceResult =
  | { outcome: 'first' | 'second'; reason: string }
  | { outcome: 'corpus-defect'; reason: string };

/**
 * Article 4 stage 2.3, comparing two in-play conflicting rules.
 * (Stage 2.1 deviations and 2.2 custom definitions precede this and are
 * resolved by the caller from the Classification.)
 */
export function moreSpecific(a: Rule, b: Rule): PrecedenceResult {
  const ca = constraints(a.applies);
  const cb = constraints(b.applies);

  // (a) more of the project's declared fields and referenced designations
  // named by satisfied (in-play ⇒ satisfied) constraining conditions.
  if (ca.length !== cb.length) {
    const [w, l] = ca.length > cb.length ? (['first', a] as const) : (['second', b] as const);
    return {
      outcome: w,
      reason: `${l === a ? b.id : a.id} constrains more fields (stage 2.3(a))`,
    };
  }

  // (b) narrower range on shared constrained fields; when each is
  // narrower on a different shared field, the higher-weighted field
  // decides — implemented by walking shared fields in weight order.
  for (const field of FIELD_WEIGHT) {
    const fa = ca.find((x) => x.field === field);
    const fb = cb.find((x) => x.field === field);
    if (!fa || !fb) continue;
    if (fa.breadth !== fb.breadth) {
      return {
        outcome: fa.breadth < fb.breadth ? 'first' : 'second',
        reason: `narrower ${field} condition wins (stage 2.3(b), weight order)`,
      };
    }
  }

  // (c) distinguishing conditions ranked by the weight order.
  const onlyA = ca.filter((x) => !cb.some((y) => y.field === x.field));
  const onlyB = cb.filter((x) => !ca.some((y) => y.field === x.field));
  const best = (xs: Constraint[]) =>
    xs.length === 0 ? Infinity : Math.min(...xs.map((x) => FIELD_WEIGHT.indexOf(x.field)));
  const ra = best(onlyA);
  const rb = best(onlyB);
  if (ra !== rb) {
    return {
      outcome: ra < rb ? 'first' : 'second',
      reason: 'higher-weighted distinguishing condition wins (stage 2.3(c))',
    };
  }

  return {
    outcome: 'corpus-defect',
    reason:
      `${a.id} vs ${b.id}: conflict survives stage 2.3 — record as a methodology issue; ` +
      'the human owner’s ruling stands until amended (Article 4 stage 2.4)',
  };
}
