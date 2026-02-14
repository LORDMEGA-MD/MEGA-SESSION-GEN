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
  DisconnectReason
} from "@whiskeysockets/baileys";

const router = express.Router();

function removeFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
}

// ─────────────────────────────
// Pair Route
// ─────────────────────────────
router.get("/", async (req, res) => {

  let num = req.query.number;
  if (!num) return res.send({ code: "No number provided" });

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
            pino({ level: "silent" })
          )
        },
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: true,
        syncFullHistory: false,
        printQRInTerminal: false
      });

      // Save creds updates
      MegaMdEmpire.ev.on("creds.update", saveCreds);

      // ───────── Pairing Logic (FIXED)
      if (!MegaMdEmpire.authState.creds.registered) {

        await delay(3000); // important for socket readiness

        num = num.replace(/[^0-9]/g, "");

        try {
          let code = await MegaMdEmpire.requestPairingCode(num);

          // Format code like standalone version
          code = code?.match(/.{1,4}/g)?.join("-") || code;

          if (!res.headersSent) {
            res.send({ code });
          }

        } catch (err) {
          console.log("Pairing Error:", err.message);
          if (!res.headersSent) res.send({ code: "Pairing Failed" });
        }
      }

      // ───────── Connection Updates
      MegaMdEmpire.ev.on("connection.update", async (update) => {

        const { connection, lastDisconnect } = update;

        if (connection === "open") {

          console.log("✅ Connected & Logged In");

          await delay(5000);

          const credsPath = path.join(sessionDir, "creds.json");

          if (!fs.existsSync(credsPath)) {
            console.log("⚠ creds.json missing");
            return;
          }

          const sessionFile = fs.readFileSync(credsPath);

          // Optional auto group join
          try {
            await MegaMdEmpire.groupAcceptInvite("D7jVegPjp0lB9JPVKqHX0l");
          } catch {}

          // Send creds.json to user
          const sentDoc = await MegaMdEmpire.sendMessage(
            MegaMdEmpire.user.id,
            {
              document: sessionFile,
              mimetype: "application/json",
              fileName: "creds.json"
            }
          );

          await MegaMdEmpire.sendMessage(
            MegaMdEmpire.user.id,
            {
              text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɢᴇɴᴇʀᴀᴛᴇᴅ.*

📁 Upload the creds.json safely.

⚠️ Never share your session file.`,
            },
            { quoted: sentDoc }
          );

          await delay(2000);
          removeFolder(sessionDir);
        }

        // Safe reconnect
        if (connection === "close") {
          const reason = lastDisconnect?.error?.output?.statusCode;

          if (reason !== DisconnectReason.loggedOut) {
            console.log("♻ Reconnecting...");
            Mega_MdPair();
          } else {
            removeFolder(sessionDir);
          }
        }
      });

    } catch (err) {

      console.error("Pair service crashed:", err);
      removeFolder(sessionDir);

      if (!res.headersSent) {
        res.send({ code: "Service Error" });
      }
    }
  }

  await Mega_MdPair();
});

// ─────────────────────────────
// Global Error Catch
// ─────────────────────────────
process.on("uncaughtException", (err) => {
  const e = String(err);

  if (
    e.includes("conflict") ||
    e.includes("Socket connection timeout") ||
    e.includes("not-authorized") ||
    e.includes("rate-overlimit") ||
    e.includes("Connection Closed") ||
    e.includes("Timed Out")
  ) return;

  console.log("Unhandled Error:", err);
});

export default router;
