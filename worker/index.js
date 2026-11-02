// Forwards the backend's forecast requests to Open-Meteo, which limits Workers per
// Cloudflare user instead of per shared IP address. See docs/DECISIONS.md.
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (request.headers.get("X-Proxy-Secret") !== env.PROXY_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
    return fetch(OPEN_METEO, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: request.body,
    });
  },
};
