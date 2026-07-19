/**
 * Repair common malformed JSON Schema shapes that some MCP servers emit, so strict providers don't
 * reject the *entire* tool-enabled request with a 400 (which the router would otherwise have to
 * treat as a failure and fail over pointlessly — every provider that validates schemas rejects the
 * same bad tool).
 *
 * The concrete bug that motivated this: OpenAlex's `autocomplete` tool ships a property-level
 * `"required": true` (a JSON Schema *draft-4* idiom) inside a property definition —
 *
 *   "search": { "type": "string", "required": true }
 *
 * In draft 2020-12 (what current provider function-calling validates against) `required` must be an
 * **array of property names** at the object level, so a boolean `required` fails compilation:
 * `'/properties/search/required' does not validate`. We recursively drop any `required` whose value
 * isn't an array — a valid object-level `"required": ["search"]` is an array and is left untouched.
 */
export function sanitizeToolSchema<T>(schema: T): T {
  return sanitizeNode(schema) as T;
}

function sanitizeNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeNode);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      // A `required` that isn't an array is a draft-4 boolean leak — invalid under draft 2020-12.
      if (key === "required" && !Array.isArray(value)) continue;
      out[key] = sanitizeNode(value);
    }
    return out;
  }
  return node;
}
