// Bad-word filter for the suggestions box (English + German).
// Swear words get masked with asterisks; slurs and hate words block the whole post.
// The same logic is copied into index.html so the game can warn before sending.

const MASK = [
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'bastard', 'asshole', 'arsehole', 'dick', 'cock', 'pussy', 'cunt', 'wank', 'twat',
  'slut', 'whore', 'bollock', 'prick', 'damn', 'crap', 'piss', 'dildo', 'porn', 'boob', 'tits', 'penis', 'vagina', 'motherf',
  'scheiss', 'scheis', 'scheiße', 'arschloch', 'arsch', 'fotze', 'hure', 'wichser', 'wixer', 'wichs', 'ficken', 'fick', 'schlampe',
  'hurensohn', 'missgeburt', 'bastard', 'pimmel', 'schwanz', 'titten', 'kacke', 'depp', 'idiot', 'spast', 'vollidiot'
];
const BLOCK = [
  'nigger', 'nigga', 'negro', 'neger', 'faggot', 'fagot', 'fag', 'retard', 'tranny', 'kike', 'chink', 'spic', 'wetback',
  'gook', 'coon', 'paki', 'raghead', 'kys', 'killyourself', 'heil', 'hitler', 'nazi', 'kanake', 'zigeuner', 'schwuchtel',
  'judensau', 'untermensch', 'rape', 'rapist', 'vergewaltig'
];
// innocent words that happen to contain a bad one
const ALLOW = ['scunthorpe', 'shiitake', 'cocktail', 'cockpit', 'peacock', 'hancock', 'cockerel', 'grape', 'drape', 'scrape', 'trapez', 'rapeseed', 'therapist', 'montenegro', 'mongoose', 'prickly', 'prickle', 'shitake', 'penistone', 'arsenal', 'matchbox', 'cumulus', 'document', 'circumst', 'scrap', 'crapaud', 'hellcat', 'nazareth', 'spice', 'spicy', 'despicable'];
// short words that are only bad on their own (so "class" or "Dickens" stay fine)
const EXACT = new Set(['ass', 'arse', 'fag', 'kys', 'cum', 'tit', 'hoe', 'sau', 'dick', 'cock', 'heil', 'paki', 'coon', 'spic', 'gook', 'crap', 'damn', 'piss', 'arsch', 'depp', 'fick']);

const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', 'ß': 'ss', 'ä': 'a', 'ö': 'o', 'ü': 'u', '€': 'e' };
function norm(w) {
  let s = w.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[0-9!|@$+€ß]/g, c => LEET[c] || c).replace(/[^a-z]/g, '');
  return s.replace(/(.)\1{2,}/g, '$1$1');
}
const squash = s => s.replace(/(.)\1+/g, '$1');
function hit(n, list) {
  for (const a of ALLOW) if (n.includes(a)) n = n.split(a).join(' ');
  const q = squash(n);
  for (const b of list) {
    const bq = squash(norm(b));
    const sq = n !== q; // only fold doubled letters when the word had them ("fuuuck"), so "niger" doesn't turn into a slur
    if (EXACT.has(b)) { if (n.trim() === b || n === b + 's' || (sq && (q === bq || q === bq + 's'))) return true; continue; }
    if (n.includes(b) || (sq && q.includes(bq))) return true;
  }
  return false;
}
function check(text) {
  const words = String(text).split(/(\s+)/);
  // also catch words split up with dots or spaces: "f u c k", "n.i.g.g.e.r"
  const spaced = String(text).match(/\b(?:\w[\s._-]){2,}\w\b/g) || [];
  if (spaced.some(s => hit(norm(s), BLOCK))) return { blocked: true, text: '' };
  let masked = false;
  const out = words.map(w => {
    if (/^\s+$/.test(w) || !w) return w;
    const n = norm(w);
    if (!n) return w;
    if (hit(n, BLOCK)) { masked = 'block'; return w; }
    if (hit(n, MASK)) { masked = true; return w.replace(/[^\s]/g, (c, i) => (i === 0 ? c : '*')); }
    return w;
  });
  if (masked === 'block') return { blocked: true, text: '' };
  for (const s of spaced) if (hit(norm(s), MASK)) { masked = true; }
  let t = out.join('');
  for (const s of spaced) if (hit(norm(s), MASK)) t = t.replace(s, s[0] + s.slice(1).replace(/\S/g, '*'));
  return { blocked: false, text: t, masked: !!masked };
}
module.exports = { check };
