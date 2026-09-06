import postcss from "postcss";

// Declaration cascade probe, intentionally not a browser layout/paint engine.
// :is/:not/:has take the maximum argument weight; :where contributes zero.
export function specificity(selector) {
  const score = [0, 0, 0];
  const add = values => values.forEach((n, i) => { score[i] += n; });
  for (let i = 0; i < selector.length;) {
    const ch = selector[i];
    if (ch === "[" || ch === "(") { i = balancedEnd(selector, i) + 1; if (ch === "[") score[1]++; continue; }
    if (ch === ":") {
      const match = selector.slice(i).match(/^(:{1,2})([-\w]+)/);
      if (!match) throw Error(`Unsupported pseudo: ${selector}`);
      const [, colons, name] = match; i += match[0].length;
      if (selector[i] === "(") {
        const end = balancedEnd(selector, i), body = selector.slice(i + 1, end); i = end + 1;
        if (["is", "not", "has"].includes(name)) add(postcss.list.comma(body).map(specificity).sort(compare).at(-1));
        else if (name !== "where") score[colons === "::" ? 2 : 1]++;
      } else score[colons === "::" || ["before", "after", "first-line", "first-letter"].includes(name) ? 2 : 1]++;
      continue;
    }
    const token = selector.slice(i).match(/^[.#]?[-\w]+/);
    if (token) { score[ch === "#" ? 0 : ch === "." ? 1 : 2]++; i += token[0].length; }
    else i++;
  }
  return score;
}

function balancedEnd(text, start) {
  const close = text[start] === "[" ? "]" : ")";
  let depth = 1, quote = "";
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (quote) { if (text[i] === quote) quote = ""; continue; }
    if (text[i] === "'" || text[i] === '"') { quote = text[i]; continue; }
    if (text[i] === text[start]) depth++;
    if (text[i] === close) { depth--; if (depth === 0) return i; }
  }
  throw Error(`Unbalanced selector: ${text}`);
}

function compare(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }

export function enabled(rule, width, reduced) {
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type !== "atrule") continue;
    if (/keyframes$/.test(node.name)) return false;
    if (node.name !== "media") continue;
    const max = node.params.match(/max-width:\s*(\d+)px/), min = node.params.match(/min-width:\s*(\d+)px/);
    if (max && width > Number(max[1]) || min && width < Number(min[1])) return false;
    if (/prefers-reduced-motion:\s*reduce\b/.test(node.params) && !reduced) return false;
    if (/prefers-reduced-motion:\s*no-preference\b/.test(node.params) && reduced) return false;
  }
  return true;
}

const candidatesCache = new WeakMap();
function candidates(sheets, element, pseudo) {
  let nodes = candidatesCache.get(sheets);
  if (!nodes) { nodes = new WeakMap(); candidatesCache.set(sheets, nodes); }
  let states = nodes.get(element);
  if (!states) { states = new Map(); nodes.set(element, states); }
  // The fixture DOM is immutable apart from this explicitly tested theme.
  const key = `${element.ownerDocument.documentElement.dataset.theme}:${pseudo}`;
  if (states.has(key)) return states.get(key);
  const result = [];
  for (const sheet of sheets) sheet.walkRules(rule => {
    let weight;
    for (let selector of rule.selectors) {
      const end = selector.match(/::?(before|after)$/);
      if ((end?.[1] ?? "") !== pseudo) continue;
      if (end) selector = selector.slice(0, end.index);
      if (/::/.test(selector)) continue;
      let matches = false;
      try { matches = element.matches(selector); } catch { return; }
      if (!matches) continue;
      const candidate = specificity(selector);
      if (!weight || compare(candidate, weight) > 0) weight = candidate;
    }
    if (weight) result.push({ rule, weight });
  });
  states.set(key, result);
  return result;
}

export function probe(sheets, element, width, reduced = false, pseudo = "") {
  const winners = new Map();
  for (const { rule, weight } of candidates(sheets, element, pseudo)) {
    if (!enabled(rule, width, reduced)) continue;
    rule.nodes.filter(node => node.type === "decl").forEach(decl => {
      // Shorthand expansion guards physical spacing and border override ordering.
      const declarations = [[decl.prop, decl.value]];
      if (/^(margin|padding)$/.test(decl.prop)) {
        const parts = postcss.list.space(decl.value);
        ["top", "right", "bottom", "left"].forEach((side, i) => declarations.push([`${decl.prop}-${side}`, parts[i] ?? parts[i % 2] ?? parts[0]]));
      }
      if (decl.prop === "border") for (const side of ["top", "right", "bottom", "left"]) declarations.push([`border-${side}`, decl.value]);
      for (const [property, value] of declarations) {
        const previous = winners.get(property), important = Boolean(decl.important);
        if (!previous || Number(important) > Number(previous.important) || important === previous.important && compare(weight, previous.weight) >= 0) winners.set(property, { weight, important, value });
      }
    });
  }
  return Object.fromEntries([...winners].sort(([a], [b]) => a.localeCompare(b)).map(([name, result]) => [name, result.value + (result.important ? " !important" : "")]));
}

export function moduleSheet(source, prefix) {
  // Fixtures use namespaced local classes, matching the isolation of CSS Modules.
  const sheet = postcss.parse(source);
  sheet.walkRules(rule => {
    const globals = [];
    rule.selector = rule.selector.replace(/:global\(([^)]+)\)/g, (_all, value) => { globals.push(value); return `__GLOBAL${globals.length - 1}__`; })
      .replace(/\.([a-zA-Z_][-\w]*)/g, `.${prefix}-$1`)
      .replace(/__GLOBAL(\d+)__/g, (_all, n) => globals[Number(n)]);
  });
  return sheet;
}
