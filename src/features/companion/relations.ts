// Relation picker values: companion_links.relation check constraint.
export const RELATIONS = [
  'husband',
  'mother',
  'father',
  'mother_in_law',
  'father_in_law',
  'sibling',
  'friend',
  'other',
] as const;

export type Relation = (typeof RELATIONS)[number];
