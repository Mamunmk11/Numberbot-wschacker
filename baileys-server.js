const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode");
const fs = require("fs");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const AUTH_BASE = process.env.AUTH_DIR || "./wa_auth";

const sessions = {};

async function connectWA(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      sock: null,
      isConnected: false,
      currentQR: null,
      isReconnecting: false,
    };
  }

  const session = sessions[userId];
  if (session.isReconnecting) return;
  session.isReconnecting = true;

  try {
    const authDir = `${AUTH_BASE}/${userId}`;
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    session.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "22.04.4"],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 20000,
    });

    session.sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        session.currentQR = qr;
        session.isConnected = false;
        console.log(`[${userId}] QR ready`);
      }

      if (connection === "open") {
        session.isConnected = true;
        session.currentQR = null;
        session.isReconnecting = false;
        console.log(`✅ [${userId}] WhatsApp Connected!`);
      }

      if (connection === "close") {
        session.isConnected = false;
        session.isReconnecting = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut || code === 401;
        console.log(`❌ [${userId}] Disconnected (code: ${code})`);

        if (!loggedOut) {
          setTimeout(() => connectWA(userId), 5000);
        } else {
          console.log(`🚫 [${userId}] Logged out — clearing auth`);
          try {
            const authDir = `${AUTH_BASE}/${userId}`;
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch {}
          delete sessions[userId];
        }
      }
    });

    session.sock.ev.on("creds.update", saveCreds);
  } catch (e) {
    console.error(`connectWA error [${userId}]:`, e.message);
    session.isReconnecting = false;
    setTimeout(() => connectWA(userId), 10000);
  }
}

app.get("/status", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const session = sessions[userId];
  res.json({ connected: session?.isConnected || false, hasQR: !!(session?.currentQR) });
});

app.post("/start", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (!sessions[userId] || !sessions[userId].sock) await connectWA(userId);
  res.json({ started: true });
});

app.post("/pair", async (req, res) => {
  const { phone, userId } = req.body;
  if (!phone || !userId) return res.status(400).json({ error: "phone and userId required" });
  const session = sessions[userId];
  if (!session) return res.status(503).json({ error: "Session not started" });
  if (session.isConnected) return res.json({ connected: true });
  if (!session.sock) return res.status(503).json({ error: "Socket not ready" });
  try {
    const digits = phone.replace(/\D/g, "");
    const code = await session.sock.requestPairingCode(digits);
    console.log(`🔑 [${userId}] Pairing code: ${code}`);
    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/check", async (req, res) => {
  const { numbers, userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const session = sessions[userId];
  if (!session?.isConnected || !session?.sock) return res.status(503).json({ error: "Not connected" });
  const results = {};
  for (const n of numbers) results[n] = false;
  try {
    const cleaned = numbers.map((n) => n.replace(/\D/g, ""));
    const waResults = await session.sock.onWhatsApp(...cleaned);
    if (Array.isArray(waResults)) {
      for (const r of waResults) {
        const num = r.jid.replace(/@s\.whatsapp\.net$/, "");
        const orig = numbers.find((n) => n.replace(/\D/g, "") === num);
        if (orig !== undefined) results[orig] = r.exists === true;
      }
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/disconnect", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const session = sessions[userId];
  try { if (session?.sock) await session.sock.logout(); } catch {}
  try { fs.rmSync(`${AUTH_BASE}/${userId}`, { recursive: true, force: true }); } catch {}
  delete sessions[userId];
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Baileys Multi-Session Server running on port ${PORT}`);
});