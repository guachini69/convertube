# Convertube deployment

The Vite frontend is deployed as a static site on Vercel. Set `VITE_API_URL` in the Vercel project to the public origin of the Flask API (for example, your Render or Railway service URL), then redeploy. An empty value uses Vite's `/api` development proxy.

Deploy the repository as a Docker web service on Render or Railway. The root Dockerfile installs the backend Python dependencies, FFmpeg, and Deno; the Railway config and Render Blueprint use that Dockerfile. Set `PORT` through the platform and configure these server environment variables:

- `FRONTEND_URL`: exact Vercel origin, such as `https://convertube.vercel.app` (comma-separated origins are supported).
- `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY`, and `CLOUDFLARE_R2_BUCKET`.
- Optional: `YTDLP_SOCKET_TIMEOUT`, `YTDLP_RETRIES`, `FFMPEG_BINARY`, `TEMP_DIR`, and `MONETAG_PUBLISHER_ID`.

Do not put R2 credentials in Vercel or frontend variables. The browser must only receive `VITE_API_URL`; the signing credentials stay on the Flask server. `/api/health` is the backend health check. Downloads run synchronously and need a host with enough temporary disk and request duration for the selected video; use a background job/queue for production-scale traffic.

For local development, run Flask from `backend/` on port 5000 and run Vite from the project root. The Vite proxy forwards `/api` to `http://127.0.0.1:5000`; override it with `API_PROXY_TARGET` when needed.
