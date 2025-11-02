// qr.js
import express from "express";
import { Server as IOServer } from "socket.io";
import fs from "fs";
import path from "path";
import Pino from "pino";
import archiver from "archiver";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

const router = express.Router();
const logger = Pino({ level: "info" });

let io; // socket.io instance
let latestQr = null;
let connectionStatus = "init";

// --- Attach socket.io from index.js ---
export function setSocket(server) {
  io = new IOServer(server);

  io.on("connection", (socket) => {
    logger.info("🖥️ Client connected to Socket.IO");
    socket.emit("qr", latestQr);
    socket.emit("status", connectionStatus);
  });

  startWhatsApp().catch((err) => logger.error(err));
}

// --- Utility: encode buffers for JSON ---
function encodeBuffers(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Buffer.isBuffer(obj)) return { type: "Buffer", data: obj.toString("base64") };
  if (obj.type === "Buffer" && obj.data !== undefined) {
    if (Array.isArray(obj.data)) return { type: "Buffer", data: Buffer.from(obj.data).toString("base64") };
    if (typeof obj.data === "string") return { type: "Buffer", data: obj.data };
  }
  const result = Array.isArray(obj) ? [] : {};
  for (const key in obj) result[key] = encodeBuffers(obj[key]);
  return result;
}

// --- Validate creds.json fields ---
function validateCreds(creds) {
  const required = [
    "noiseKey",
    "pairingEphemeralKeyPair",
    "signedIdentityKey",
    "signedPreKey",
    "advSecretKey",
    "me",
    "signalIdentities",
    "platform",
    "myAppStateKeyId",
  ];
  const missing = required.filter((k) => !(k in creds));
  return { valid: missing.length === 0, missing };
}

// --- Empty folder ---
function emptyFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return;
  const files = fs.readdirSync(folderPath);
  for (const file of files) {
    const fullPath = path.join(folderPath, file);
    if (fs.lstatSync(fullPath).isFile()) fs.unlinkSync(fullPath);
  }
}

// --- Main WhatsApp logic ---
async function startWhatsApp() {
  const sessionFolder = path.resolve("./src/session");
  fs.mkdirSync(sessionFolder, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const waSocket = makeWASocket({
    auth: state,
    version,
    logger,
    printQRInTerminal: false,
    browser: ["Mega-MD", "Chrome", "1.0.0"],
  });

  waSocket.ev.on("creds.update", saveCreds);

  waSocket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      connectionStatus = "qr";
      io.emit("qr", qr);
      io.emit("status", connectionStatus);
      logger.info("📸 QR emitted to frontend");
    }

    if (connection) {
      connectionStatus = connection;
      io.emit("status", connectionStatus);
      logger.info("🔌 Connection status:", connection);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      logger.warn("⚠️ Connection closed:", reason);
      if (reason === DisconnectReason.loggedOut) {
        logger.warn("🪶 Logged out — clearing session.");
      }
      setTimeout(() => startWhatsApp().catch((err) => logger.error(err)), 2500);
    }

    if (connection === "open") {
      latestQr = null;
      io.emit("qr", null);
      connectionStatus = "open";
      io.emit("status", connectionStatus);
      logger.info("✅ Connected to WhatsApp successfully");

      try {
        await new Promise((resolve) => setTimeout(resolve, 2500));

        if (!state?.creds) return logger.warn("❌ state.creds not found — skipping save");

        state.creds.registered = true;
        const finalCreds = encodeBuffers(state.creds);
        const { valid, missing } = validateCreds(finalCreds);
        if (!valid) logger.warn(`⚠️ Missing fields in creds.json: ${missing.join(", ")}`);

        // --- Save creds.json ---
        const credsPath = path.join(sessionFolder, "creds.json");
        fs.writeFileSync(credsPath, JSON.stringify(finalCreds, null, 2), "utf8");
        logger.info("📦 Saved valid creds.json successfully.");

        // --- Zip session folder ---
        const zipPath = path.join(sessionFolder, "Mega-MD-session.zip");
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.pipe(output);
        archive.directory(sessionFolder, false);
        await archive.finalize();
        logger.info("🗜️ Session folder zipped successfully.");

        output.on("close", async () => {
          const targetId = waSocket?.user?.id || state.creds?.me?.id;
          if (!targetId) return logger.warn("No valid target JID found — skipping send");

          const zipFile = fs.readFileSync(zipPath);
          const sentDoc = await waSocket.sendMessage(targetId, {
            document: zipFile,
            mimetype: "application/zip",
            fileName: "Mega-MD-session.zip",
          });

          const infoText = `> *ᴍᴇɢᴀ-ᴍᴅ ɪᴅ ᴏʙᴛᴀɪɴᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*
📁 Upload the zip in your folder.

Telegram: t.me/LordMega0
WhatsApp: https://wa.me/256783991705
Do not share with anyone.`;

          await waSocket.sendMessage(
            targetId,
            {
              text: infoText,
              contextInfo: {
                externalAdReply: {
                  title: "Mega-MD Session Ready",
                  body: "Session Generator",
                  thumbnailUrl: "https://files.catbox.moe/c29z2z.jpg",
                  sourceUrl: "https://wa.me/256783991705",
                  mediaType: 1,
                  renderLargerThumbnail: true,
                  showAdAttribution: true,
                },
              },
            },
            { quoted: sentDoc }
          );

          // --- Clear session folder ---
          emptyFolder(sessionFolder);
          logger.info("🗑️ Session folder cleared.");
        });
      } catch (err) {
        logger.error("❌ Error during session save/send:", err);
      }
    }
  });

  // --- Ping response ---
  waSocket.ev.on("messages.upsert", async (m) => {
    const messages = m.messages || [];
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      if (text === "!ping") {
        await waSocket.sendMessage(jid, { text: "Pong from Mega-MD Web!" });
      }
    }
  });
}

// --- Router endpoint ---
router.get("/", (req, res) => {
  res.json({ status: "Mega-MD QR endpoint running" });
});

export default router;
