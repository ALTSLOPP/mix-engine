import type { ResolverError, ResolverResult } from './types';

type TokenType =
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'DOT'
  | 'NOT'
  | 'AND'
  | 'OR'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'PLUS'
  | 'MINUS'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'QUESTION'
  | 'COLON'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

class Tokenizer {
  private pos = 0;
  constructor(private input: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];

      if (/\s/.test(ch)) {
        this.pos++;
        continue;
      }

      const p = this.pos;

      if (ch === '.') {
        tokens.push({ type: 'DOT', value: '.', pos: p });
        this.pos++;
      } else if (ch === '(') {
        tokens.push({ type: 'LPAREN', value: '(', pos: p });
        this.pos++;
      } else if (ch === ')') {
        tokens.push({ type: 'RPAREN', value: ')', pos: p });
        this.pos++;
      } else if (ch === '?') {
        tokens.push({ type: 'QUESTION', value: '?', pos: p });
        this.pos++;
      } else if (ch === ':') {
        tokens.push({ type: 'COLON', value: ':', pos: p });
        this.pos++;
      } else if (ch === '+') {
        tokens.push({ type: 'PLUS', value: '+', pos: p });
        this.pos++;
      } else if (ch === '-') {
        tokens.push({ type: 'MINUS', value: '-', pos: p });
        this.pos++;
      } else if (ch === '*') {
        tokens.push({ type: 'MUL', value: '*', pos: p });
        this.pos++;
      } else if (ch === '/') {
        tokens.push({ type: 'DIV', value: '/', pos: p });
        this.pos++;
      } else if (ch === '%') {
        tokens.push({ type: 'MOD', value: '%', pos: p });
        this.pos++;
      } else if (ch === '!') {
        if (this.input[this.pos + 1] === '=') {
          if (this.input[this.pos + 2] === '=') {
            tokens.push({ type: 'NEQ', value: '!==', pos: p });
            this.pos += 3;
          } else {
            tokens.push({ type: 'NEQ', value: '!=', pos: p });
            this.pos += 2;
          }
        } else {
          tokens.push({ type: 'NOT', value: '!', pos: p });
          this.pos++;
        }
      } else if (ch === '=') {
        if (this.input[this.pos + 1] === '=') {
          if (this.input[this.pos + 2] === '=') {
            tokens.push({ type: 'EQ', value: '===', pos: p });
            this.pos += 3;
          } else {
            tokens.push({ type: 'EQ', value: '==', pos: p });
            this.pos += 2;
          }
        } else {
          throw new Error(`Unexpected single '=' at pos ${p}`);
        }
      } else if (ch === '<') {
        if (this.input[this.pos + 1] === '=') {
          tokens.push({ type: 'LTE', value: '<=', pos: p });
          this.pos += 2;
        } else {
          tokens.push({ type: 'LT', value: '<', pos: p });
          this.pos++;
        }
      } else if (ch === '>') {
        if (this.input[this.pos + 1] === '=') {
          tokens.push({ type: 'GTE', value: '>=', pos: p });
          this.pos += 2;
        } else {
          tokens.push({ type: 'GT', value: '>', pos: p });
          this.pos++;
        }
      } else if (ch === '&' && this.input[this.pos + 1] === '&') {
        tokens.push({ type: 'AND', value: '&&', pos: p });
        this.pos += 2;
      } else if (ch === '|' && this.input[this.pos + 1] === '|') {
        tokens.push({ type: 'OR', value: '||', pos: p });
        this.pos += 2;
      } else if (ch === '"' || ch === "'") {
        const quote = ch;
        this.pos++;
        let str = '';
        while (this.pos < this.input.length && this.input[this.pos] !== quote) {
          str += this.input[this.pos++];
        }
        if (this.pos >= this.input.length) {
          throw new Error(`Unterminated string at pos ${p}`);
        }
        this.pos++; // skip close quote
        tokens.push({ type: 'STRING', value: str, pos: p });
      } else if (/\d/.test(ch)) {
        let numStr = '';
        while (this.pos < this.input.length && /[\d.]/.test(this.input[this.pos])) {
          numStr += this.input[this.pos++];
        }
        tokens.push({ type: 'NUMBER', value: numStr, pos: p });
      } else if (/[a-zA-Z_$]/.test(ch)) {
        let idStr = '';
        while (this.pos < this.input.length && /[a-zA-Z0-9_$]/.test(this.input[this.pos])) {
          idStr += this.input[this.pos++];
        }
        if (idStr === 'true' || idStr === 'false') {
          tokens.push({ type: 'BOOLEAN', value: idStr, pos: p });
        } else if (idStr === 'null' || idStr === 'undefined') {
          tokens.push({ type: 'NULL', value: idStr, pos: p });
        } else {
          tokens.push({ type: 'IDENT', value: idStr, pos: p });
        }
      } else {
        throw new Error(`Unexpected character '${ch}' at pos ${this.pos}`);
      }
    }
    tokens.push({ type: 'EOF', value: '', pos: this.pos });
    return tokens;
  }
}

type ASTNode =
  | { type: 'Literal'; value: unknown }
  | { type: 'Identifier'; name: string }
  | { type: 'Member'; object: ASTNode; property: string }
  | { type: 'Unary'; operator: string; argument: ASTNode }
  | { type: 'Binary'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'Conditional'; test: ASTNode; consequent: ASTNode; alternate: ASTNode };

class Parser {
  private cur = 0;
  constructor(private tokens: Token[]) {}

  parse(): ASTNode {
    const expression = this.parseConditional();
    if (!this.check('EOF')) {
      throw new Error(`Unexpected token '${this.peek().value}' at pos ${this.peek().pos}`);
    }
    return expression;
  }

  private parseConditional(): ASTNode {
    let expr = this.parseLogicalOr();
    if (this.match('QUESTION')) {
      const consequent = this.parseConditional();
      this.consume('COLON', "Expected ':' in conditional expression");
      const alternate = this.parseConditional();
      expr = { type: 'Conditional', test: expr, consequent, alternate };
    }
    return expr;
  }

  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();
    while (this.match('OR')) {
      const right = this.parseLogicalAnd();
      left = { type: 'Binary', operator: '||', left, right };
    }
    return left;
  }

  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.match('AND')) {
      const right = this.parseEquality();
      left = { type: 'Binary', operator: '&&', left, right };
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseRelational();
    while (this.check('EQ') || this.check('NEQ')) {
      const op = this.advance().value;
      const right = this.parseRelational();
      left = { type: 'Binary', operator: op, left, right };
    }
    return left;
  }

  private parseRelational(): ASTNode {
    let left = this.parseAdditive();
    while (this.check('LT') || this.check('LTE') || this.check('GT') || this.check('GTE')) {
      const op = this.advance().value;
      const right = this.parseAdditive();
      left = { type: 'Binary', operator: op, left, right };
    }
    return left;
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();
    while (this.check('PLUS') || this.check('MINUS')) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      left = { type: 'Binary', operator: op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary();
    while (this.check('MUL') || this.check('DIV') || this.check('MOD')) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: 'Binary', operator: op, left, right };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.match('NOT')) {
      return { type: 'Unary', operator: '!', argument: this.parseUnary() };
    }
    if (this.match('MINUS')) {
      return { type: 'Unary', operator: '-', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    if (this.match('BOOLEAN')) {
      return { type: 'Literal', value: this.previous().value === 'true' };
    }
    if (this.match('NUMBER')) {
      return { type: 'Literal', value: parseFloat(this.previous().value) };
    }
    if (this.match('STRING')) {
      return { type: 'Literal', value: this.previous().value };
    }
    if (this.match('NULL')) {
      return { type: 'Literal', value: null };
    }
    if (this.match('LPAREN')) {
      const expr = this.parseConditional();
      this.consume('RPAREN', "Expected ')' after expression");
      return expr;
    }
    if (this.match('IDENT')) {
      let node: ASTNode = { type: 'Identifier', name: this.previous().value };
      while (this.match('DOT')) {
        const prop = this.consume('IDENT', "Expected property name after '.'");
        node = { type: 'Member', object: node, property: prop.value };
      }
      return node;
    }
    throw new Error(`Unexpected token '${this.peek().value}' at pos ${this.peek().pos}`);
  }

  private match(...types: TokenType[]): boolean {
    for (const t of types) {
      if (this.check(t)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.cur++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.cur];
  }

  private previous(): Token {
    return this.tokens[this.cur - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`${message} at pos ${this.peek().pos}`);
  }
}

function evaluateAST(node: ASTNode, context: Record<string, unknown>): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier': {
      if (node.name in context) return context[node.name];
      return undefined;
    }
    case 'Member': {
      const obj = evaluateAST(node.object, context);
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[node.property];
      }
      return undefined;
    }
    case 'Unary': {
      const arg = evaluateAST(node.argument, context);
      if (node.operator === '!') return !arg;
      if (node.operator === '-') return -Number(arg);
      return arg;
    }
    case 'Binary': {
      const l = evaluateAST(node.left, context);
      const r = evaluateAST(node.right, context);
      switch (node.operator) {
        case '&&':
          return l && r;
        case '||':
          return l || r;
        case '==':
        case '===':
          return l === r;
        case '!=':
        case '!==':
          return l !== r;
        case '<':
          return (l as any) < (r as any);
        case '<=':
          return (l as any) <= (r as any);
        case '>':
          return (l as any) > (r as any);
        case '>=':
          return (l as any) >= (r as any);
        case '+':
          return (l as any) + (r as any);
        case '-':
          return (l as any) - (r as any);
        case '*':
          return (l as any) * (r as any);
        case '/':
          return (l as any) / (r as any);
        case '%':
          return (l as any) % (r as any);
        default:
          return undefined;
      }
    }
    case 'Conditional': {
      const test = evaluateAST(node.test, context);
      return test ? evaluateAST(node.consequent, context) : evaluateAST(node.alternate, context);
    }
  }
}

/**
 * SafeResolver — AST-based expression resolver without unrestricted eval or new Function().
 */
export class SafeResolver {
  private static cache = new Map<string, ASTNode>();

  static evaluate<T = unknown>(
    expression: string,
    context: Record<string, unknown> = {},
    metadata: { schemaPath?: string; propertyPath?: string } = {},
  ): ResolverResult<T> {
    if (!expression || expression.trim() === '') {
      return { success: true, value: undefined as T };
    }

    try {
      let ast = this.cache.get(expression);
      if (!ast) {
        const tokenizer = new Tokenizer(expression);
        const tokens = tokenizer.tokenize();
        const parser = new Parser(tokens);
        ast = parser.parse();
        this.cache.set(expression, ast);
      }

      const val = evaluateAST(ast, context) as T;
      return { success: true, value: val };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const error: ResolverError = {
        schemaPath: metadata.schemaPath,
        propertyPath: metadata.propertyPath,
        expression,
        message: msg,
      };
      return { success: false, error };
    }
  }

  static evaluateBoolean(
    expression: string,
    context: Record<string, unknown> = {},
    fallback = true,
  ): boolean {
    const res = this.evaluate<boolean>(expression, context);
    if (!res.success) return fallback;
    return Boolean(res.value);
  }
}
