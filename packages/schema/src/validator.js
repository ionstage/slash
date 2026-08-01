/**
 * Minimal JSON Schema validator covering the subset of keywords used by the
 * Slash schemas. Dependency-free so it can run in the editor, the runtime
 * (dev mode) and Node scripts alike.
 *
 * Supported keywords: type, const, enum, pattern, properties, required,
 * additionalProperties (boolean), patternProperties, items, minItems,
 * maxItems, minimum, maximum, exclusiveMinimum, oneOf, $ref (#/$defs/... only).
 */

/**
 * @typedef {{ path: string, message: string }} ValidationError
 */

/**
 * Validate `data` against `schema`.
 * @param {object} schema Root schema (also used to resolve #/$defs refs).
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: ValidationError[] }}
 */
export function validate(schema, data) {
  /** @type {ValidationError[]} */
  const errors = [];
  validateNode(schema, data, '', schema, errors);
  return { valid: errors.length === 0, errors };
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part];
    if (node === undefined) throw new Error(`Unresolvable $ref: ${ref}`);
  }
  return node;
}

/**
 * @param {object} schema
 * @param {unknown} data
 * @param {string} path JSON-pointer-ish path for error messages
 * @param {object} root
 * @param {ValidationError[]} errors
 */
function validateNode(schema, data, path, root, errors) {
  if (schema.$ref) {
    validateNode(resolveRef(schema.$ref, root), data, path, root, errors);
    return;
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter((sub) => isValid(sub, data, root));
    if (matches.length !== 1) {
      errors.push({
        path,
        message: `expected exactly one matching variant, got ${matches.length}`,
      });
    }
    return;
  }

  if (schema.const !== undefined && data !== schema.const) {
    errors.push({ path, message: `expected constant ${JSON.stringify(schema.const)}` });
    return;
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, message: `expected one of ${JSON.stringify(schema.enum)}` });
    return;
  }

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(data);
    const ok = allowed.some((t) => t === actual || (t === 'integer' && Number.isInteger(data)));
    if (!ok) {
      errors.push({ path, message: `expected ${allowed.join(' or ')}, got ${actual}` });
      return;
    }
  }

  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum)
      errors.push({ path, message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && data > schema.maximum)
      errors.push({ path, message: `must be <= ${schema.maximum}` });
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum)
      errors.push({ path, message: `must be > ${schema.exclusiveMinimum}` });
  }

  if (typeof data === 'string' && schema.pattern) {
    if (!new RegExp(schema.pattern).test(data))
      errors.push({ path, message: `does not match pattern ${schema.pattern}` });
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems)
      errors.push({ path, message: `needs at least ${schema.minItems} items` });
    if (schema.maxItems !== undefined && data.length > schema.maxItems)
      errors.push({ path, message: `allows at most ${schema.maxItems} items` });
    if (schema.items) {
      data.forEach((item, i) => validateNode(schema.items, item, `${path}/${i}`, root, errors));
    }
  }

  if (typeOf(data) === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in data)) errors.push({ path, message: `missing required property "${key}"` });
    }
    const props = schema.properties ?? {};
    const patterns = Object.entries(schema.patternProperties ?? {});
    for (const [key, value] of Object.entries(data)) {
      const childPath = `${path}/${key}`;
      if (key in props) {
        validateNode(props[key], value, childPath, root, errors);
      } else {
        const pattern = patterns.find(([re]) => new RegExp(re).test(key));
        if (pattern) {
          validateNode(pattern[1], value, childPath, root, errors);
        } else if (schema.additionalProperties === false) {
          errors.push({ path: childPath, message: 'unknown property' });
        }
      }
    }
  }
}

function isValid(schema, data, root) {
  /** @type {ValidationError[]} */
  const errors = [];
  validateNode(schema, data, '', root, errors);
  return errors.length === 0;
}
