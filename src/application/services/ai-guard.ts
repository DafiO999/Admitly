const forbiddenClaims = /\b(deadlines?|due dates?|apply by|applications? (?:close|open)|application dates?|dates?|probabilit(?:y|ies)|chances?|odds|likelihood|acceptance rates?|guarantee(?:d|s)?|assured|certain|ensures?|official|verified|confirmed|published|according to|websites?|source status|costs?|tuition|prices?|fees?|expenses?|scholarships?|financial aid|funding|free|no charge|must|requires?|required|eligib(?:le|ility)|qualif(?:y|ies|ied)|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const numbers = /\d[\d,.]*/g;

// Model prose is optional. Reject new quantitative or authoritative claims and
// use deterministic text if its wording cannot be grounded in supplied facts.
export function isGroundedWording(output: string[], facts: string[]): boolean {
  const knownNumbers = new Set(facts.flatMap((fact) => fact.match(numbers) ?? []));
  return output.every((sentence) => {
    if (facts.includes(sentence)) return true;
    if (forbiddenClaims.test(sentence) || /[$%]|https?:\/\/|\bwww\./i.test(sentence)) return false;
    return (sentence.match(numbers) ?? []).every((number) => knownNumbers.has(number));
  });
}

const roadmapRewriteWords = new Set([
  'a', 'an', 'and', 'the', 'your', 'you', 'to', 'for', 'with', 'from', 'in', 'on', 'of',
  'review', 'explore', 'check', 'confirm', 'prepare', 'gather', 'plan', 'record', 'choose', 'complete', 'compare',
]);

export function isGroundedRoadmapRewrite(output: string[], original: string[]): boolean {
  if (!isGroundedWording(output, original)) return false;
  const words = (value: string) => value.toLowerCase().match(/[a-z]+|\d[\d,.]*/g) ?? [];
  const known = new Set(original.flatMap(words));
  return output.every((sentence) => words(sentence).every((word) => known.has(word) || roadmapRewriteWords.has(word)));
}
