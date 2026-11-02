import express from "express";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import client from "prom-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");

const PORT = process.env.PORT || 8080;
// Destino del API por DNS de Docker Compose (nombre de servicio "back"), NO localhost.
// El navegador nunca ve esta URL: llama a /api (mismo origen) y aqui se reenvia.
const API_URL = process.env.API_URL || "http://back:8000";

// Identidad de la instancia que sirve (util para ver el reparto entre replicas en k8s).
const HOSTNAME = os.hostname();
function hostIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}
const HOST_IP = hostIp();

// ---- Logs en memoria (buffer circular) ----
const logs = [];
function record(level, message) {
  const entry = { ts: new Date().toISOString(), level, message };
  logs.push(entry);
  if (logs.length > 500) logs.shift();
  console.log(`${entry.ts} ${level} ${message}`);
}

// ---- Metricas Prometheus ----
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const httpRequests = new client.Counter({
  name: "popshop_app_requests_total",
  help: "Total de peticiones HTTP servidas por el frontend.",
  labelNames: ["method", "path", "status"],
  registers: [registry],
});

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.on("finish", () => {
    httpRequests.labels(req.method, req.path, String(res.statusCode)).inc();
  });
  next();
});

// Config runtime para el navegador: usa /api (mismo origen) y muestra el destino real.
app.get("/config.js", (_req, res) => {
  res.type("application/javascript");
  res.send(
    `window.__POPSHOP_CONFIG__ = ${JSON.stringify({
      API_BASE: "/api",
      API_TARGET: API_URL,
      HOSTNAME,
      HOST_IP,
    })};`
  );
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.get("/logs", (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json({ logs: logs.slice(-limit) });
});

// Proxy: el navegador llama /api/* (mismo origen) y el front reenvia a back por DNS.
app.use("/api", async (req, res) => {
  const target = `${API_URL}${req.originalUrl}`;
  try {
    const init = { method: req.method, headers: {} };
    if (!["GET", "HEAD"].includes(req.method)) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(req.body ?? {});
    }
    const upstream = await fetch(target, init);
    const body = await upstream.text();
    res.status(upstream.status);
    res.set("content-type", upstream.headers.get("content-type") || "application/json");
    res.send(body);
  } catch (err) {
    record("ERROR", `proxy ${req.method} ${target}: ${err.message}`);
    res.status(502).json({ error: "bad gateway", target, detail: err.message });
  }
});

// Archivos estaticos del build de Vite
app.use(express.static(DIST));

// Fallback SPA
app.get("*", (_req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  record("INFO", `PopShop front escuchando en :${PORT} (proxy /api -> ${API_URL})`);
});
