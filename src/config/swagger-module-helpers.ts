/**
 * Reusable OpenAPI builders for Phase 2 investment/fund swagger modules.
 */

export function pathParam(name: string, example?: string) {
  return {
    name,
    in: "path" as const,
    required: true,
    schema: { type: "string", ...(example ? { example } : {}) },
  };
}

export function queryParam(
  name: string,
  schema: Record<string, unknown>,
  example?: string | number | boolean
) {
  return {
    name,
    in: "query" as const,
    schema: {
      ...schema,
      ...(example !== undefined ? { example } : {}),
    },
  };
}

type JsonExample = {
  summary?: string;
  description?: string;
  value: unknown;
};

export function jsonRequestBody(opts: {
  schema: Record<string, unknown>;
  examples?: Record<string, JsonExample>;
  required?: boolean;
}) {
  const jsonContent: Record<string, unknown> = { schema: opts.schema };
  if (opts.examples) {
    jsonContent.examples = opts.examples;
    const first = Object.values(opts.examples)[0];
    if (first?.value != null) jsonContent.example = first.value;
  }
  return {
    required: opts.required !== false,
    content: { "application/json": jsonContent },
  };
}

export function multipartRequestBody(opts: {
  schema: Record<string, unknown>;
  examples?: Record<string, JsonExample>;
  required?: boolean;
}) {
  const formContent: Record<string, unknown> = { schema: opts.schema };
  if (opts.examples) {
    formContent.examples = opts.examples;
    const first = Object.values(opts.examples)[0];
    if (first?.value != null) formContent.example = first.value;
  }
  return {
    required: opts.required !== false,
    content: { "multipart/form-data": formContent },
  };
}

export function mergeResponses(
  base: Record<string, unknown>,
  extra: Record<string, unknown>
): Record<string, unknown> {
  return { ...base, ...extra };
}
