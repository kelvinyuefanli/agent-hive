const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "how", "what", "when",
  "where", "why", "which", "who", "whom", "this", "that", "these",
  "those", "i", "my", "me", "we", "you", "it", "he", "she", "they",
]);

export function normalizeQuery(query: string): string {
  const lowered = query.toLowerCase();
  const normalized = lowered.normalize("NFKC");
  const tokens = normalized.split(/[\s\p{P}]+/u);
  const filtered = tokens
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
    .sort();
  return filtered.join(" ");
}
