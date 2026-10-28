/** Matches `{{ field_name }}`, capturing the field name. Shared by
 * template rendering and preflight merge-field checking so both agree on
 * what counts as a placeholder. */
export const MERGE_FIELD_PATTERN = /{{\s*([\w.]+)\s*}}/g;
