// Forwards the backend's forecast requests to Open-Meteo, because Open-Meteo refused
// Render's shared IP address.
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export async function POST(request) {
  if (request.headers.get("X-Proxy-Secret") !== process.env.PROXY_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const upstream = await fetch(OPEN_METEO, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: await request.text(),
  });
  // Streaming the body through avoids Vercel's 4.5 MB limit: 550 locations are 6.4 MB.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
