#!/usr/bin/env node
// Simple static dev server for SXML dist output
// Usage: node dev-server-sxml.js [env] [port]
// - env: dev | test | prod (default: dev) — only for logging purposes here
// - port: number (default: 8080)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ENV = (process.argv[2] || 'dev').toLowerCase();
const PORT = parseInt(process.argv[3] || process.env.PORT || '8080', 10);

const ROOT = path.join(__dirname, 'dist');
const SRC_PAGES = path.join(__dirname, 'pages');

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8'
};

function setCommonHeaders(res) {
	// Dev-friendly headers
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
	res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', '0');
}

function safeJoin(base, target) {
	const resolvedPath = path.join(base, target);
	if (!resolvedPath.startsWith(base)) {
		return null; // path traversal attempt
	}
	return resolvedPath;
}

function notFound(res) {
	setCommonHeaders(res);
	res.statusCode = 404;
	res.setHeader('Content-Type', 'text/plain; charset=utf-8');
	res.end('404 Not Found');
}

function ensureDirSync(dir) {
	try { fs.mkdirSync(dir, { recursive: true }); } catch(_) {}
}

async function compileSxmlOnDemand(sxmlUrlPath) {
	// Map /pages/<folder>/<name>.sxml to source and output into dist
	// Returns absolute path to compiled HTML in dist, or null on failure
	try {
		const m = sxmlUrlPath.match(/^\/?pages\/([^\/]+)\/([^\/]+)\.sxml$/i);
		if (!m) return null;
		const folder = m[1];
		const name = m[2];
		const sxmlSrc = safeJoin(SRC_PAGES, path.join(folder, `${name}.sxml`));
		const jsSrc = safeJoin(SRC_PAGES, path.join(folder, `${name}.js`));
		const jsonSrc = safeJoin(SRC_PAGES, path.join(folder, `${name}.json`));
		if (!sxmlSrc || !jsSrc) return null;
		if (!fs.existsSync(sxmlSrc) || !fs.existsSync(jsSrc)) return null;

		const outDir = safeJoin(ROOT, path.join('pages', folder));
		if (!outDir) return null;
		ensureDirSync(outDir);
		const outHtml = path.join(outDir, `${name}.html`);

		const SXMLCompiler = require(path.join(__dirname, 'utils', 'sxml.compiler.js'));
		const compiler = new SXMLCompiler(ENV);
		compiler.compile(sxmlSrc, jsSrc, outHtml, (jsonSrc && fs.existsSync(jsonSrc)) ? jsonSrc : null);
		return outHtml;
	} catch (e) {
		console.error('[dev-server] compileSxmlOnDemand failed:', e && e.message);
		return null;
	}
}

const server = http.createServer(async (req, res) => {
	const parsed = url.parse(req.url);
	let pathname = decodeURIComponent(parsed.pathname || '/');

	// 开发环境内置日志代理：将 /api/logs 转发到本地日志服务 http://localhost:3002
	if (pathname === '/api/logs') {
		// 允许简单 CORS
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		if (req.method === 'OPTIONS') {
			res.statusCode = 200;
			return res.end();
		}
		if (req.method === 'POST') {
			try {
				const bodyChunks = [];
				req.on('data', (chunk) => bodyChunks.push(chunk));
				req.on('end', () => {
					const body = Buffer.concat(bodyChunks);
					const proxyReq = http.request({
						hostname: 'localhost',
						port: 3002,
						path: '/api/logs',
						method: 'POST',
						headers: {
							'Content-Type': req.headers['content-type'] || 'application/json',
							'Content-Length': Buffer.byteLength(body)
						}
					}, (proxyRes) => {
						let respData = [];
						proxyRes.on('data', (chunk) => respData.push(chunk));
						proxyRes.on('end', () => {
							const buf = Buffer.concat(respData);
							setCommonHeaders(res);
							res.statusCode = proxyRes.statusCode || 200;
							res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json; charset=utf-8');
							res.end(buf);
						});
					});
					proxyReq.on('error', (err) => {
						console.error('[dev-server] /api/logs proxy error:', err && err.message);
						setCommonHeaders(res);
						res.statusCode = 502;
						res.setHeader('Content-Type', 'application/json; charset=utf-8');
						res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Failed to reach local log server' }));
					});
					proxyReq.write(body);
					proxyReq.end();
				});
			} catch (e) {
				console.error('[dev-server] /api/logs handling failed:', e && e.message);
				setCommonHeaders(res);
				res.statusCode = 500;
				res.setHeader('Content-Type', 'application/json; charset=utf-8');
				res.end(JSON.stringify({ error: 'Internal Server Error' }));
			}
			return;
		}
	}

	// Normalize directory request to index.html, but keep multi-page mode
	if (pathname === '/') {
		pathname = '/pages/index/index.html';
	}

	// Strip query string when mapping to filesystem
		const ext = path.extname(pathname.toLowerCase());
	const contentType = MIME[ext] || 'application/octet-stream';

		// Handle .sxml requests by compiling on the fly
		if (ext === '.sxml') {
			const compiled = await compileSxmlOnDemand(pathname.replace(/^\//, ''));
			if (compiled && fs.existsSync(compiled)) {
				res.statusCode = 200;
				setCommonHeaders(res);
				res.setHeader('Content-Type', 'text/html; charset=utf-8');
				return fs.createReadStream(compiled).pipe(res);
			}
			return notFound(res);
		}

		const filePath = safeJoin(ROOT, pathname);
	if (!filePath) {
		return notFound(res);
	}

		fs.stat(filePath, async (err, stat) => {
		if (err) {
			// Try to fallback for directory paths (e.g., /pages/webapp/)
			if (pathname.endsWith('/')) {
				const alt = safeJoin(ROOT, pathname + 'index.html');
				if (alt) {
					return fs.stat(alt, (e2, st2) => {
						if (!e2 && st2.isFile()) {
							res.statusCode = 200;
							setCommonHeaders(res);
							res.setHeader('Content-Type', 'text/html; charset=utf-8');
							return fs.createReadStream(alt).pipe(res);
						}
						return notFound(res);
					});
				}
			}
					// If a specific HTML under /pages/* is requested but not found, try on-demand compile from .sxml
					const m = pathname.match(/^\/pages\/([^\/]+)\/([^\/]+)\.html$/i);
					if (m) {
						const folder = m[1]; const name = m[2];
						const compiled = await compileSxmlOnDemand(`pages/${folder}/${name}.sxml`);
						if (compiled && fs.existsSync(compiled)) {
							res.statusCode = 200;
							setCommonHeaders(res);
							res.setHeader('Content-Type', 'text/html; charset=utf-8');
							return fs.createReadStream(compiled).pipe(res);
						}
					}
					return notFound(res);
		}

		if (stat.isDirectory()) {
			// e.g., /pages/webapp => serve /pages/webapp/webapp.html if exists
			const baseName = path.basename(pathname);
			const candidate = safeJoin(ROOT, path.join(pathname, `${baseName}.html`));
			if (candidate) {
				return fs.stat(candidate, (e3, st3) => {
					if (!e3 && st3.isFile()) {
						res.statusCode = 200;
						setCommonHeaders(res);
						res.setHeader('Content-Type', 'text/html; charset=utf-8');
						return fs.createReadStream(candidate).pipe(res);
					}
					// Fallback to index.html inside the folder
					const idx = safeJoin(ROOT, path.join(pathname, 'index.html'));
					if (idx) {
						return fs.stat(idx, (e4, st4) => {
							if (!e4 && st4.isFile()) {
								res.statusCode = 200;
								setCommonHeaders(res);
								res.setHeader('Content-Type', 'text/html; charset=utf-8');
								return fs.createReadStream(idx).pipe(res);
							}
							return notFound(res);
						});
					}
					return notFound(res);
				});
			}
			return notFound(res);
		}

		res.statusCode = 200;
		setCommonHeaders(res);
		res.setHeader('Content-Type', contentType);
		const stream = fs.createReadStream(filePath);
		stream.on('error', () => notFound(res));
		stream.pipe(res);
	});
});

server.listen(PORT, () => {
	const base = `http://localhost:${PORT}`;
	console.log('═══════════════════════════════════════');
	console.log('  SXML Dev Server');
	console.log('═══════════════════════════════════════');
	console.log(`🌱 ENV: ${ENV.toUpperCase()} | ROOT: ${ROOT}`);
	console.log(`🚀 Running at: ${base}`);
	console.log(`➡️  Index: ${base}/pages/index/index.html`);
	console.log(`➡️  Webapp: ${base}/pages/webapp/webapp.html`);
});

