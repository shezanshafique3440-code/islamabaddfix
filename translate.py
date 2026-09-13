"""Apply exact string replacements to a file, failing loudly on a miss.

Silent no-ops are the failure mode of a find-and-replace this large, so every
mapping must match or the whole file is left untouched.
"""
import sys, pathlib, json

def apply(path: str, pairs: list[tuple[str, str]]) -> None:
    p = pathlib.Path(path)
    s = p.read_text()
    missing = [old for old, _ in pairs if old not in s]
    if missing:
        print(f'MISS {path}:')
        for m in missing:
            print(f'   {m[:90]}')
        sys.exit(1)
    for old, new in pairs:
        s = s.replace(old, new)
    p.write_text(s)
    print(f'ok   {path}  ({len(pairs)} strings)')

if __name__ == '__main__':
    spec = json.load(sys.stdin)
    for path, pairs in spec.items():
        apply(path, [(a, b) for a, b in pairs])
