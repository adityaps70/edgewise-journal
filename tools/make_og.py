"""Draw a 1200x630 share image for each blog post into public/blog/og/<slug>.png.

Needs Pillow (pip install pillow). Run after adding or renaming a post:
    python3 tools/make_og.py
"""
import json, pathlib, re, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'tools' / 'blog', ROOT / 'public' / 'blog' / 'og'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
REG = '/System/Library/Fonts/Supplemental/Arial.ttf'
W, H = 1200, 630
BG, INK, MUTED, RED = (5, 6, 8), (243, 244, 247), (146, 152, 166), (255, 48, 72)


def card(title, tag):
    im = Image.new('RGB', (W, H), BG)
    glow = Image.new('RGB', (W, H), BG)
    ImageDraw.Draw(glow).ellipse((700, -260, 1400, 380), fill=(120, 14, 30))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(120)), 0.9)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 14, H), fill=RED)
    d.text((72, 64), 'THE', font=ImageFont.truetype(BOLD, 18), fill=MUTED)
    d.text((72, 84), 'Smart', font=ImageFont.truetype(BOLD, 34), fill=INK)
    d.text((72 + d.textlength('Smart', font=ImageFont.truetype(BOLD, 34)), 84), 'Trade', font=ImageFont.truetype(BOLD, 34), fill=RED)
    size = 62 if len(title) < 60 else 52
    f = ImageFont.truetype(BOLD, size)
    lines = textwrap.wrap(title, width=int(1040 / (size * 0.52)))[:4]
    y = 200
    for ln in lines:
        d.text((72, y), ln, font=f, fill=INK)
        y += int(size * 1.18)
    small = ImageFont.truetype(REG, 26)
    d.text((72, H - 84), tag, font=small, fill=MUTED)
    d.text((W - 72 - d.textlength('thesmarttrade.in/blog', font=small), H - 84), 'thesmarttrade.in/blog', font=small, fill=RED)
    return im


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob('*.html')):
        meta = json.loads(re.match(r'<!--meta\s*(\{.*?\})\s*-->', f.read_text(), re.S)[1])
        title = meta.get('og_title') or meta['h1'].split(':')[0]
        card(title[0].upper() + title[1:], 'Prop firm guide · ' + str(meta['minutes']) + ' min read').save(OUT / f'{f.stem}.png', optimize=True)
        print('og', f.stem)
