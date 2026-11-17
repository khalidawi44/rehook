const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const CORAL = "#FF4D4D", DARK = "#15151C", BG = "#0B0B10", TXT = "#F2F2F5", MUTED = "#9A9AA6";
const st = (c, w) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
// Glyphe A2 : hameçon incliné avec œillet et ardillon (viewBox 512)
const hook = (c) => `<g transform="rotate(-18 256 256)"><circle cx="318" cy="92" r="34" ${st(c, 44)}/><path d="M318 126 V300 A98 98 0 0 1 122 300 V222" ${st(c, 62)}/><path d="M122 262 L176 288" ${st(c, 52)}/></g>`;
const play = (c) => `<path d="M256 60 V130" ${st(c, 52)}/><path d="M256 130 V312 A84 84 0 0 1 88 312 V250" ${st(c, 52)}/><path d="M88 284 L134 306" ${st(c, 44)}/><path d="M300 150 L430 240 L300 330 Z" fill="${c}"/>`;
const square = (fill, rx = 112) => `<rect width="512" height="512" rx="${rx}" fill="${fill}"/>`;
const svg = (w, h, body, vb = `0 0 ${w} ${h}`) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${body}</svg>`;
const files = {
  "icone.svg": svg(512, 512, square(DARK) + hook(CORAL), "0 0 512 512"),
  "icone-corail.svg": svg(512, 512, square(CORAL) + hook("#FFFFFF"), "0 0 512 512"),
  "icone-alternative-play.svg": svg(512, 512, square(DARK) + play(CORAL), "0 0 512 512"),
  "hameçon.svg": svg(512, 512, hook(CORAL), "0 0 512 512"),
  "hameçon-blanc.svg": svg(512, 512, hook("#FFFFFF"), "0 0 512 512"),
  "maskable.svg": svg(512, 512, `<rect width="512" height="512" fill="${DARK}"/><g transform="translate(76 76) scale(0.70)">${hook(CORAL)}</g>`, "0 0 512 512"),
  "logo-sombre.svg": svg(1600, 440, `<rect width="1600" height="440" fill="${BG}"/><g transform="translate(40 20) scale(0.78)">${hook(CORAL)}</g><text x="470" y="222" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="220" fill="${TXT}" dominant-baseline="middle">rehooked</text>`),
  "logo-clair.svg": svg(1600, 440, `<rect width="1600" height="440" fill="#FFFFFF"/><g transform="translate(40 20) scale(0.78)">${hook(CORAL)}</g><text x="470" y="222" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="220" fill="${BG}" dominant-baseline="middle">rehooked</text>`),
  "opengraph-1200x630.svg": svg(1200, 630, `<rect width="1200" height="630" fill="${BG}"/><g transform="translate(90 140) scale(0.68)">${hook(CORAL)}</g><text x="470" y="290" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="120" fill="${TXT}">rehooked</text><text x="470" y="380" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="31" fill="${MUTED}">Trouve ce qui explose. Refais-le. Publie partout.</text>`),
  "entete-x-1500x500.svg": svg(1500, 500, `<rect width="1500" height="500" fill="${BG}"/><g transform="translate(140 90) scale(0.62)">${hook(CORAL)}</g><text x="520" y="245" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="104" fill="${TXT}">rehooked</text><text x="520" y="320" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="34" fill="${MUTED}">Trouve ce qui explose. Refais-le. Publie partout.</text>`),
  "banniere-youtube-2560x1440.svg": svg(2560, 1440, `<rect width="2560" height="1440" fill="${BG}"/><g transform="translate(1024 330) scale(1.0)">${hook(CORAL)}</g><text x="1280" y="980" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="190" fill="${TXT}">rehooked</text><text x="1280" y="1080" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="56" fill="${MUTED}">Trouve ce qui explose. Refais-le. Publie partout.</text>`),
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT, name), body);
    const m = body.match(/width="(\d+)" height="(\d+)"/); const w = +m[1], h = +m[2];
    const sizes = name.startsWith("icone") || name.startsWith("hameçon") || name.startsWith("maskable") ? [512, 1024] : [w];
    for (const s of sizes) {
      const scale = s / w;
      await p.setViewportSize({ width: Math.round(w * scale), height: Math.round(h * scale) });
      await p.setContent(`<html><body style="margin:0;background:transparent">${body.replace(/width="\d+" height="\d+"/, `width="${Math.round(w*scale)}" height="${Math.round(h*scale)}"`)}</body></html>`);
      await p.waitForTimeout(150);
      const png = name.replace(".svg", sizes.length > 1 ? `-${s}.png` : ".png");
      await p.screenshot({ path: path.join(OUT, png), omitBackground: true });
    }
  }
  await b.close(); console.log("OK", fs.readdirSync(OUT).length, "fichiers");
})();
