#!/usr/bin/env node
// Static HTTPS server for the virtual window.
//
// HTTPS rather than HTTP because getUserMedia is gated behind a secure context.
// localhost counts as secure, but this VM has no camera, so the page is always
// opened from the machine driving the window display, by LAN IP -- and that needs a real TLS cert.

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT ?? 8460);

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".task": "application/octet-stream",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

function certs() {
    const dir = path.join(root, "certs");
    try {
        return {
            key: fs.readFileSync(path.join(dir, "key.pem")),
            cert: fs.readFileSync(path.join(dir, "cert.pem")),
        };
    } catch {
        console.error("No TLS cert found. Run: ./scripts/make-cert.sh");
        process.exit(1);
    }
}

// Resolve a URL path to a file inside publicDir, or null if it escapes.
// Directory URLs fall back to index.html, matching how GitHub Pages behaves --
// otherwise a subpath deploy works there but 404s here.
function resolveFile(urlPath) {
    const decoded = decodeURIComponent(urlPath.split("?")[0]);
    const full = path.join(publicDir, decoded);
    if (full !== publicDir && !full.startsWith(publicDir + path.sep)) return null;

    try {
        if (fs.statSync(full).isDirectory()) return path.join(full, "index.html");
    } catch {
        // Missing path; let the caller report 404.
    }
    return full;
}

function send(res, status, headers, body) {
    res.writeHead(status, headers);
    if (body) res.end(body);
    else res.end();
}

function serve(req, res) {
    const file = resolveFile(req.url);
    if (!file) return send(res, 403, { "content-type": "text/plain" }, "Forbidden");

    let stat;
    try {
        stat = fs.statSync(file);
        if (stat.isDirectory()) throw new Error("directory");
    } catch {
        return send(res, 404, { "content-type": "text/plain" }, "Not found");
    }

    const ext = path.extname(file).toLowerCase();
    const headers = {
        "content-type": contentTypes[ext] ?? "application/octet-stream",
    };

    // Cross-origin isolation lets the wasm runtime use threads and
    // SharedArrayBuffer. Every asset here is same-origin, so nothing breaks.
    // GitHub Pages cannot send custom headers, so NO_ISOLATION=1 reproduces
    // that environment locally to catch anything that depends on isolation.
    if (!process.env.NO_ISOLATION) {
        headers["cross-origin-opener-policy"] = "same-origin";
        headers["cross-origin-embedder-policy"] = "require-corp";
        headers["cross-origin-resource-policy"] = "same-origin";
    }

    // Models and wasm are large and content-stable; the page markup is not.
    headers["cache-control"] =
        ext === ".task" || ext === ".wasm" ? "public, max-age=604800" : "no-cache";

    // Range support so the browser can seek within video files.
    const range = req.headers.range;
    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (match) {
            let start = match[1] === "" ? null : Number(match[1]);
            let end = match[2] === "" ? null : Number(match[2]);

            if (start === null && end !== null) {
                // Suffix range: final N bytes.
                start = Math.max(0, stat.size - end);
                end = stat.size - 1;
            } else if (start !== null) {
                end = end === null ? stat.size - 1 : Math.min(end, stat.size - 1);
            }

            if (start === null || start > end || start >= stat.size) {
                return send(res, 416, {
                    ...headers,
                    "content-range": `bytes */${stat.size}`,
                });
            }

            res.writeHead(206, {
                ...headers,
                "accept-ranges": "bytes",
                "content-range": `bytes ${start}-${end}/${stat.size}`,
                "content-length": end - start + 1,
            });
            if (req.method === "HEAD") return res.end();
            return fs.createReadStream(file, { start, end }).pipe(res);
        }
    }

    res.writeHead(200, {
        ...headers,
        "accept-ranges": "bytes",
        "content-length": stat.size,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
}

function lanAddresses() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((n) => n && n.family === "IPv4" && !n.internal)
        .map((n) => n.address);
}

https.createServer(certs(), serve).listen(port, "0.0.0.0", () => {
    console.log(`\n  Virtual window serving ${publicDir}\n`);
    console.log(`    local:   https://localhost:${port}/`);
    for (const addr of lanAddresses()) {
        console.log(`    network: https://${addr}:${port}/`);
    }
    console.log(
        "\n  The cert is self-signed, so the browser will warn once."
        + "\n  Accept it, or the camera will not start.\n"
    );
});
