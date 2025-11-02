import express from "express";
import bodyParser from "body-parser";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";

// --- setup paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- initialize express ---
const app = express();
const PORT = process.env.PORT || 8000;

// --- import route modules ---
import server from "./qr.js";
import code from "./pair.js";

// --- increase max listeners ---
EventEmitter.defaultMaxListeners = 500;

// --- middleware ---
app.use("/server", server);
app.use("/code", code);

app.use("/pair", async (req, res, next) => {
  res.sendFile(path.join(__dirname, "pair.html"));
});

app.use("/qr", async (req, res, next) => {
  res.sendFile(path.join(__dirname, "qr.html"));
});

app.use("/", async (req, res, next) => {
  res.sendFile(path.join(__dirname, "main.html"));
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- start server ---
app.listen(PORT, () => {
  console.log(`
Don't Forget To Give Star MEGA-MD

Server running on http://localhost:${PORT}
  `);
});

export default app;
