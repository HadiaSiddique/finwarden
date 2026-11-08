// Lookalike detection for payee names and email domains.

const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic
  "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c",
  "т": "t", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ɡ": "g", "ӏ": "l",
  // Greek
  "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
};

// Applied after lower-casing, to both sides of a comparison.
const ASCII_CONFUSABLES: [RegExp, string][] = [
  [/rn/g, "m"],
  [/vv/g, "w"],
  [/0/g, "o"],
  [/[1|!]/g, "l"],
  [/i/g, "l"],
  [/5|\$/g, "s"],
  [/@/g, "a"],
  [/3/g, "e"],
];

const LEGAL_SUFFIXES = new Set([
  "ltd", "limited", "llc", "inc", "incorporated", "co", "corp", "corporation", "company",
  "gmbh", "pvt", "private", "plc", "sa", "bv", "llp", "pte",
]);

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "protonmail.com", "aol.com"]);

function foldHomoglyphs(s: string): string {
  return [...s].map((c) => HOMOGLYPHS[c] ?? c).join("");
}

function stripMarks(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "");
}

function nameTokens(s: string): string {
  const tokens = s
    .replace(/[^\p{L}\p{N}|!@$\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("");
}

// Identity of a name: "Acme Ltd." -> "acme". Homoglyphs are kept, so "Аcme" (Cyrillic А) is a different name.
export function normaliseName(name: string): string {
  return nameTokens(name.toLowerCase().normalize("NFC"));
}

// Visual skeleton: two strings with the same skeleton look the same to a person.
export function skeleton(s: string): string {
  let out = nameTokens(stripMarks(foldHomoglyphs(s.toLowerCase())));
  for (const [re, rep] of ASCII_CONFUSABLES) out = out.replace(re, rep);
  return out;
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aM = new Array(a.length).fill(false);
  const bM = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (!bM[j] && a[i] === b[j]) {
        aM[i] = bM[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export interface LookalikeMatch {
  candidate: string;
  known: string;
  reason: "confusable" | "near-spelling";
  similarity: number;
}

// Returns a match when `candidate` looks like `known` without being the same name.
export function looksLike(candidate: string, known: string): LookalikeMatch | null {
  const nc = normaliseName(candidate);
  const nk = normaliseName(known);
  if (!nc || !nk || nc === nk) return null;
  const sc = skeleton(candidate);
  const sk = skeleton(known);
  if (sc === sk) return { candidate, known, reason: "confusable", similarity: 1 };
  if (Math.min(sc.length, sk.length) < 4) return null;
  const sim = jaroWinkler(sc, sk);
  const dist = editDistance(sc, sk);
  const maxDist = Math.max(sc.length, sk.length) >= 10 ? 2 : 1;
  if (sim >= 0.92 && dist <= maxDist) return { candidate, known, reason: "near-spelling", similarity: sim };
  return null;
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : null;
}

function domainBase(domain: string): string {
  const parts = domain.split(".");
  // "acme.co.uk" -> "acme", "acme.com" -> "acme"
  if (parts.length >= 3 && parts[parts.length - 2].length <= 3) return parts.slice(0, -2).join(".");
  return parts.slice(0, -1).join(".");
}

// Returns the known domain that `candidate` imitates, if any.
export function domainLooksLike(candidate: string, knownDomains: string[]): string | null {
  const c = candidate.toLowerCase();
  if (FREE_MAIL.has(c)) return null;
  for (const k of knownDomains.map((d) => d.toLowerCase())) {
    if (c === k || FREE_MAIL.has(k)) continue;
    const cb = domainBase(c);
    const kb = domainBase(k);
    // Same name on a different TLD (acme.co vs acme.com).
    if (cb === kb) return k;
    if (looksLike(cb.replace(/[-.]/g, " "), kb.replace(/[-.]/g, " "))) return k;
    // acme-payments.com imitating acme.com
    if (kb.length >= 4 && cb.replace(/[-.]/g, "").startsWith(kb) && cb !== kb) return k;
  }
  return null;
}
