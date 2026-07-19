import { describe, it, expect } from "vitest";
import { sanitizeToolSchema } from "./toolSchema";

describe("sanitizeToolSchema", () => {
  it("drops a property-level boolean `required` (draft-4 leak) but keeps object-level array `required`", () => {
    // The exact OpenAlex `autocomplete` shape that made strict providers 400 the whole request.
    const input = {
      type: "object",
      properties: {
        search: { type: "string", description: "q", required: true },
        per_page: { type: "number" },
      },
      required: ["search"],
    };
    const out = sanitizeToolSchema(input);
    expect(out).toEqual({
      type: "object",
      properties: {
        search: { type: "string", description: "q" },
        per_page: { type: "number" },
      },
      required: ["search"],
    });
  });

  it("recurses into nested objects and arrays", () => {
    const input = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: { a: { type: "string", required: true } },
        },
        list: { type: "array", items: { type: "object", properties: { b: { type: "string", required: false } } } },
      },
    };
    expect(sanitizeToolSchema(input)).toEqual({
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: { a: { type: "string" } },
        },
        list: { type: "array", items: { type: "object", properties: { b: { type: "string" } } } },
      },
    });
  });

  it("leaves already-valid schemas unchanged", () => {
    const input = {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    };
    expect(sanitizeToolSchema(input)).toEqual(input);
  });

  it("is a no-op on non-object inputs", () => {
    expect(sanitizeToolSchema(null)).toBe(null);
    expect(sanitizeToolSchema("x")).toBe("x");
  });
});
