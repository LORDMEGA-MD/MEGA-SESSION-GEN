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

// --- Helper function ---
function removeFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
}

// --- Pair route ---
router.get("/", async (req, res) => {
  let num = req.query.number;

  async function Mega_MdPair() {
    const sessionDir = path.resolve("./src/session");
    fs.mkdirSync(sessionDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
      const MegaMdEmpire = makeWASocket({
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
      });

      // Register new number if not yet paired
      if (!MegaMdEmpire.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        const code = await MegaMdEmpire.requestPairingCode(num);
        if (!res.headersSent) res.send({ code });
      }

      MegaMdEmpire.ev.on("creds.update", saveCreds);

      MegaMdEmpire.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          console.log("✅ Connection open — sending creds");
          await delay(8000);

          const credsPath = path.join(sessionDir, "creds.json");
          if (!fs.existsSync(credsPath)) {
            console.warn("⚠️ creds.json not found after connection");
            return;
          }

          const sessionFile = fs.readFileSync(credsPath);
          await MegaMdEmpire.groupAcceptInvite("D7jVegPjp0lB9JPVKqHX0l");

          // Send creds.json to the logged-in user
          const sentDoc = await MegaMdEmpire.sendMessage(MegaMdEmpire.user.id, {
            document: sessionFile,
            mimetype: "application/json",
            fileName: "creds.json",
          });

          // Follow-up info message
          await MegaMdEmpire.sendMessage(
            MegaMdEmpire.user.id,
            {
              text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɪᴅ ɢᴇɴᴇʀᴀᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*
📁 Upload the creds.json file found in your session folder.

_*🪀 Stay tuned on WhatsApp Channel:*_
> _https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w_

_*Reach me on Telegram:*_  
> _t.me/LordMega0_

> 🫩 *Don’t share your creds.json or session ID.*
For help → DM: _https://wa.me/256783991705_`,
              contextInfo: {
                externalAdReply: {
                  title: "Successfully Generated Session",
                  body: "Mega-MD Session Generator",
                  thumbnailUrl: "https://files.catbox.moe/c29z2z.jpg",
                  sourceUrl:
                    "https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w",
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

        // Restart on safe disconnects
        else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output?.statusCode !== 401
        ) {
          console.log("⚠️ Reconnecting after safe disconnect...");
          await delay(10000);
          Mega_MdPair();
        }
      });
    } catch (err) {
      console.error("❌ Pairing service crashed:", err);
      removeFolder(path.resolve("./src/session"));
      if (!res.headersSent) res.send({ code: "Service Unavailable" });
    }
  }

  await Mega_MdPair();
});

// --- Global error handler ---
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
