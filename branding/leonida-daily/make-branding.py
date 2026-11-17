#!/usr/bin/env python3
"""Identité visuelle d'une chaîne (avatar, bannières, visuel d'annonce) : python3 make-branding.py "Leonida Daily" leonidadaily
Style néon et coucher de soleil, aucune marque ni logo tiers. Sorties dans le dossier courant/sortie/."""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

NAME = sys.argv[1] if len(sys.argv) > 1 else "Leonida Daily"
HANDLE = sys.argv[2] if len(sys.argv) > 2 else "leonidadaily"
TAG = sys.argv[3] if len(sys.argv) > 3 else "GTA 6 en français, tous les jours"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sortie")
os.makedirs(OUT, exist_ok=True)
FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "public", "fonts")
ANTON = os.path.join(FONTS, "Anton-Regular.ttf")
INTER = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
if not os.path.exists(INTER):
    INTER = ANTON

PINK, CYAN, ORANGE, PURPLE, DEEP = (255, 45, 149), (25, 211, 255), (255, 138, 61), (118, 46, 214), (14, 6, 32)

def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def gradient(w, h, top, bottom):
    img = Image.new("RGB", (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img

def sun(draw, cx, cy, r):
    # Soleil couchant rayé, de l'orange au rose.
    for i in range(r, 0, -2):
        t = 1 - i / r
        c = tuple(int(ORANGE[k] * (1 - t) + PINK[k] * t) for k in range(3))
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=c)
    for k in range(5):
        y = cy + r * 0.15 + k * r * 0.17
        draw.rectangle([cx - r, y, cx + r, y + max(2, r * 0.035 * (k + 1))], fill=DEEP)

def grid(draw, w, h, y0, color):
    # Sol en perspective (grille) sous l'horizon.
    for i in range(0, 25):
        y = y0 + int((h - y0) * (i / 24) ** 2)
        draw.line([(0, y), (w, y)], fill=color, width=2)
    for i in range(-12, 13):
        x_h = w / 2 + i * w / 12
        x_b = w / 2 + i * w / 3
        draw.line([(x_h, y0), (x_b, h)], fill=color, width=2)

def palms(draw, w, h, y0, n=5):
    import random
    random.seed(7)
    for i in range(n):
        x = int(w * (0.08 + 0.84 * i / max(1, n - 1)) + random.randint(-40, 40))
        if 0.28 * w < x < 0.72 * w:
            continue  # on laisse le centre libre pour le texte
        base = y0 + 8
        top = base - int(h * 0.22) - random.randint(0, int(h * 0.08))
        draw.line([(x, base), (x + 14, top)], fill=DEEP, width=max(6, w // 160))
        for a in range(-150, 31, 36):
            ang = math.radians(a)
            L = int(h * 0.11)
            draw.line([(x + 14, top), (x + 14 + int(L * math.cos(ang)), top + int(L * math.sin(ang)) + int(L * 0.25))], fill=DEEP, width=max(5, w // 220))

def neon_text(img, text, f, xy, fill, glow, anchor="mm"):
    glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    gd.text(xy, text, font=f, fill=glow + (200,), anchor=anchor)
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(max(4, f.size // 12)))
    img.alpha_composite(glow_layer)
    d = ImageDraw.Draw(img)
    d.text(xy, text, font=f, fill=fill, anchor=anchor)

def scene(w, h, horizon=0.62):
    img = gradient(w, h, (34, 6, 70), (255, 70, 120))
    d = ImageDraw.Draw(img)
    y0 = int(h * horizon)
    sun(d, w // 2, y0 - int(h * 0.02), int(min(w, h) * 0.28))
    d.rectangle([0, y0, w, h], fill=DEEP)
    grid(d, w, h, y0, (118, 46, 214))
    palms(d, w, h, y0)
    return img.convert("RGBA")

# 1. Avatar carré (TikTok, Instagram, YouTube, X, Snap)
S = 1080
av = scene(S, S, horizon=0.66)
neon_text(av, NAME.split(" ")[0].upper(), font(ANTON, 270 if len(NAME.split(" ")[0]) <= 7 else 200), (S // 2, int(S * 0.40)), (255, 255, 255), PINK)
if len(NAME.split(" ")) > 1:
    neon_text(av, " ".join(NAME.split(" ")[1:]).upper(), font(ANTON, 120), (S // 2, int(S * 0.62)), CYAN, CYAN)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).ellipse([0, 0, S, S], fill=255)
round_av = Image.new("RGBA", (S, S), (0, 0, 0, 0))
round_av.paste(av, (0, 0), mask)
av.convert("RGB").save(os.path.join(OUT, "avatar-1080.png"))
round_av.save(os.path.join(OUT, "avatar-rond-1080.png"))

# 2. Bannière YouTube 2560x1440 (zone sûre centrale 1546x423)
W, H = 2560, 1440
yt = scene(W, H, horizon=0.60)
neon_text(yt, NAME.upper(), font(ANTON, 230), (W // 2, int(H * 0.44)), (255, 255, 255), PINK)
neon_text(yt, TAG, font(INTER, 64), (W // 2, int(H * 0.56)), CYAN, CYAN)
neon_text(yt, f"@{HANDLE}  ·  TikTok  ·  YouTube  ·  Instagram  ·  X  ·  Snap", font(INTER, 40), (W // 2, int(H * 0.62)), (255, 255, 255), PURPLE)
yt.convert("RGB").save(os.path.join(OUT, "banniere-youtube-2560x1440.png"))

# 3. En-tête X 1500x500 et couverture Facebook 1640x624
for (w, h, name) in [(1500, 500, "entete-x-1500x500.png"), (1640, 624, "couverture-facebook-1640x624.png")]:
    b = scene(w, h, horizon=0.68)
    neon_text(b, NAME.upper(), font(ANTON, int(h * 0.34)), (w // 2, int(h * 0.40)), (255, 255, 255), PINK)
    neon_text(b, TAG, font(INTER, int(h * 0.09)), (w // 2, int(h * 0.68)), CYAN, CYAN)
    b.convert("RGB").save(os.path.join(OUT, name))

# 4. Visuel d'annonce vertical 1080x1920 (TikTok, Reels, Shorts, Snap) et carré 1080x1350
for (w, h, name) in [(1080, 1920, "annonce-1080x1920.png"), (1080, 1350, "annonce-1080x1350.png")]:
    a = scene(w, h, horizon=0.58)
    neon_text(a, "J-2", font(ANTON, int(h * 0.20)), (w // 2, int(h * 0.20)), (255, 255, 255), PINK)
    neon_text(a, "19 NOVEMBRE", font(ANTON, int(h * 0.075)), (w // 2, int(h * 0.33)), CYAN, CYAN)
    neon_text(a, NAME.upper(), font(ANTON, int(h * 0.07)), (w // 2, int(h * 0.70)), (255, 255, 255), PINK)
    neon_text(a, TAG, font(INTER, int(h * 0.028)), (w // 2, int(h * 0.76)), CYAN, CYAN)
    neon_text(a, f"@{HANDLE}", font(INTER, int(h * 0.03)), (w // 2, int(h * 0.93)), (255, 255, 255), PURPLE)
    a.convert("RGB").save(os.path.join(OUT, name))
# 5. Twitch : bannière de profil 1200x480, écran hors ligne et « ça commence » 1920x1080, panneaux 320x100, cadre webcam
tb = scene(1200, 480, horizon=0.68)
neon_text(tb, NAME.upper(), font(ANTON, 170), (600, 190), (255, 255, 255), PINK)
neon_text(tb, "LIVE : " + TAG, font(INTER, 44), (600, 330), CYAN, CYAN)
tb.convert("RGB").save(os.path.join(OUT, "twitch-banniere-1200x480.png"))
for (title, sub, name) in [("HORS LIGNE", "Prochain live : voir le planning sur le profil", "twitch-hors-ligne-1920x1080.png"), ("ÇA COMMENCE", "Installe-toi, on démarre dans quelques minutes", "twitch-ca-commence-1920x1080.png"), ("PAUSE", "De retour dans 5 minutes", "twitch-pause-1920x1080.png")]:
    sc = scene(1920, 1080, horizon=0.60)
    neon_text(sc, title, font(ANTON, 260), (960, 400), (255, 255, 255), PINK)
    neon_text(sc, sub, font(INTER, 54), (960, 600), CYAN, CYAN)
    neon_text(sc, NAME.upper() + "  ·  @" + HANDLE, font(INTER, 42), (960, 980), (255, 255, 255), PURPLE)
    sc.convert("RGB").save(os.path.join(OUT, name))
for (label, name) in [("À PROPOS", "twitch-panneau-a-propos.png"), ("PLANNING", "twitch-panneau-planning.png"), ("RÉSEAUX", "twitch-panneau-reseaux.png"), ("RÈGLES DU CHAT", "twitch-panneau-regles.png")]:
    pn = gradient(320, 100, (60, 10, 110), (255, 45, 149)).convert("RGBA")
    neon_text(pn, label, font(ANTON, 48), (160, 50), (255, 255, 255), PINK)
    pn.convert("RGB").save(os.path.join(OUT, name))
# Cadre d'habillage 1920x1080 : centre transparent (le jeu ou la caméra dessous), bandeau bas avec le nom
fr = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
d = ImageDraw.Draw(fr)
for i in range(14, 0, -1):
    c = PINK if i % 2 else CYAN
    d.rectangle([i, i, 1919 - i, 1079 - i], outline=c + (int(90 + 165 * (1 - i / 14)),), width=1)
d.rectangle([0, 1000, 1920, 1080], fill=DEEP + (235,))
neon_text(fr, NAME.upper(), font(ANTON, 54), (960, 1040), (255, 255, 255), PINK)
neon_text(fr, "@" + HANDLE, font(INTER, 30), (1700, 1040), CYAN, CYAN)
fr.save(os.path.join(OUT, "cadre-overlay-1920x1080.png"))
print("OK :", OUT)
