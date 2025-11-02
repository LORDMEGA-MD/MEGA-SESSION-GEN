// index.js
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import qrRouter, { setSocket } from "./qr.js";

// --- Setup __dirname for ES module ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// --- Attach Socket.IO from qr.js ---
setSocket(server);

// --- Serve static assets ---
app.use(express.static(path.join(__dirname, "public")));

// --- Routes ---
app.use("/server", qrRouter);
app.use("/pair", (req, res) => res.sendFile(path.join(__dirname, "pair.html")));
app.use("/qr", (req, res) => res.sendFile(path.join(__dirname, "qr.html")));
app.use("/", (req, res) => res.sendFile(path.join(__dirname, "main.html")));

// --- Body parser middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Start server ---
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`
🌐 Mega-MD Server running at http://localhost:${PORT}
Don't forget to give a star to Mega-MD!
  `);
});

export default app;
