/**
 * Throw the caller's code as the error message so existing callers keep
 * matching on `error.message === code`. The human-readable `detail` names
 * the cause and, where known, the 1-based line and column.
 */
function invalid(code, detail) {
  const error = new Error(code);
  error.detail = detail;
  throw error;
}

function decodeUtf8(input, code) {
  if (typeof input === 'string') return input;
  if (!(input instanceof Uint8Array)) invalid(code, 'Input is not JSON text');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    invalid(code, 'Input is not valid UTF-8 text');
  }
}

const MAX_DEPTH = 64;

/**
 * Parse JSON only after a lexical pass proves that no object contains
 * duplicate decoded member names. Standard JSON.parse is last-key-wins,
 * which is not acceptable for reusable review authority evidence.
 */
export function parseJsonRejectDuplicateKeys(bytes, code = 'JSON_INVALID') {
  const text = decodeUtf8(bytes, code);
  let index = 0;
  const length = text.length;
  const position = at => {
    let line = 1, column = 1;
    for (let i = 0; i < at && i < length; i += 1) {
      if (text[i] === '\n') { line += 1; column = 1; } else column += 1;
    }
    return `line ${line}, column ${column}`;
  };
  const fail = (detail, at = index) => invalid(code, `${detail} at ${position(at)}`);
  const describe = char => {
    const point = char.codePointAt(0);
    return point < 0x20 || point > 0x7e ? `U+${point.toString(16).toUpperCase().padStart(4, '0')}` : JSON.stringify(char);
  };
  const unexpected = (at = index) => at >= length
    ? fail('Syntax error: unexpected end of input', at)
    : fail(`Syntax error: unexpected character ${describe(text[at])}`, at);
  const skipWhitespace = () => {
    while (index < length && /[\t\n\r ]/.test(text[index])) index += 1;
  };
  function parseString() {
    const start = index;
    if (text[index] !== '"') unexpected();
    index += 1;
    while (index < length) {
      const char = text[index++];
      if (char === '"') {
        try { return JSON.parse(text.slice(start, index)); }
        catch { fail('Syntax error: invalid string', start); }
      }
      if (char.charCodeAt(0) < 0x20) fail('Syntax error: unescaped control character in string', index - 1);
      if (char !== '\\') continue;
      if (index >= length) fail('Syntax error: unterminated string', start);
      const escaped = text[index++];
      if (escaped === 'u') {
        const hex = text.slice(index, index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Syntax error: invalid \\u escape', index - 2);
        index += 4;
      } else if (!'"\\/bfnrt'.includes(escaped)) {
        fail(`Syntax error: invalid escape \\${escaped}`, index - 2);
      }
    }
    fail('Syntax error: unterminated string', start);
  }

  function parseNumber() {
    const match = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) unexpected();
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
      if (text[index] !== ',') unexpected();
      index += 1;
      skipWhitespace();
      if (text[index] === ']') fail('Syntax error: trailing comma before "]"', index - 1);
    }
    unexpected();
  }

  function parseObject(depth) {
    index += 1;
    const keys = new Set();
    skipWhitespace();
    if (text[index] === '}') { index += 1; return; }
    while (index < length) {
      skipWhitespace();
      if (text[index] === '}') fail('Syntax error: trailing comma before "}"', index - 1);
      const keyStart = index;
      const key = parseString();
      if (keys.has(key)) fail(`Duplicate key ${JSON.stringify(key)}`, keyStart);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') unexpected();
      index += 1;
      parseValue(depth + 1);
      skipWhitespace();
      if (text[index] === '}') { index += 1; return; }
      if (text[index] !== ',') unexpected();
      index += 1;
      skipWhitespace();
    }
    unexpected();
  }

  function parseValue(depth = 0) {
    skipWhitespace();
    if (depth > MAX_DEPTH) fail(`Nesting deeper than ${MAX_DEPTH} levels`);
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

  skipWhitespace();
  if (index === length) invalid(code, length === 0 ? 'Empty input' : 'Empty input: only whitespace');
  parseValue();
  skipWhitespace();
  if (index !== length) fail('Syntax error: unexpected content after the JSON value');
  try { return JSON.parse(text); }
  catch { invalid(code, 'Syntax error'); }
}
