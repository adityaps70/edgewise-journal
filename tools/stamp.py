"""Give every deploy its own asset URLs so browsers never mix old and new files.
Run before each commit:  python3 tools/stamp.py"""
import hashlib, pathlib, re
pub = pathlib.Path(__file__).resolve().parent.parent / 'public'
JS = re.compile(r"(['\"])\./([A-Za-z0-9_-]+)\.js(?:\?v=[A-Za-z0-9]*)?\1")
HT = re.compile(r"((?:src|href)=\")(js/[A-Za-z0-9_-]+\.js|[A-Za-z0-9_-]+\.css)(?:\?v=[A-Za-z0-9]*)?\"")
files = sorted([*pub.glob('js/*.js'), *pub.glob('*.css'), *pub.glob('*.html'), *pub.glob('data/*.json')])
h = hashlib.sha1()
for f in files:  # hash with stamps removed, so the version only changes when real content does
    t = f.read_text(); t = JS.sub(lambda m: f"{m[1]}./{m[2]}.js{m[1]}", t); t = HT.sub(lambda m: f'{m[1]}{m[2]}"', t); h.update(t.encode())
v = h.hexdigest()[:8]
for f in files:
    t = f.read_text(); n = t
    if f.suffix == '.js': n = JS.sub(lambda m: f"{m[1]}./{m[2]}.js?v={v}{m[1]}", t)
    if f.suffix == '.html': n = HT.sub(lambda m: f'{m[1]}{m[2]}?v={v}"', t)
    if n != t: f.write_text(n)
(pub / 'js' / 'version.txt').write_text(v)
print('version', v)
