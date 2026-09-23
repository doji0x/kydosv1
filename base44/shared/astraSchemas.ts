// Responses strict mode requires EVERY property, with nullable optional values.
export function strictSchema(schema) {
  if (schema.type === 'object') {
    const originallyRequired = new Set(schema.required || []);
    const properties = Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) => {
      const child = strictSchema(value);
      return [key, originallyRequired.has(key) ? child : { anyOf: [child, { type: 'null' }] }];
    }));
    return { ...schema, properties, required: Object.keys(properties), additionalProperties: false };
  }
  if (schema.type === 'array') return { ...schema, items: strictSchema(schema.items) };
  return schema;
}
export function strictTool(tool) {
  return { ...tool, function: { ...tool.function, strict: true, parameters: strictSchema(tool.function.parameters) } };
}