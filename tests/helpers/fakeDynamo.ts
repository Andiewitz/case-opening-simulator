/**
 * Minimal in-memory DynamoDB for handler tests.
 *
 * It implements only what this codebase uses, but it implements the parts that
 * matter for correctness: conditional writes, transactional all-or-nothing
 * semantics (every condition is checked against the state before the
 * transaction, then all writes are applied), ADD on document paths, and Query
 * pagination. That is what lets the concurrency test in
 * tests/openCase.test.ts prove the balance guard rather than mock it away.
 */

export type Row = Record<string, any>;

/** table name -> ordered key attribute names (hash, optional range). */
export type Schema = Record<string, string[]>;

export class FakeDynamo {
  private tables = new Map<string, Map<string, Row>>();

  constructor(private schema: Schema) {
    for (const table of Object.keys(schema)) this.tables.set(table, new Map());
  }

  private table(name: string): Map<string, Row> {
    const table = this.tables.get(name);
    if (!table) throw new Error(`FakeDynamo: unknown table ${name}`);
    return table;
  }

  private keyAttrs(table: string, row: Row): Row {
    const out: Row = {};
    for (const attr of this.schema[table]) out[attr] = row[attr];
    return out;
  }

  private keyOf(table: string, key: Row): string {
    return JSON.stringify(this.schema[table].map((attr) => key[attr]));
  }

  seed(table: string, row: Row): void {
    this.table(table).set(this.keyOf(table, this.keyAttrs(table, row)), { ...row });
  }

  rows(table: string): Row[] {
    return [...this.table(table).values()].map((row) => ({ ...row }));
  }

  // ── commands ─────────────────────────────────────────────────────────

  get(input: { TableName: string; Key: Row }) {
    const found = this.table(input.TableName).get(this.keyOf(input.TableName, input.Key));
    return { Item: found ? { ...found } : undefined };
  }

  put(input: { TableName: string; Item: Row; ConditionExpression?: string; ExpressionAttributeValues?: Row }) {
    this.assertCondition(input);
    this.applyPut(input);
    return {};
  }

  update(input: {
    TableName: string;
    Key: Row;
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeValues?: Row;
  }) {
    this.assertCondition(input);
    this.applyUpdate(input);
    return {};
  }

  delete(input: { TableName: string; Key: Row; ConditionExpression?: string; ExpressionAttributeValues?: Row }) {
    this.assertCondition(input);
    this.applyDelete(input);
    return {};
  }

  query(input: {
    TableName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues?: Row;
    Limit?: number;
    ExclusiveStartKey?: Row;
    ScanIndexForward?: boolean;
    Select?: string;
  }) {
    const keys = this.schema[input.TableName];
    const match = /([A-Za-z0-9_.]+)\s*=\s*(:[A-Za-z0-9_]+)/.exec(input.KeyConditionExpression);
    if (!match) throw new Error(`FakeDynamo: unsupported KeyConditionExpression: ${input.KeyConditionExpression}`);
    const [, attr, valueName] = match;
    const wanted = (input.ExpressionAttributeValues || {})[valueName];

    let matched = [...this.table(input.TableName).values()].filter((row) => row[attr] === wanted);
    const range = keys[1];
    if (range) {
      matched = matched.sort((a, b) => String(a[range]).localeCompare(String(b[range])));
      if (input.ScanIndexForward === false) matched = matched.reverse();
    }

    let start = 0;
    if (input.ExclusiveStartKey) {
      const cursor = input.ExclusiveStartKey;
      const index = matched.findIndex((row) => keys.every((key) => row[key] === cursor[key]));
      start = index >= 0 ? index + 1 : 0;
    }

    const limit = input.Limit ?? matched.length;
    const page = matched.slice(start, start + limit);
    const result: Row = {};

    if (input.Select === "COUNT") {
      result.Count = page.length;
    } else {
      result.Items = page.map((row) => ({ ...row }));
    }

    if (start + page.length < matched.length && page.length > 0) {
      result.LastEvaluatedKey = this.keyAttrs(input.TableName, page[page.length - 1]);
    }

    return result;
  }

  transact(transactItems: any[]) {
    const reasons = transactItems.map((item) => {
      const condition = conditionOf(item);
      if (!condition) return { Code: "None" };
      const table = tableOf(item);
      const key = keyOfItem(item, table, this.schema);
      const existing = this.table(table).get(this.keyOf(table, key)) || {};
      const values = item.ConditionCheck?.ExpressionAttributeValues || item.Update?.ExpressionAttributeValues || item.Put?.ExpressionAttributeValues || {};
      return evaluates(condition, existing, values)
        ? { Code: "None" }
        : { Code: "ConditionalCheckFailed", Message: "The conditional request failed" };
    });

    if (reasons.some((reason) => reason.Code !== "None")) {
      throw Object.assign(new Error("Transaction cancelled, please refer cancellation reasons for specific reasons"), {
        name: "TransactionCanceledException",
        CancellationReasons: reasons,
      });
    }

    for (const item of transactItems) this.apply(item);
    return {};
  }

  // ── internals ────────────────────────────────────────────────────────

  private assertCondition(input: any): void {
    if (!input.ConditionExpression) return;
    const existing = this.table(input.TableName).get(this.keyOf(input.TableName, keyOfItem(input, input.TableName, this.schema))) || {};
    if (!evaluates(input.ConditionExpression, existing, input.ExpressionAttributeValues || {})) {
      throw Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });
    }
  }

  private apply(item: any): void {
    if (item.Put) this.applyPut(item.Put);
    else if (item.Update) this.applyUpdate(item.Update);
    else if (item.Delete) this.applyDelete(item.Delete);
    // ConditionCheck has no effects.
  }

  private applyPut(input: any): void {
    this.table(input.TableName).set(this.keyOf(input.TableName, this.keyAttrs(input.TableName, input.Item)), { ...input.Item });
  }

  private applyUpdate(input: any): void {
    const table = this.table(input.TableName);
    const key = this.keyOf(input.TableName, keyOfItem(input, input.TableName, this.schema));
    const row = table.get(key);
    if (!row) throw new Error(`FakeDynamo: update on missing item in ${input.TableName}`);
    applyUpdateExpression(row, input.UpdateExpression, input.ExpressionAttributeValues || {});
    table.set(key, row);
  }

  private applyDelete(input: any): void {
    this.table(input.TableName).delete(this.keyOf(input.TableName, keyOfItem(input, input.TableName, this.schema)));
  }
}

/** Works for a transaction entry, a single-item command, or a bare payload. */
function tableOf(item: any): string {
  return item.TableName || (item.Put || item.Update || item.Delete || item.ConditionCheck).TableName;
}

function keyOfItem(item: any, table: string, schema: Schema): Row {
  const payload =
    item.Key ||
    item.Item ||
    item.Put?.Item ||
    item.Update?.Key ||
    item.Delete?.Key ||
    item.ConditionCheck?.Key;
  const key: Row = {};
  for (const attr of schema[table]) key[attr] = payload[attr];
  return key;
}

function conditionOf(item: any): string | undefined {
  return (
    item.ConditionExpression ||
    (item.Put || item.Update || item.Delete || item.ConditionCheck).ConditionExpression
  );
}

// ── expressions ──────────────────────────────────────────────────────────

function getPath(row: Row, path: string): any {
  return path.split(".").reduce<any>((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), row);
}

function setPath(row: Row, path: string, value: any): void {
  const parts = path.split(".");
  let cursor: Row = row;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

/** Recursive-descent parser for the condition grammar this backend uses. */
function evaluates(expression: string, row: Row, values: Row): boolean {
  let index = 0;

  const skipSpace = () => {
    while (index < expression.length && /\s/.test(expression[index])) index++;
  };

  const eatWord = (word: string): boolean => {
    skipSpace();
    if (expression.slice(index, index + word.length).toUpperCase() !== word) return false;
    const after = expression[index + word.length];
    if (after !== undefined && !/[\s(]/.test(after)) return false;
    index += word.length;
    return true;
  };

  const resolveValue = (token: string): any => {
    const name = token.trim();
    if (name.startsWith(":")) return values[name];
    return name;
  };

  const parseAtom = (): boolean => {
    skipSpace();

    if (expression[index] === "(") {
      index++;
      const value = parseOr();
      skipSpace();
      if (expression[index] === ")") index++;
      return value;
    }

    if (/^attribute_not_exists/i.test(expression.slice(index))) {
      index += "attribute_not_exists".length;
      skipSpace();
      if (expression[index] === "(") index++;
      const start = index;
      while (index < expression.length && expression[index] !== ")") index++;
      const path = expression.slice(start, index).trim();
      if (expression[index] === ")") index++;
      return getPath(row, path) === undefined;
    }

    if (/^attribute_exists/i.test(expression.slice(index))) {
      index += "attribute_exists".length;
      skipSpace();
      if (expression[index] === "(") index++;
      const start = index;
      while (index < expression.length && expression[index] !== ")") index++;
      const path = expression.slice(start, index).trim();
      if (expression[index] === ")") index++;
      return getPath(row, path) !== undefined;
    }

    const pathStart = index;
    while (index < expression.length && /[A-Za-z0-9_.#:]/.test(expression[index])) index++;
    const path = expression.slice(pathStart, index).trim();

    skipSpace();
    const operators = [">=", "<=", "<>", "=", ">", "<"];
    const operator = operators.find((op) => expression.startsWith(op, index));
    if (!operator) throw new Error(`FakeDynamo: unsupported condition near "${expression.slice(pathStart)}"`);
    index += operator.length;

    skipSpace();
    const valueStart = index;
    while (index < expression.length && /[A-Za-z0-9_.#:-]/.test(expression[index])) index++;
    const right = resolveValue(expression.slice(valueStart, index));
    const left = getPath(row, path);

    switch (operator) {
      case ">=":
        return left !== undefined && left >= right;
      case "<=":
        return left !== undefined && left <= right;
      case ">":
        return left !== undefined && left > right;
      case "<":
        return left !== undefined && left < right;
      case "<>":
        return left !== right;
      default:
        return left === right;
    }
  };

  const parseAnd = (): boolean => {
    let left = parseAtom();
    for (;;) {
      const save = index;
      if (!eatWord("AND")) {
        index = save;
        return left;
      }
      const right = parseAtom();
      left = left && right;
    }
  };

  const parseOr = (): boolean => {
    let left = parseAnd();
    for (;;) {
      const save = index;
      if (!eatWord("OR")) {
        index = save;
        return left;
      }
      const right = parseAnd();
      left = left || right;
    }
  };

  const result = parseOr();
  skipSpace();
  if (index < expression.length) {
    throw new Error(`FakeDynamo: unparsed condition tail "${expression.slice(index)}"`);
  }
  return result;
}

function applyUpdateExpression(row: Row, expression: string, values: Row): void {
  const clauses = expression
    .split(/\s+(?=(?:ADD|SET|REMOVE|DELETE)\s)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const [keyword, ...rest] = clause.split(/\s+/);
    const body = rest.join(" ");

    if (/^SET$/i.test(keyword)) {
      for (const assignment of body.split(",")) {
        const [path, token] = assignment.split("=").map((part) => part.trim());
        if (!path || !token) throw new Error(`FakeDynamo: unsupported SET "${assignment}"`);
        setPath(row, path, values[token]);
      }
    } else if (/^ADD$/i.test(keyword)) {
      for (const addition of body.split(",")) {
        const [path, token] = addition.trim().split(/\s+/);
        const current = getPath(row, path);
        setPath(row, path, (typeof current === "number" ? current : 0) + Number(values[token]));
      }
    } else {
      throw new Error(`FakeDynamo: unsupported update keyword ${keyword}`);
    }
  }
}
