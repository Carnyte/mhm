// Cleans fanfiction text for speech engines. Fiction on FanFiction.net is full of markup habits
// that make voices stumble: "..." and ". . .", "!!!", *asterisk emphasis*, "--" dashes, missing
// spaces after full stops. Display text is left alone; only what's spoken is changed.

export function speechText(input: string): string {
  let t = input;
  // Ellipses: "...", "....", ". . ." → "…" (voices pause on it instead of saying "dot dot dot").
  t = t.replace(/(?:\.\s?){3,}/g, '… ');
  // Repeated ! and ?: "!!!" → "!", "?!?!" → "?!".
  t = t.replace(/([!?])\1+/g, '$1');
  t = t.replace(/[!?]{3,}/g, (m) => (m.includes('?') && m.includes('!') ? '?!' : m[0]));
  // Emphasis markers around words: *sigh*, _really_, ~softly~, **bold**.
  t = t.replace(/(^|[\s"“'‘(])([*_~]{1,3})(?=\S)([^*_~\n]{1,200}?\S)\2(?=$|[\s"”'’),.!?;:…—-])/g, '$1$3');
  // Leftover lone asterisks / tildes / underscores runs.
  t = t.replace(/(^|\s)[*~_]{1,3}(?=\s|$)/g, '$1');
  // "--" and " - " used as dashes → an em dash, which voices treat as a pause.
  t = t.replace(/\s?--+\s?/g, ' — ').replace(/\s-\s/g, ' — ');
  // A missing space after a sentence end ("ran.She") runs the sentences together.
  t = t.replace(/([a-z][.!?]["”’]?)(?=[A-Z][a-z])/g, '$1 ');
  // Whitespace.
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}
