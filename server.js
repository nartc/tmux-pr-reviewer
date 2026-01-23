import compression from 'compression';
import express from 'express';
import morgan from 'morgan';
import * as fs from 'node:fs';
import { createServer } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

// Short-circuit the type-checking of the built output.
const BUILD_PATH = './build/server/index.js';
const DEVELOPMENT = process.env.NODE_ENV === 'development';

// Global config paths
const CONFIG_DIR = path.join(os.homedir(), '.config', 'local-pr-reviewer');
const RUNTIME_FILE = path.join(CONFIG_DIR, 'runtime.json');

/**
 * Find an available port, trying random ports in the range
 * @param {number | null} preferredPort
 * @param {number} startPort
 * @param {number} endPort
 * @returns {Promise<number>}
 */
async function findAvailablePort(
	preferredPort,
	startPort = 3000,
	endPort = 3999,
) {
	/** @param {number} port */
	const isPortAvailable = (port) =>
		new Promise((resolve) => {
			const server = createServer();
			server.once('error', () => resolve(false));
			server.once('listening', () => {
				server.close();
				resolve(true);
			});
			server.listen(port);
		});

	// Try preferred port first (from env)
	if (preferredPort && (await isPortAvailable(preferredPort))) {
		return preferredPort;
	}

	// Try random ports
	const randomPort = () =>
		Math.floor(Math.random() * (endPort - startPort + 1)) + startPort;

	for (let i = 0; i < 10; i++) {
		const port = randomPort();
		if (await isPortAvailable(port)) {
			return port;
		}
	}

	throw new Error(
		'No available port found in range ' + startPort + '-' + endPort,
	);
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
	if (!fs.existsSync(CONFIG_DIR)) {
		fs.mkdirSync(CONFIG_DIR, { recursive: true });
	}
}

/**
 * Write runtime.json with current server info
 * @param {number} port
 */
function writeRuntime(port) {
	ensureConfigDir();
	const runtime = {
		port,
		pid: process.pid,
		startedAt: new Date().toISOString(),
	};
	fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtime, null, 2));
	console.log(`Runtime info written to ${RUNTIME_FILE}`);
}

/**
 * Clean up runtime.json on shutdown
 */
function cleanupRuntime() {
	try {
		if (fs.existsSync(RUNTIME_FILE)) {
			fs.unlinkSync(RUNTIME_FILE);
			console.log('Runtime info cleaned up');
		}
	} catch {
		// Ignore errors during cleanup
	}
}

// Find available port
const envPort = process.env.PORT ? Number.parseInt(process.env.PORT) : null;
const PORT = await findAvailablePort(envPort);

const app = express();

app.use(compression());
app.disable('x-powered-by');

if (DEVELOPMENT) {
	console.log('Starting development server');
	const viteDevServer = await import('vite').then((vite) =>
		vite.createServer({
			server: { middlewareMode: true },
		}),
	);
	app.use(viteDevServer.middlewares);
	app.use(async (req, res, next) => {
		try {
			const source = await viteDevServer.ssrLoadModule('./server/app.ts');
			return await source.app(req, res, next);
		} catch (error) {
			if (typeof error === 'object' && error instanceof Error) {
				viteDevServer.ssrFixStacktrace(error);
			}
			next(error);
		}
	});
} else {
	console.log('Starting production server');
	app.use(
		'/assets',
		express.static('build/client/assets', {
			immutable: true,
			maxAge: '1y',
		}),
	);
	app.use(morgan('tiny'));
	app.use(express.static('build/client', { maxAge: '1h' }));
	app.use(await import(BUILD_PATH).then((mod) => mod.app));
}

// Graceful shutdown handlers
const shutdown = () => {
	cleanupRuntime();
	process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen(PORT, () => {
	writeRuntime(PORT);
	console.log(`Server is running on http://localhost:${PORT}`);
});
