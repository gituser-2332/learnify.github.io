import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Proxy endpoint to fetch and serve Google Drive HTML files correctly
  app.get("/api/proxy/:driveId", async (req, res) => {
    const { driveId } = req.params;
    try {
      if (!driveId || driveId === 'undefined' || driveId === 'not-found') {
        const title = req.query.title || "Unknown Game";
        return res.status(404).send(`
          <html>
            <body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;">
              <div style="max-width:500px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);padding:40px;border-radius:24px;">
                <div style="width:64px;height:64px;background:rgba(6,182,212,0.1);border-radius:16px;display:flex;items:center;justify-center;margin:0 auto 24px;border:1px solid rgba(6,182,212,0.2);">
                  <svg style="width:32px;height:32px;color:#06b6d4;margin:auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                </div>
                <h1 style="color:#06b6d4;margin:0 0 12px;font-size:24px;font-weight:900;letter-spacing:-0.05em;font-style:italic;">SOURCE NOT LINKED</h1>
                <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin-bottom:24px;">The game <strong>${title}</strong> is in our directory, but its secure storage hash hasn't been established yet. We're working on restoring this fragment.</p>
                <div style="font-family:monospace;font-size:10px;background:#000;padding:12px;border-radius:8px;color:#71717a;border:1px solid rgba(255,255,255,0.05);">ERR_SOURCE_ID_MISSING</div>
              </div>
            </body>
          </html>
        `);
      }
      
      if (driveId.startsWith("1example_") || driveId.includes("v08t5N")) {
        return res.status(404).send(`<!-- PLACEHOLDER -->\n<html><body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;"><div><h1 style="color:#06b6d4;">Source Fragment Offline</h1><p>The Drive ID for this game is currently a placeholder.<br/>Fragment ID: <code>${driveId}</code></p></div></body></html>`);
      }

      console.log(`[Proxy] Requesting Drive ID: ${driveId}`);
      
      const driveUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
      
      let response = await fetch(driveUrl, {
        headers: { 'User-Agent': userAgent }
      });
      
      let content = await response.text();

      // Detection for virus scan/confirmation page
      if (content.length < 100000 && (content.includes("confirm=") || content.includes("Google Drive - Virus scan warning"))) {
          const confirmMatch = content.match(/confirm=([a-zA-Z0-9_-]+)/);
          if (confirmMatch && confirmMatch[1]) {
              const confirmToken = confirmMatch[1];
              console.log(`[Proxy] Bypassing restricted view for ${driveId} with token ${confirmToken}`);
              
              const retryResponse = await fetch(`${driveUrl}&confirm=${confirmToken}`, {
                  headers: { 'User-Agent': userAgent }
              });
              
              if (retryResponse.ok) {
                  content = await retryResponse.text();
              }
          }
      }
      
      if (!response.ok && content.length < 500) {
        return res.status(response.status).send("Failed to reach source.");
      }

      // Final security headers and clean delivery
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Frame-Options", "ALLOWALL");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:;");
      res.send(content);
    } catch (error) {
      console.error("[Proxy] Error:", error);
      res.status(500).send("Link offline.");
    }
  });
  
  // Proxy for UGS Files (GitHub/JsDelivr)
  app.get("/api/ugs/:filename", async (req, res) => {
    const { filename } = req.params;
    try {
      // JsDelivr URL for the raw file. JS filenames in the CDN might match the 'cl...' pattern.
      // We assume the filename passed is the full one like 'cl1' or 'clcapybaraclicker'
      const targetUrl = `https://cdn.jsdelivr.net/gh/mcgee1717/994894838923761723/UGS-Files/${filename}.html`;
      console.log(`[Proxy] Fetching: ${targetUrl}`);
      
      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).send(`Error fetching game: ${response.statusText}`);
      }
      
      let text = await response.text();
      
      // Basic headers for browser compatibility
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Frame-Options", "ALLOWALL");
      res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:;");
      res.send(text);
    } catch (error) {
      console.error("[Proxy Error]", error);
      res.status(500).send("Internal Server Error");
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
