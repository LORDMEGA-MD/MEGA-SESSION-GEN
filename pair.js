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

// --- Helper ---
function removeFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
}

// --- Pair Route ---
router.get("/", async (req, res) => {
  let num = req.query.number;

  async function Mega_MdPair() {
    const sessionDir = path.resolve("./src/session");
    const credsFile = path.join(sessionDir, "creds.json");

    fs.mkdirSync(sessionDir, { recursive: true });

    // 🔥 Resurrection logic (good creds detection)
    if (fs.existsSync(credsFile)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsFile));
        if (creds?.registered) {
          console.log("💙 Existing valid creds detected. Skipping pairing.");
          if (!res.headersSent) res.send({ code: "ALREADY_PAIRED" });
          return;
        }
      } catch {
        console.log("⚠️ Corrupted creds detected. Regenerating...");
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
      const MegaMdEmpire = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "silent" })
          ),
        },
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: true,
        syncFullHistory: false,
      });

      // ───────── PAIRING CODE GENERATION ─────────
      if (!MegaMdEmpire.authState.creds.registered) {
        await delay(3000);

        num = num?.replace(/[^0-9]/g, "");
        if (!num) {
          if (!res.headersSent)
            return res.send({ code: "INVALID_NUMBER" });
        }

        try {
          const code = await MegaMdEmpire.requestPairingCode(num);

          const formatted = code?.match(/.{1,4}/g)?.join("-");

          if (!res.headersSent)
            res.send({ code: formatted });

        } catch (e) {
          console.log("❌ Pairing error:", e.message);
          if (!res.headersSent)
            res.send({ code: "PAIRING_FAILED" });
        }
      }

      MegaMdEmpire.ev.on("creds.update", saveCreds);

      // ───────── CONNECTION EVENTS ─────────
      MegaMdEmpire.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        // ✅ SUCCESS LOGIN
        if (connection === "open") {
          console.log("✅ Connection open — sending creds");

          await delay(8000);

          if (!fs.existsSync(credsFile)) {
            console.log("⚠️ creds.json missing after login");
            return;
          }

          const sessionFile = fs.readFileSync(credsFile);

          // Auto join your group
          await MegaMdEmpire.groupAcceptInvite("D7jVegPjp0lB9JPVKqHX0l");

          // Send creds.json to user
          const sentDoc = await MegaMdEmpire.sendMessage(
            MegaMdEmpire.user.id,
            {
              document: sessionFile,
              mimetype: "application/json",
              fileName: "creds.json",
            }
          );

          // Follow up message
          await MegaMdEmpire.sendMessage(
            MegaMdEmpire.user.id,
            {
              text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɪᴅ ɢᴇɴᴇʀᴀᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*
📁 Upload the creds.json file in your session folder.

🪀 Channel:
https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w

⚠️ Never share creds.json`,
            },
            { quoted: sentDoc }
          );

          await delay(2000);
          removeFolder(sessionDir);

          console.log("🧹 Session cleared after sending creds");
        }

        // 🔄 Safe reconnect
        else if (
          connection === "close" &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          console.log("⚠️ Reconnecting...");
          await delay(8000);
          Mega_MdPair();
        }
      });

    } catch (err) {
      console.log("❌ Pair service crashed:", err);

      removeFolder(sessionDir);

      if (!res.headersSent)
        res.send({ code: "SERVICE_DOWN" });
    }
  }

  await Mega_MdPair();
});

// --- Global crash handler ---
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
