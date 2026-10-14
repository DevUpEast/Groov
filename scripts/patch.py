"""Exact-string patcher that preserves CRLF. Usage: python scripts/patch.py <file> <patchfile.json>
patchfile: [{"old": "...", "new": "...", "count": 1}] ; 'old' must occur exactly `count` times (default 1).
Line endings in old/new are LF; the file's CRLF is normalised in and restored out."""
import json, sys
path, pf = sys.argv[1], sys.argv[2]
raw = open(path, 'rb').read().decode('utf-8')
crlf = '\r\n' in raw
s = raw.replace('\r\n', '\n')
for p in json.load(open(pf, encoding='utf-8')):
    n = s.count(p['old'])
    want = p.get('count', 1)
    if n != want:
        print(f"PATCH FAILED in {path}: expected {want} occurrence(s), found {n} of:\n{p['old'][:200]}")
        sys.exit(1)
    s = s.replace(p['old'], p['new'])
if crlf: s = s.replace('\n', '\r\n')
open(path, 'wb').write(s.encode('utf-8'))
print(f"patched {path}")
