// A tiny, dependency-free query language for activity eligibility.
//
// Grammar (precedence low -> high): or < and < not < comparison < primary
//   expr       := or
//   or         := and ('or' and)*
//   and        := not ('and' not)*
//   not        := 'not' not | comparison
//   comparison := '(' or ')' | operand cmpOp operand
//   operand    := number | boolean | string | property
//   cmpOp      := eq | neq | gt | gte | lt | lte
//
// Evaluation is fail-closed: any comparison referencing a property that is
// absent/unknown in the context evaluates to false (see evaluate). Conditions
// must therefore be authored as positive requirements — `raining eq false`
// excludes when rain is unknown, whereas `not (raining eq true)` would include.

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false']);
const CMP_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);

// ---- lexer ---------------------------------------------------------------

export function tokenize(input) {
  const tokens = [];
  let i = 0;
  const isIdentStart = (c) => /[A-Za-z_]/.test(c);
  const isIdentPart = (c) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c) => c >= '0' && c <= '9';

  while (i < input.length) {
    const c = input[i];

    if (/\s/.test(c)) { i += 1; continue; }

    if (c === '(' || c === ')') { tokens.push({ type: c }); i += 1; continue; }

    // number literal (with optional leading '-'; there is no subtraction op)
    if (isDigit(c) || (c === '-' && isDigit(input[i + 1]))) {
      let j = i + 1;
      while (j < input.length && (isDigit(input[j]) || input[j] === '.')) j += 1;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }

    // double-quoted string literal with \" and \\ escapes
    if (c === '"') {
      let j = i + 1;
      let str = '';
      while (j < input.length && input[j] !== '"') {
        if (input[j] === '\\' && j + 1 < input.length) { str += input[j + 1]; j += 2; }
        else { str += input[j]; j += 1; }
      }
      if (input[j] !== '"') throw new Error('Unterminated string literal');
      tokens.push({ type: 'str', value: str });
      i = j + 1;
      continue;
    }

    // identifier / keyword / operator word
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < input.length && isIdentPart(input[j])) j += 1;
      const word = input.slice(i, j);
      if (CMP_OPS.has(word)) tokens.push({ type: 'cmp', op: word });
      else if (KEYWORDS.has(word)) tokens.push({ type: word });
      else tokens.push({ type: 'prop', name: word });
      i = j;
      continue;
    }

    throw new Error(`Unexpected character '${c}' at position ${i}`);
  }

  return tokens;
}

// ---- parser --------------------------------------------------------------

export function parse(tokens, allowedProps = null) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const t = next();
    if (!t || t.type !== type) throw new Error(`Expected '${type}' but got ${t ? t.type : 'end of input'}`);
    return t;
  };

  function parseExpr() { return parseOr(); }

  function parseOr() {
    let node = parseAnd();
    while (peek() && peek().type === 'or') { next(); node = { type: 'or', left: node, right: parseAnd() }; }
    return node;
  }

  function parseAnd() {
    let node = parseNot();
    while (peek() && peek().type === 'and') { next(); node = { type: 'and', left: node, right: parseNot() }; }
    return node;
  }

  function parseNot() {
    if (peek() && peek().type === 'not') { next(); return { type: 'not', expr: parseNot() }; }
    return parseComparison();
  }

  function parseComparison() {
    if (peek() && peek().type === '(') {
      next();
      const node = parseExpr();
      expect(')');
      return node;
    }
    const left = parseOperand();
    const opTok = next();
    if (!opTok || opTok.type !== 'cmp') {
      throw new Error(`Expected a comparison operator but got ${opTok ? opTok.type : 'end of input'}`);
    }
    const right = parseOperand();
    return { type: 'cmp', op: opTok.op, left, right };
  }

  function parseOperand() {
    const t = next();
    if (!t) throw new Error('Unexpected end of input, expected a value or property');
    if (t.type === 'num') return { type: 'num', value: t.value };
    if (t.type === 'str') return { type: 'str', value: t.value };
    if (t.type === 'true') return { type: 'bool', value: true };
    if (t.type === 'false') return { type: 'bool', value: false };
    if (t.type === 'prop') {
      if (allowedProps && !allowedProps.has(t.name)) throw new Error(`Unknown property: ${t.name}`);
      return { type: 'prop', name: t.name };
    }
    throw new Error(`Unexpected token '${t.type}', expected a value or property`);
  }

  if (tokens.length === 0) throw new Error('Empty query');
  const ast = parseExpr();
  if (pos < tokens.length) throw new Error(`Unexpected trailing token '${peek().type}'`);
  return ast;
}

// ---- evaluator -----------------------------------------------------------

function resolve(operand, context) {
  if (operand.type === 'prop') {
    // Own properties only: plain `context[name]` would reach Object.prototype,
    // so `constructor neq 0` would resolve to a function and evaluate true —
    // failing OPEN on a property no provider ever declared. A missing context
    // resolves to unknown for the same reason.
    if (!context || !Object.hasOwn(context, operand.name)) return undefined;
    return context[operand.name];
  }
  return operand.value; // literals are never unknown
}

export function evaluate(ast, context) {
  switch (ast.type) {
    case 'or': return evaluate(ast.left, context) || evaluate(ast.right, context);
    case 'and': return evaluate(ast.left, context) && evaluate(ast.right, context);
    case 'not': return !evaluate(ast.expr, context);
    case 'cmp': {
      const l = resolve(ast.left, context);
      const r = resolve(ast.right, context);
      // Fail-closed: unknown operand -> comparison is false.
      if (l === undefined || l === null || r === undefined || r === null) return false;
      switch (ast.op) {
        case 'eq': return l === r;
        case 'neq': return l !== r;
        case 'gt': case 'gte': case 'lt': case 'lte': {
          if (typeof l !== 'number' || typeof r !== 'number') return false;
          if (ast.op === 'gt') return l > r;
          if (ast.op === 'gte') return l >= r;
          if (ast.op === 'lt') return l < r;
          return l <= r;
        }
        default: return false;
      }
    }
    default: throw new Error(`Unknown AST node: ${ast.type}`);
  }
}

// ---- convenience ---------------------------------------------------------

// Compile a query string into a reusable (context) => boolean predicate.
export function compile(query, allowedProps = null) {
  const ast = parse(tokenize(query), allowedProps);
  return (context) => evaluate(ast, context);
}
