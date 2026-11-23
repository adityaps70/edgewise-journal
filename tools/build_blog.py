"""Build the static blog: public/blog/*.html, the blog index and sitemap.xml.

Posts live in tools/blog/<slug>.html. Each file starts with a JSON header between
<!--meta and -->, then the article body HTML. Firm tables are filled from
public/data/firms.json so the blog never disagrees with the app.

Run:  python3 tools/build_blog.py   (then python3 tools/stamp.py as usual)
"""
import html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
SRC = ROOT / 'tools' / 'blog'
OUT = PUB / 'blog'
SITE = 'https://thesmarttrade.in'


def ver(rel):
    """Short content hash, so a changed stylesheet gets a new URL and browsers can't serve a stale copy."""
    import hashlib
    return hashlib.sha1((PUB / rel).read_bytes()).hexdigest()[:8]
AUTHOR = {
    'name': 'Aditya Pratap Singh',
    'url': SITE + '/about',
    'bio': 'Aditya trades futures evaluations and funded accounts, and built The Smart Trade to track them: rules, drawdown, fees and payouts across every firm.',
}
EMAIL = 'support@thesmarttrade.in'
SHOTS = {
    'accounts': ('/brand/app-accounts.webp', 'Accounts view: drawdown buffer, breach level and target on each prop account, plus total fees vs payouts.'),
    'analytics': ('/brand/app-analytics.webp', 'Analytics view: rules kept vs broken, and the dollar cost of each mistake type.'),
    'overview': ('/brand/app-overview.webp', 'Overview: every account, today\'s safe risk and net P&L in one screen.'),
}
FIRMS = json.loads((PUB / 'data' / 'firms.json').read_text())


def money(v):
    return '—' if v is None else f'${v:,.0f}'


def firm_table(kind):
    """Tables generated from the firms catalog. kind: 'drawdown' | 'consistency' | '50k'."""
    rows = []
    for f in FIRMS['firms']:
        for p in f['programs']:
            sizes = p['sizes']
            s = next((x for x in sizes if x['size'] == 50000), None)
            if kind == '50k' and not s:
                continue
            name = f'<a href="{f["url"]}" rel="nofollow noopener" target="_blank">{html.escape(f["name"])}</a> · {html.escape(p["name"])}'
            if kind == 'drawdown':
                rows.append(f'<tr><td>{name}</td><td>{html.escape(p.get("ddNote") or p["ddType"])}</td><td>{money((s or sizes[0]).get("maxLoss"))} on {(s or sizes[0])["size"]//1000}K</td></tr>')
            elif kind == 'consistency':
                c = p.get('consistency')
                rows.append(f'<tr><td>{name}</td><td>{str(c) + "%" if c else "None listed"}</td><td>{p.get("minDays") if p.get("minDays") is not None else "—"}</td></tr>')
            elif kind == '50k':
                daily = s.get('daily') or s.get('fundedDaily')
                rows.append(
                    f'<tr><td>{name}</td><td>{money(s.get("price"))} {"/mo" if p["billing"] == "monthly" else "once"}</td>'
                    f'<td>{money(s.get("target"))}</td><td>{money(s.get("maxLoss"))}</td><td>{html.escape(p.get("ddNote") or "")}</td>'
                    f'<td>{money(daily) if daily else "None"}</td><td>{str(p["consistency"]) + "%" if p.get("consistency") else "—"}</td>'
                    f'<td>{money(p.get("activation")) if p.get("activation") else "$0"}</td><td>{p.get("split")}%</td></tr>')
    heads = {
        'drawdown': ['Firm · program', 'Drawdown type', 'Max loss'],
        'consistency': ['Firm · program', 'Consistency rule', 'Min. trading days'],
        '50k': ['Firm · program', 'Price', 'Target', 'Max loss', 'Drawdown', 'Daily limit', 'Consistency', 'Activation', 'Split'],
    }[kind]
    th = ''.join(f'<th>{h}</th>' for h in heads)
    return (f'<div class="tbl"><table><thead><tr>{th}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>'
            f'<p class="src">Source: The Smart Trade firm catalog, checked against each firm\'s public rules in {FIRMS["verified"]}. Rules change often, so confirm on the firm\'s site before you buy.</p>')


def shot(key):
    src, cap = SHOTS[key]
    return (f'<figure class="shot"><img src="{src}" alt="{html.escape(cap)}" width="1920" height="1200" loading="lazy" decoding="async">'
            f'<figcaption>{html.escape(cap)} (Demo data.)</figcaption></figure>')


def load_posts():
    posts = []
    for f in sorted(SRC.glob('*.html')):
        raw = f.read_text()
        m = re.match(r'<!--meta\s*(\{.*?\})\s*-->\s*', raw, re.S)
        meta = json.loads(m[1])
        body = raw[m.end():]
        body = re.sub(r'\{\{table:(\w+)\}\}', lambda mm: firm_table(mm[1]), body)
        body = re.sub(r'\{\{shot:(\w+)\}\}', lambda mm: shot(mm[1]), body)
        meta['slug'] = f.stem
        meta['body'] = body
        posts.append(meta)
    posts.sort(key=lambda p: (p['date'], -p.get('order', 0)), reverse=True)
    return posts


NAV = '''<header class="bnav">
  <a class="lnav__brand" href="/"><span class="mark mark--img"><img src="/brand/mark.svg" alt=""></span><span class="wm"><small>THE</small><b>Smart<i>Trade</i></b></span></a>
  <nav><a href="/blog/">Blog</a><a href="/about">About</a><a class="btn btn--primary" href="/app">Open journal</a></nav>
</header>'''

FOOT = '''<footer class="bfoot"><p>The Smart Trade is a journaling tool, not financial advice, and is not affiliated with any prop firm. Firm names belong to their owners. <a href="/">Home</a> · <a href="/blog/">Blog</a> · <a href="/about">About</a> · <a href="mailto:support@thesmarttrade.in">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></footer>'''


def page(title, desc, path, body, extra_head='', image=None, kind='article'):
    url = SITE + path
    t, d = html.escape(title), html.escape(desc)
    return f'''<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{t}</title>
  <meta name="description" content="{d}">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="{kind}">
  <meta property="og:site_name" content="The Smart Trade">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{t}">
  <meta property="og:description" content="{d}">
  <meta property="og:image" content="{SITE}{image or '/brand/og-1200x630.png'}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="{SITE}{image or '/brand/og-1200x630.png'}">
  <link rel="alternate" type="application/rss+xml" title="The Smart Trade blog" href="{SITE}/blog/feed.xml">
  <meta name="theme-color" content="#050608">
  <link rel="icon" type="image/svg+xml" href="/brand/mark.svg">
  <link rel="stylesheet" href="/styles.css?v={ver('styles.css')}">
  <link rel="stylesheet" href="/landing.css?v={ver('landing.css')}">
  <link rel="stylesheet" href="/blog/blog.css?v={ver('blog/blog.css')}">
{extra_head}</head>
<body class="blog">
{NAV}
{body}
{FOOT}
</body>
</html>
'''


def ld(obj):
    return '  <script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + '</script>\n'


def build_post(p, posts):
    path = f'/blog/{p["slug"]}'
    article = {
        '@context': 'https://schema.org', '@type': 'BlogPosting',
        'headline': p['h1'], 'description': p['description'], 'datePublished': p['date'], 'dateModified': p.get('updated', p['date']),
        'mainEntityOfPage': SITE + path, 'image': f'{SITE}/blog/og/{p["slug"]}.png',
        'author': {'@type': 'Person', 'name': AUTHOR['name'], 'url': AUTHOR['url']},
        'publisher': {'@type': 'Organization', 'name': 'The Smart Trade', 'logo': {'@type': 'ImageObject', 'url': SITE + '/brand/mark-512.png'}},
        'keywords': ', '.join(p['keywords']),
    }
    crumbs = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': SITE + '/blog/'},
        {'@type': 'ListItem', 'position': 3, 'name': p['h1'], 'item': SITE + path}]}
    head = ld(article) + ld(crumbs)
    if p.get('faq'):
        head += ld({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in p['faq']]})
    faq_html = ''
    if p.get('faq'):
        faq_html = '<h2 id="faq">FAQ</h2>' + ''.join(f'<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in p['faq'])
    related = [r for r in posts if r['slug'] in p.get('related', [])][:3]
    rel_html = ''.join(f'<a class="rcard" href="/blog/{r["slug"]}"><b>{html.escape(r["h1"])}</b><span>{html.escape(r["description"])}</span></a>' for r in related)
    date_txt = p['date'] if not p.get('updated') else f'{p["date"]} · updated {p["updated"]}'
    body = f'''<main class="post">
  <nav class="crumbs"><a href="/">Home</a> / <a href="/blog/">Blog</a></nav>
  <article>
    <h1>{html.escape(p["h1"])}</h1>
    <p class="meta">By <a href="/about" rel="author">{AUTHOR["name"]}</a> · <time datetime="{p["date"]}">{date_txt}</time> · {p["minutes"]} min read</p>
    <p class="lede">{p["lede"]}</p>
    {p["body"]}
    {faq_html}
    <div class="abox"><b>About the author</b><p>{AUTHOR["bio"]} <a href="/about">More about Aditya</a>.</p></div>
  </article>
  <aside class="cta">
    <b>Track every prop account in one place</b>
    <p>The Smart Trade loads your firm's rules, shows how far each account is from breaching, and tracks fees against payouts in your own currency. Start free.</p>
    <a class="btn btn--primary" href="/app">Start journaling free</a>
  </aside>
  {f'<section class="related"><h2>Keep reading</h2><div class="rgrid">{rel_html}</div></section>' if rel_html else ''}
</main>'''
    return page(p['title'], p['description'], path, body, head, image=f'/blog/og/{p["slug"]}.png')


def build_index(posts):
    cards = ''.join(
        f'<a class="pcard" href="/blog/{p["slug"]}"><small>{p["date"]} · {p["minutes"]} min</small><h2>{html.escape(p["h1"])}</h2><p>{html.escape(p["description"])}</p></a>'
        for p in posts)
    body = f'''<main class="post bindex">
  <h1>Prop firm trading blog</h1>
  <p class="lede">Plain-English guides to prop firm rules, drawdown, consistency, payouts and journaling, written for funded futures and forex traders.</p>
  <div class="plist">{cards}</div>
</main>'''
    head = ld({'@context': 'https://schema.org', '@type': 'Blog', 'name': 'The Smart Trade blog', 'url': SITE + '/blog/',
               'blogPost': [{'@type': 'BlogPosting', 'headline': p['h1'], 'url': f'{SITE}/blog/{p["slug"]}', 'datePublished': p['date']} for p in posts]})
    return page('Prop Firm Trading Blog: Rules, Drawdown & Payouts · The Smart Trade',
                'Guides for prop firm traders: trailing drawdown, consistency rules, firm comparisons, passing evaluations, ROI and trading journals.',
                '/blog/', body, head, kind='website')


def build_sitemap(posts):
    urls = [('/', '1.0', 'weekly'), ('/blog/', '0.8', 'weekly')]
    urls += [(f'/blog/{p["slug"]}', '0.7', 'monthly') for p in posts]
    urls += [('/about', '0.5', 'monthly'), ('/privacy', '0.2', 'yearly'), ('/terms', '0.2', 'yearly')]
    dates = {f'/blog/{p["slug"]}': p.get('updated', p['date']) for p in posts}
    newest = max(dates.values())
    items = ''.join(f'  <url><loc>{SITE}{u}</loc><lastmod>{dates.get(u, newest)}</lastmod><changefreq>{c}</changefreq><priority>{pr}</priority></url>\n' for u, pr, c in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{items}</urlset>\n'


def build_about():
    body = f"""<main class="post about">
  <h1>About The Smart Trade</h1>
  <p class="lede">The Smart Trade is a trading journal built for prop firm traders: several accounts, each with its own rules, fees and payouts.</p>
  <h2>Who builds it</h2>
  <p><strong>{AUTHOR["name"]}</strong> trades futures evaluations and funded accounts and builds The Smart Trade. The goal is simple: one place that shows how close every account is to breaching, and whether the fees you've paid are actually coming back as payouts.</p>
  <h2>What we believe</h2>
  <ul>
    <li><strong>Know your room.</strong> The distance to your drawdown floor matters more than your P&amp;L.</li>
    <li><strong>Count every fee.</strong> Failed evaluations, resets and activation fees are part of the real cost of prop trading.</li>
    <li><strong>Rules come from the source.</strong> Our firm rules are checked against each firm's public pages and dated. Every value stays editable because firms change rules often.</li>
    <li><strong>No firm deals.</strong> We aren't affiliated with any prop firm and don't earn commission from them.</li>
  </ul>
  <h2>How the blog is written</h2>
  <p>Our guides explain prop firm rules and journaling in plain English. Firm numbers come from the same dated rules catalog the app uses, and articles are reviewed and updated when rules change. Nothing here is financial advice.</p>
  <h2 id="contact">Contact</h2>
  <p>Questions, a rule we got wrong, or a firm you want added: email <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
</main>"""
    head = ld({'@context': 'https://schema.org', '@type': 'AboutPage', 'url': SITE + '/about',
               'mainEntity': {'@type': 'Organization', 'name': 'The Smart Trade', 'url': SITE + '/', 'email': EMAIL,
                              'logo': SITE + '/brand/mark-512.png',
                              'founder': {'@type': 'Person', 'name': AUTHOR['name'], 'url': AUTHOR['url'], 'description': AUTHOR['bio']}}})
    return page('About The Smart Trade · Trading journal for prop firm traders',
                'Who builds The Smart Trade, how our prop firm rules and guides are sourced, and how to contact us.', '/about', body, head, kind='website')


def build_rss(posts):
    from email.utils import format_datetime
    from datetime import datetime, timezone
    def d(s): return format_datetime(datetime.fromisoformat(s).replace(tzinfo=timezone.utc))
    items = ''.join(
        f'<item><title>{html.escape(p["h1"])}</title><link>{SITE}/blog/{p["slug"]}</link><guid>{SITE}/blog/{p["slug"]}</guid>'
        f'<pubDate>{d(p["date"])}</pubDate><description>{html.escape(p["description"])}</description></item>' for p in posts)
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>The Smart Trade blog</title><link>{SITE}/blog/</link>'
            f'<description>Guides for prop firm traders</description><language>en</language>{items}</channel></rss>\n')


if __name__ == '__main__':
    posts = load_posts()
    OUT.mkdir(exist_ok=True)
    for p in posts:
        (OUT / f'{p["slug"]}.html').write_text(build_post(p, posts))
    (OUT / 'index.html').write_text(build_index(posts))
    (PUB / 'sitemap.xml').write_text(build_sitemap(posts))
    (PUB / 'about.html').write_text(build_about())
    (OUT / 'feed.xml').write_text(build_rss(posts))
    print(f'built {len(posts)} posts')
