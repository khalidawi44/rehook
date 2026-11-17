#!/usr/bin/env python3
"""Logo Rehooked : hameçon en trait continu qui se referme en boucle, corail sur fond sombre.
python3 make-logo.py  ->  icone (512, 1024), logo horizontal, bannieres reseaux, icone PWA."""
import math, os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
BG, SURF, CORAL, TXT, MUTED = (11, 11, 16), (21, 21, 28), (255, 77, 77), (242, 242, 245), (154, 154, 166)
INTER_B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
INTER_M = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
if not os.path.exists(INTER_B):
    INTER_B = INTER_M = os.path.join(OUT, "..", "..", "data", "public", "fonts", "Anton-Regular.ttf")

def font(p, s):
    try:
        return ImageFont.truetype(p, s)
    except Exception:
        return ImageFont.load_default()

def hook(size, color, bg=None, pad=0.14, stroke=None):
    """Hameçon en trait continu : œillet en haut (la boucle du « re »), tige, courbe en U, pointe avec ardillon."""
    S = 4  # sur-échantillonnage pour des bords nets
    s = size * S
    img = Image.new("RGBA", (s, s), (bg + (255,)) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w = int((stroke * S) if stroke else s * 0.062)
    box = s * (1 - 2 * pad)
    x0, y0 = s * pad, s * pad
    r_u = box * 0.27          # rayon de la courbe
    cx = x0 + box * 0.68      # tige (côté droit)
    r_eye = box * 0.11        # œillet
    def dot(x, y):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=color)
    # œillet
    d.ellipse([cx - r_eye, y0, cx + r_eye, y0 + 2 * r_eye], outline=color, width=w)
    # tige
    cy = y0 + box - r_u
    d.line([(cx, y0 + 2 * r_eye - w / 2), (cx, cy)], fill=color, width=w)
    # courbe en U, de la tige (droite) vers la pointe (gauche), par le bas
    d.arc([cx - 2 * r_u, cy - r_u, cx, cy + r_u], start=0, end=180, fill=color, width=w)
    # pointe qui remonte
    px = cx - 2 * r_u
    tip = cy - r_u * 0.95
    d.line([(px, cy), (px, tip)], fill=color, width=w)
    dot(px, tip)
    # ardillon : petit trait oblique vers l'intérieur, sous la pointe
    d.line([(px, tip + r_u * 0.28), (px + r_u * 0.34, tip + r_u * 0.55)], fill=color, width=int(w * 0.85))
    dot(px + r_u * 0.34, tip + r_u * 0.55)
    return img.resize((size, size), Image.LANCZOS)

def rounded_bg(size, radius_ratio=0.22, color=SURF):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=color + (255,))
    return img

# Icones : trait corail sur fond sombre arrondi, et version monochrome sur transparent
for size in (512, 1024):
    base = rounded_bg(size)
    base.alpha_composite(hook(size, CORAL))
    base.save(os.path.join(OUT, f"icone-{size}.png"))
    hook(size, CORAL).save(os.path.join(OUT, f"hameçon-{size}.png"))
    hook(size, (255, 255, 255)).save(os.path.join(OUT, f"hameçon-blanc-{size}.png"))
# PWA maskable 512 (marge plus grande)
m = Image.new("RGBA", (512, 512), SURF + (255,))
m.alpha_composite(hook(512, CORAL, pad=0.24))
m.save(os.path.join(OUT, "maskable-512.png"))

# Logo horizontal : hameçon + « rehooked »
for (bg, txt, name) in [(BG, TXT, "logo-sombre.png"), ((255, 255, 255), (11, 11, 16), "logo-clair.png")]:
    W, H = 1600, 440
    img = Image.new("RGBA", (W, H), bg + (255,))
    img.alpha_composite(hook(360, CORAL), (60, 40))
    d = ImageDraw.Draw(img)
    d.text((440, H // 2), "rehooked", font=font(INTER_B, 220), fill=txt, anchor="lm")
    img.convert("RGB").save(os.path.join(OUT, name))

# Bannieres : X 1500x500, YouTube 2560x1440, OpenGraph 1200x630
def banner(w, h, name, title, sub):
    img = Image.new("RGBA", (w, h), BG + (255,))
    d = ImageDraw.Draw(img)
    hs = int(h * 0.55)
    img.alpha_composite(hook(hs, CORAL), (int(w * 0.08), (h - hs) // 2))
    d.text((int(w * 0.08) + hs + int(w * 0.03), int(h * 0.44)), title, font=font(INTER_B, int(h * 0.19)), fill=TXT, anchor="lm")
    d.text((int(w * 0.08) + hs + int(w * 0.03), int(h * 0.64)), sub, font=font(INTER_M, int(h * 0.052)), fill=MUTED, anchor="lm")
    img.convert("RGB").save(os.path.join(OUT, name))
banner(1500, 500, "entete-x-1500x500.png", "rehooked", "Trouve ce qui explose. Refais-le. Publie partout.")
banner(1200, 630, "opengraph-1200x630.png", "rehooked", "Le radar et l'atelier des vidéos courtes.")
yt = Image.new("RGBA", (2560, 1440), BG + (255,))
yt.alpha_composite(hook(520, CORAL), (1020, 300))
d = ImageDraw.Draw(yt)
d.text((1280, 900), "rehooked", font=font(INTER_B, 200), fill=TXT, anchor="mm")
d.text((1280, 1040), "Trouve ce qui explose. Refais-le. Publie partout.", font=font(INTER_M, 60), fill=MUTED, anchor="mm")
yt.convert("RGB").save(os.path.join(OUT, "banniere-youtube-2560x1440.png"))
# Palette de reference
pal = Image.new("RGB", (1200, 300), BG)
d = ImageDraw.Draw(pal)
for i, (c, label) in enumerate([(BG, "fond #0B0B10"), (SURF, "surface #15151C"), (CORAL, "accent #FF4D4D"), (TXT, "texte #F2F2F5"), (MUTED, "secondaire #9A9AA6"), ((34, 197, 94), "succès #22C55E")]):
    d.rectangle([i * 200, 0, i * 200 + 199, 220], fill=c)
    d.text((i * 200 + 100, 260), label, font=font(INTER_M, 22), fill=TXT, anchor="mm")
pal.save(os.path.join(OUT, "palette.png"))
print("OK :", OUT)
