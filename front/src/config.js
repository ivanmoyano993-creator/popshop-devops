// El navegador siempre usa el MISMO ORIGEN (/api). El front hace de proxy
// hacia el API por DNS de Docker Compose. Config inyectada en runtime (/config.js).
function config() {
  return (typeof window !== "undefined" && window.__POPSHOP_CONFIG__) || {};
}

export function apiBase() {
  return config().API_BASE || "/api";
}

export function apiTarget() {
  return config().API_TARGET || "(proxy interno)";
}

export function hostname() {
  return config().HOSTNAME || "desconocido";
}

export function hostIp() {
  return config().HOST_IP || "desconocido";
}
