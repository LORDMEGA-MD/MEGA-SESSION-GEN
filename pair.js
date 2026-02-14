// pair.js
import express from "express";
import fs from "fs";
import pino from "pino";
import path from "path";
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";

const router = express.Router();

// Helper function
function removeFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
}

// Pair route
router.get("/", async (req, res) => {
  let num = req.query.number;

  if (!num || typeof num !== "string") {
    if (!res.headersSent) res.send({ error: "Missing or invalid ?number parameter" });
    return;
  }

  // Clean number → only digits (international format without +)
  num = num.replace(/[^0-9]/g, "");

  if (num.length < 10) {
    if (!res.headersSent) res.send({ error: "Number too short (use full international format without +)" });
    return;
  }

  async function Mega_MdPair() {
    const sessionDir = path.resolve("./src/session");
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,       // optional: faster connect
        markOnlineOnConnect: true,    // optional
      });

      // If already registered → shouldn't happen in fresh pairing but safety
      if (sock.authState.creds.registered) {
        console.log("Already registered — skipping pairing");
        if (!res.headersSent) res.send({ code: "Already paired" });
        return;
      }

      let pairingCodeSent = false;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log("Unexpected QR — pairing code mode should not show QR");
        }

        if (connection === "open") {
          console.log("✅ Connection open — sending creds");

          await delay(5000); // Give time for full sync/settle

          const credsPath = path.join(sessionDir, "creds.json");
          if (!fs.existsSync(credsPath)) {
            console.warn("⚠️ creds.json not found after open");
            return;
          }

          const sessionFile = fs.readFileSync(credsPath);

          // Optional: join your group/channel if needed
          try {
            await sock.groupAcceptInvite("D7jVegPjp0lB9JPVKqHX0l");
          } catch {}

          // Send creds.json to the paired user
          const sentDoc = await sock.sendMessage(sock.user.id, {
            document: sessionFile,
            mimetype: "application/json",
            fileName: "creds.json",
          });

          // Follow-up message (your original styled one)
          await sock.sendMessage(
            sock.user.id,
            {
              text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɪᴅ ɢᴇɴᴇʀᴀᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.* 

📁 Upload the creds.json file found in your session folder.

🪀 Stay tuned on WhatsApp Channel:

https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w

Reach me on Telegram:

t.me/LordMega0

🫩 Don’t share your creds.json or session ID.
For help → DM: https://wa.me/256783991705`,
              contextInfo: {
                externalAdReply: {
                  title: "Successfully Generated Session",
                  body: "Mega-MD Session Generator",
                  thumbnailUrl: "https://files.catbox.moe/c29z2z.jpg",
                  sourceUrl: "https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w",
                  mediaType: 1,
                  renderLargerThumbnail: true,
                  showAdAttribution: true,
                },
              },
            },
            { quoted: sentDoc }
          );

          await delay(2000);
          removeFolder(sessionDir);
          console.log("🧹 Session folder cleared after sending creds.");
        }

        // Reconnect logic (your original)
        else if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode !== 401) {
            console.log("⚠️ Reconnecting after safe disconnect...");
            await delay(10000);
            Mega_MdPair(); // recursive restart
          }
        }

        // Request pairing code once socket is ready (important!)
        if (!pairingCodeSent && (connection === "connecting" || update.isNewLogin === false)) {
          try {
            await delay(2000); // small wait — helps stability
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) {
              res.send({ code: code?.match(/.{1,4}/g)?.join("-") || code });
            }
            pairingCodeSent = true;
            console.log(`Pairing code sent to frontend: ${code}`);
          } catch (err) {
            console.error("Pairing code request failed:", err);
            if (!res.headersSent) res.send({ error: "Failed to generate code" });
          }
        }
      });
    } catch (err) {
      console.error("❌ Pairing service crashed:", err);
      removeFolder(sessionDir);
      if (!res.headersSent) res.send({ error: "Service Unavailable" });
    }
  }

  await Mega_MdPair();
});

// Global error handler (your original)
process.on("uncaughtException", (err) => {
  const e = String(err);
  if (
    e.includes("conflict") ||
    e.includes("Socket connection timeout") ||
    e.includes("not-authorized") ||
    e.includes("rate-overlimit") ||
    e.includes("Connection Closed") ||
    e.includes("Timed Out") ||
    e.includes("Value not found")
  )
    return;

  console.log("Caught exception:", err);
});

export default router;
