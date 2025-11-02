import express from "express";
import fs from "fs";
import pino from "pino";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore
} from "baileys";

const router = express.Router();

// --- Helper function ---
function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

// --- Main route ---
router.get("/", async (req, res) => {
  let num = req.query.number;

  async function Mega_MdPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);

    try {
      let MegaMdEmpire = makeWASocket({
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

      if (!MegaMdEmpire.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        const code = await MegaMdEmpire.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      MegaMdEmpire.ev.on("creds.update", saveCreds);

      MegaMdEmpire.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          await delay(10000);
          const sessionMegaMD = fs.readFileSync("./session/creds.json");
          await MegaMdEmpire.groupAcceptInvite("D7jVegPjp0lB9JPVKqHX0l");

          const MegaMds = await MegaMdEmpire.sendMessage(MegaMdEmpire.user.id, {
            document: sessionMegaMD,
            mimetype: `application/json`,
            fileName: `creds.json`,
          });

          await MegaMdEmpire.sendMessage(
            MegaMdEmpire.user.id,
            {
              text: `> *ᴍᴇɢᴀ-ᴍᴅ sᴇssɪᴏɴ ɪᴅ ᴏʙᴛᴀɪɴᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.*     
📁ᴜᴘʟᴏᴀᴅ ᴛʜᴇ ᴄʀᴇᴅs.ᴊsᴏɴ ғɪʟᴇ ᴘʀᴏᴠɪᴅᴇᴅ ɪɴ ʏᴏᴜʀ sᴇssɪᴏɴ ғᴏʟᴅᴇʀ. 

_*🪀sᴛᴀʏ ᴛᴜɴᴇᴅ ғᴏʟʟᴏᴡ ᴡʜᴀᴛsᴀᴘᴘ ᴄʜᴀɴɴᴇʟ:*_ 
> _https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w_

_*ʀᴇᴀᴄʜ ᴍᴇ ᴏɴ ᴍʏ ᴛᴇʟᴇɢʀᴀᴍ:*_  
> _t.me/LordMega0_

> 🫩ʟᴀsᴛʟʏ ᴅᴏ ɴᴏᴛ sʜᴀʀᴇ ʏᴏᴜʀ sᴇssɪᴏɴ ɪᴅ ᴏʀ ᴄʀᴇᴅs.ᴊsᴏɴ ғɪʟᴇ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ ʙʀᴏ ᴀɴᴅ ғᴏʀ ᴀɴʏ ʜᴇʟᴘ _*ᴅᴍ ᴏᴡɴᴇʀ https://wa.me/256783991705*_  `,
              contextInfo: {
                externalAdReply: {
                  title: "Successfully Generated Session",
                  body: "Mega-MD Session Generator 1",
                  thumbnailUrl: "https://files.catbox.moe/c29z2z.jpg",
                  sourceUrl:
                    "https://whatsapp.com/channel/0029Vb6covl05MUWlqZdHI2w",
                  mediaType: 1,
                  renderLargerThumbnail: true,
                  showAdAttribution: true,
                },
              },
            },
            { quoted: MegaMds }
          );

          await delay(100);
          removeFile("./session");
          return;
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode != 401
        ) {
          await delay(10000);
          Mega_MdPair();
        }
      });
    } catch (err) {
      console.log("service restated");
      await removeFile("./session");
      if (!res.headersSent) {
        await res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await Mega_MdPair();
});

// --- Handle exceptions globally ---
process.on("uncaughtException", function (err) {
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

  console.log("Caught exception: ", err);
});

export default router;
