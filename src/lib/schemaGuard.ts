// Anthropic's structured-output `json_schema` accepts only a subset of JSON Schema. Numeric range
// constraints are rejected at request time with a 400 ("For 'integer' type, properties maximum,
// minimum are not supported"). That failed silently behind a generic error until a real run hit it,
// so this guard lets a unit test catch the whole class at build time instead of in front of the user.

// Confirmed-rejected: minimum, maximum. The rest are the same numeric-constraint family and are
// treated as unsupported too (none are used today, so this only prevents future regressions).
export const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
])

/**
 * Walk a JSON schema and return the path of every unsupported keyword used as a constraint.
 * Keys directly inside a `properties` map are field NAMES, not keywords, so a field legitimately
 * named e.g. "minimum" is not flagged. Returns [] for a clean schema.
 */
export function findUnsupportedKeywords(schema: unknown): string[] {
  const out: string[] = []
  walk(schema, '$', false, out)
  return out
}

function walk(node: unknown, path: string, underProperties: boolean, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`, false, out))
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      // Under `properties`, keys are field names — don't treat them as schema keywords.
      if (!underProperties && UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) {
        out.push(`${path}.${key}`)
      }
      walk(val, `${path}.${key}`, key === 'properties', out)
    }
  }
}
