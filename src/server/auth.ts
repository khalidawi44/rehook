// Accès par mot de passe (NICHE_PASSWORD), indispensable quand Niche est sur Internet.
// Cookie signé, page de connexion simple, API en 401 JSON.
import crypto from "node:crypto";
import type express from "express";

const PASSWORD = process.env.NICHE_PASSWORD?.trim() || "";
const COOKIE = "niche_session";
const secret = crypto.createHash("sha256").update("niche:" + PASSWORD).digest();
const token = () => crypto.createHmac("sha256", secret).update("ok").digest("hex");

const PUBLIC = [/^\/login$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//, /^\/favicon/];

function parseCookies(h: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (h ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function authEnabled() {
  return PASSWORD.length > 0;
}

const page = (error = "") => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Niche</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#e4e4e7;font-family:system-ui,sans-serif}
form{width:min(360px,90vw);background:#18181b;border:1px solid #27272a;border-radius:16px;padding:28px}
h1{display:flex;align-items:center;gap:10px;font-size:22px;margin:0 0 18px}h1 span{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#22c55e;color:#000;font-weight:900}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #3f3f46;background:#09090b;color:#fff;font-size:16px}
button{margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:#22c55e;color:#000;font-weight:700;font-size:16px}
p.err{color:#fca5a5;font-size:14px}</style></head><body>
<form method="post" action="/login"><h1><span>N</span>Niche</h1>${error ? `<p class="err">${error}</p>` : ""}
<input type="password" name="password" placeholder="Mot de passe" autofocus autocomplete="current-password"><button>Entrer</button></form></body></html>`;

export function installAuth(app: express.Express) {
  if (!authEnabled()) return;
  app.get("/login", (_req, res) => res.type("html").send(page()));
  app.post("/login", (req, res) => {
    const given = String((req.body as { password?: string })?.password ?? "");
    if (given.length !== PASSWORD.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(PASSWORD))) {
      return res.status(401).type("html").send(page("Mot de passe incorrect."));
    }
    res.cookie(COOKIE, token(), { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 180 * 24 * 3600 * 1000, path: "/" });
    res.redirect("/");
  });
  app.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE, { path: "/" });
    res.redirect("/login");
  });
  app.use((req, res, next) => {
    if (PUBLIC.some((re) => re.test(req.path))) return next();
    const c = parseCookies(req.headers.cookie);
    if (c[COOKIE] && c[COOKIE] === token()) return next();
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Connexion requise" });
    res.redirect("/login");
  });
}
