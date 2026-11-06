// Rappels Telegram avant une publication programmée (30 min avant).
import { db, now } from "./db.js";
import { sendTelegram } from "./alerts.js";

db.exec(`CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  due_at INTEGER NOT NULL,
  message TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0
)`);

export function addReminder(dueAt: number, message: string) {
  if (dueAt <= now()) return;
  db.prepare("INSERT INTO reminders(due_at, message) VALUES(?, ?)").run(dueAt, message);
}

export function listReminders() {
  return db.prepare("SELECT * FROM reminders WHERE sent = 0 ORDER BY due_at ASC").all() as { id: number; due_at: number; message: string }[];
}

setInterval(() => {
  const due = db.prepare("SELECT * FROM reminders WHERE sent = 0 AND due_at <= ?").all(now()) as { id: number; message: string }[];
  for (const r of due) {
    void sendTelegram(r.message);
    db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(r.id);
  }
}, 60_000).unref();
