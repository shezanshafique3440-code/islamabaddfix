"""Dump distinct Roman Urdu text in the tree.

Line-scoped on purpose: an earlier version matched template literals across
whole files and swallowed code. UI copy lives on one line or a few, so a line
is the right unit.
"""
import json, pathlib, re, sys
sys.path.insert(0, '.')
from find_urdu import urdu_score

# Quoted runs that stay on one line.
QUOTED = re.compile(r"""(['"`])([^'"`\n]{8,})\1""")
# A JSX text node: a line of prose with no tag or brace of its own.
JSX_TEXT = re.compile(r'^\s*([A-Za-z][^<>{}\n]{10,})\s*$')

def scan():
    seen = {}
    for root in ('src', 'prisma/seed.ts'):
        p = pathlib.Path(root)
        files = [f for f in (p.rglob('*') if p.is_dir() else [p])
                 if f.is_file() and f.suffix in {'.ts', '.tsx'}]
        for f in files:
            for line in f.read_text().split('\n'):
                stripped = line.strip()
                if stripped.startswith(('//', '*', '/*')):
                    continue
                for m in QUOTED.finditer(line):
                    body = m.group(2)
                    if urdu_score(body) >= 2:
                        seen[body] = seen.get(body, 0) + 1
                m = JSX_TEXT.match(line)
                # A line carrying its own quotes is code, not a JSX text node; its
                # quoted parts are already collected above.
                if m and '"' not in line and "'" not in line and '`' not in line and urdu_score(m.group(1)) >= 3:
                    body = m.group(1).strip()
                    seen[body] = seen.get(body, 0) + 1
    return seen

if __name__ == '__main__':
    seen = scan()
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else len(seen)
    items = sorted(seen.items(), key=lambda kv: kv[0])
    for i, (s, n) in enumerate(items[start:end], start):
        print(f'{i}\t{s}')
    print(f'\n--- {len(items)} unique ---', file=sys.stderr)
