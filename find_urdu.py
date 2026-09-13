"""Find quoted strings that still read as Roman Urdu.

Matches on words that do not occur in English, so English copy containing
"main" or "hair" is not dragged in.
"""
import re, sys, pathlib
from collections import Counter

WORDS = r"""karein|kariye|karta|karte|karna|karni|kiya|kiye|hain|nahi|nahin|aap|aapka|aapki|aapke|
hum|hamara|yeh|woh|kya|kyun|kaise|jayega|jayegi|jaye|gaya|gayi|gaye|dein|lein|liya|
sakta|sakti|sakte|zaroori|wapis|abhi|phir|bhej|bhejein|bheja|milta|mila|mili|milega|
rahe|rahi|raha|kaam|masla|qeemat|waqt|mein|apna|apni|apne|koi|kuch|bohat|bara|bari|
zyada|kam|baad|pehle|sirf|agar|jab|tak|par|aur|ya|se|ka|ki|ke|hai|ho|hoga|hogi|
technician|shukriya|mubarak|behtar|acha|theek|ghalat|mukammal|khatam|shuru|
intezar|jawab|maloomat|tafseel|tasveer|dobara|foran|khud|saath|ghar|din|ghante|
minute|baje|nayi|naya|naye|purana|puraana|band|khula|khuli"""
WORDS = re.sub(r'\s+', '', WORDS)
# A string is Roman Urdu when several of these appear together — one alone is
# too easily a coincidence ("se", "par", "hai" inside another word).
WORD_RE = re.compile(rf"\b({WORDS})\b", re.I)
STRING_RE = re.compile(r"""(['"`])((?:[^\\]|\\.)*?)\1""", re.S)

def urdu_score(text):
    return len(set(m.group(0).lower() for m in WORD_RE.finditer(text)))

def scan(paths, threshold=2):
    hits = Counter()
    for path in paths:
        p = pathlib.Path(path)
        if not p.is_file():
            continue
        try:
            s = p.read_text()
        except Exception:
            continue
        n = 0
        for m in STRING_RE.finditer(s):
            body = m.group(2)
            if len(body) < 8:
                continue
            if urdu_score(body) >= threshold:
                n += 1
        # JSX text nodes are not quoted; catch those too.
        for line in s.split('\n'):
            stripped = line.strip()
            if stripped and not stripped.startswith(('//', '*', '/*')) and urdu_score(stripped) >= 3:
                if not STRING_RE.search(stripped):
                    n += 1
        if n:
            hits[path] = n
    return hits

if __name__ == '__main__':
    roots = sys.argv[1:] or ['src', 'prisma/seed.ts']
    files = []
    for r in roots:
        p = pathlib.Path(r)
        files += [str(f) for f in (p.rglob('*') if p.is_dir() else [p])
                  if f.is_file() and f.suffix in {'.ts', '.tsx'}]
    hits = scan(files)
    for path, n in hits.most_common():
        print(f'{n:4d}  {path}')
    print(f'\nfiles: {len(hits)}  strings: {sum(hits.values())}')
