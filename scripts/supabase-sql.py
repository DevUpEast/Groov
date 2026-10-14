"""Run a SQL file (or -e "sql") against the linked Supabase project via the Management API.
Usage: python scripts/supabase-sql.py supabase/migrations/x.sql | -e "select 1"
Reads SUPABASE_ACCESS_TOKEN from the env or the Windows user environment."""
import json, os, subprocess, sys, urllib.request
REF = 'fdplqvebauivtlywornw'
tok = os.environ.get('SUPABASE_ACCESS_TOKEN')
if not tok:
    tok = subprocess.run(['powershell.exe', '-NoProfile', '-Command', '[Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN","User")'], capture_output=True, text=True).stdout.strip()
sql = sys.argv[2] if sys.argv[1] == '-e' else open(sys.argv[1], encoding='utf-8').read()
req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{REF}/database/query', data=json.dumps({'query': sql}).encode(), headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req) as r: print(r.read().decode()[:2000])
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read().decode()[:2000]); sys.exit(1)
