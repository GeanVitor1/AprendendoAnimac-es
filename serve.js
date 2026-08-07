/* Static server with HTTP Range support (required for video seeking/scrubbing).
   No dependencies. Usage: node serve.js   -> http://localhost:8787 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function sendError(res, code, msg) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(msg + "\n");
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.resolve(ROOT, url === "/" ? "index.html" : "." + url);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      return sendError(res, 403, "Forbidden");
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return sendError(res, 404, "Not Found");

      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || "application/octet-stream";
      const range = req.headers.range;

      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = m && m[1] !== "" ? parseInt(m[1], 10) : 0;
        let end = m && m[2] !== "" ? parseInt(m[2], 10) : stat.size - 1;
        if (!m || isNaN(start) || isNaN(end)) {
          return sendError(res, 416, "Range Not Satisfiable");
        }
        if (end >= stat.size) end = stat.size - 1;
        if (start > end || start >= stat.size) {
          return sendError(res, 416, "Range Not Satisfiable");
        }
        res.writeHead(206, {
          "Content-Type": mime,
          "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
        });
        fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Type": mime,
          "Accept-Ranges": "bytes",
          "Content-Length": stat.size,
          "Cache-Control": "no-cache",
        });
        fs.createReadStream(filePath).pipe(res);
      }
    });
  })
  .listen(PORT, HOST, () => {
    console.log("AMOUDO site running at http://" + HOST + ":" + PORT);
  });
