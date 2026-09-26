// Leaderboard name filter. Catches common English and Hindi/Urdu swearing,
// slurs, and the usual disguises (l33t, sp.a.c.i.n.g, repeated letters),
// without blocking real names that happen to contain a bad substring.
// The database runs a similar check (tools/leaderboard.sql) as a backstop.

// Blocked anywhere inside the name, even when joined to other letters.
const ANYWHERE = [
  'fuck', 'fuk', 'fck', 'cunt', 'bitch', 'biatch', 'whore', 'slut', 'nigger', 'nigga', 'faggot',
  'retard', 'bastard', 'asshole', 'arsehole', 'dickhead', 'motherf', 'wanker', 'twat', 'pussy',
  'bollock', 'bullshit', 'shithead', 'porn', 'rapist', 'pedo', 'paedo', 'nazi', 'hitler',
  'chutiya', 'chutia', 'chootiya', 'madarchod', 'maderchod', 'behenchod', 'bhenchod', 'benchod',
  'bhosdi', 'bhosad', 'bhosda', 'harami', 'haramkhor', 'gandu', 'lavde', 'lawde', 'laude', 'jhant',
];

// Blocked only as a whole word, because they hide inside innocent names
// (Hassan, Dickens, Hancock, Kshitij, Cumberbatch, grape, Gandhi...).
const WHOLE_WORD = [
  'ass', 'arse', 'dick', 'cock', 'cum', 'tit', 'tits', 'fag', 'sex', 'anal', 'piss', 'shit', 'shitty',
  'crap', 'damn', 'rape', 'kkk', 'wtf', 'stfu', 'milf', 'mc', 'bc', 'bsdk', 'lund', 'loda', 'lodu',
  'lauda', 'kutta', 'kutti', 'kamina', 'kamine', 'chod', 'gaand', 'gand', 'saala', 'saali',
];

// Real words that contain an ANYWHERE entry; removed before checking.
const ALLOW = ['scunthorpe', 'pedometer', 'pedometre'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' };

const collapse = s => s.replace(/(.)\1+/g, '$1');
const normalise = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[0134578@$!|+9]/g, ch => LEET[ch] || ch);

export function isProfane(name) {
  const norm = normalise(name);
  const tokens = norm.split(/[^a-z]+/).filter(Boolean);
  // Runs of single letters ("a s s") are read as one word.
  const spelled = norm.split(/[^a-z]*[a-z]{2,}[^a-z]*/).map(r => r.replace(/[^a-z]/g, '')).filter(r => r.length > 1);
  const words = [...tokens, ...spelled];
  const wordSet = new Set([...words, ...words.map(collapse)]);
  if (WHOLE_WORD.some(w => wordSet.has(w) || wordSet.has(collapse(w)))) return true;
  let joined = tokens.join('');
  for (const ok of ALLOW) joined = joined.split(ok).join('');
  const forms = [joined, collapse(joined)];
  return ANYWHERE.some(w => forms.some(f => f.includes(w) || f.includes(collapse(w))));
}

// Returns an error message, or null if the name is fine.
export function checkName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) return 'Use at least 2 characters.';
  if (name.length > 20) return 'Keep it to 20 characters or fewer.';
  if (!/^[A-Za-z0-9 _.-]+$/.test(name)) return 'Letters, numbers, spaces, dots, dashes and underscores only.';
  if (!/[A-Za-z]/.test(name)) return 'Include at least one letter.';
  if (isProfane(name)) return 'That name is not allowed. Please choose another.';
  return null;
}

export const cleanName = raw => String(raw || '').trim().replace(/\s+/g, ' ');
