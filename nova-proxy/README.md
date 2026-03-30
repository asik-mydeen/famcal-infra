# Nova Voice Proxy

WebSocket relay for Amazon Nova 2 Sonic real-time voice. Bridges browsers (which can't set WebSocket auth headers) to Nova's Realtime API.

## Deploy to Railway

1. Create a new project on [railway.app](https://railway.app)
2. Connect this repo (or push the `nova-proxy` folder as a separate repo)
3. Set environment variables:
   - `NOVA_API_KEY` — your Amazon Nova API key
   - `ALLOWED_ORIGINS` — `https://calendar-app-01.vercel.app` (comma-separated for multiple)
4. Deploy — Railway auto-detects the Dockerfile
5. Copy the public URL (e.g., `nova-proxy-production.up.railway.app`)
6. Set `REACT_APP_NOVA_PROXY_URL=wss://nova-proxy-production.up.railway.app` in Vercel env vars

## Local Testing

```bash
export NOVA_API_KEY=your-key
npm install
npm start
# Proxy running on ws://localhost:8080
```

## Architecture

```
Browser (FamCal) ←→ wss://your-proxy.railway.app ←→ wss://api.nova.amazon.com/v1/realtime
                    (adds Authorization header)
```
