function invalid(code) {
  throw new Error(code);
}

function decodeUtf8(input, code) {
  try {
    if (typeof input === 'string') return input;
    if (!(input instanceof Uint8Array)) invalid(code);
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    invalid(code);
  }
}

/**
 * Parse JSON only after a lexical pass proves that no object contains
 * duplicate decoded member names. Standard JSON.parse is last-key-wins,
 * which is not acceptable for reusable review authority evidence.
 */
export function parseJsonRejectDuplicateKeys(bytes, code = 'JSON_INVALID') {
  const text = decodeUtf8(bytes, code);
  let index = 0;
  const length = text.length;
  const skipWhitespace = () => {
    while (index < length && /[\t\n\r ]/.test(text[index])) index += 1;
  };
  function parseString() {
    const start = index;
    if (text[index] !== '"') invalid(code);
    index += 1;
    while (index < length) {
      const char = text[index++];
      if (char === '"') {
        try { return JSON.parse(text.slice(start, index)); }
        catch { invalid(code); }
      }
      if (char.charCodeAt(0) < 0x20) invalid(code);
      if (char !== '\\') continue;
      if (index >= length) invalid(code);
      const escaped = text[index++];
      if (escaped === 'u') {
        const hex = text.slice(index, index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) invalid(code);
        index += 4;
      } else if (!'"\\/bfnrt'.includes(escaped)) {
        invalid(code);
      }
    }
    invalid(code);
  }

  function parseNumber() {
    const match = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) invalid(code);
    index += match[0].length;
  }
  function parseArray(depth) {
    index += 1;
    skipWhitespace();
    if (text[index] === ']') { index += 1; return; }
    while (index < length) {
      parseValue(depth + 1);
      skipWhitespace();
      if (text[index] === ']') { index += 1; return; }
      if (text[index] !== ',') invalid(code);
      index += 1;
      skipWhitespace();
    }
    invalid(code);
  }

  function parseObject(depth) {
    index += 1;
    const keys = new Set();
    skipWhitespace();
    if (text[index] === '}') { index += 1; return; }
    while (index < length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) invalid(code);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') invalid(code);
      index += 1;
      parseValue(depth + 1);
      skipWhitespace();
      if (text[index] === '}') { index += 1; return; }
      if (text[index] !== ',') invalid(code);
      index += 1;
      skipWhitespace();
    }
    invalid(code);
  }

  function parseValue(depth = 0) {
    if (depth > 64) invalid(code);
    skipWhitespace();
    const char = text[index];
    if (char === '{') return parseObject(depth);
    if (char === '[') return parseArray(depth);
    if (char === '"') { parseString(); return; }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    parseNumber();
  }

  parseValue();
  skipWhitespace();
  if (index !== length) invalid(code);
  try { return JSON.parse(text); }
  catch { invalid(code); }
}
