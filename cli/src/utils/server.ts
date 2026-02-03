// Server lifecycle utilities for local-pr-reviewer

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { getConfigDir, getServerJsonPath, getServerJsPath } from './paths.js';

interface ServerInfo {
	port: number;
	pid: number;
}

export async function ensureServerRunning(): Promise<string> {
	const serverJsonPath = getServerJsonPath();

	// Check if already running
	if (existsSync(serverJsonPath)) {
		try {
			const info: ServerInfo = JSON.parse(
				readFileSync(serverJsonPath, 'utf-8'),
			);
			// Verify process is actually running
			if (isProcessRunning(info.pid)) {
				return `http://localhost:${info.port}`;
			}
		} catch {
			// Invalid server.json, will start new
		}
	}

	// Start server in background
	const serverJs = getServerJsPath();
	const configDir = getConfigDir();

	const child = spawn('node', [serverJs], {
		cwd: configDir,
		detached: true,
		stdio: 'ignore',
		env: { ...process.env, NODE_ENV: 'production' },
	});

	child.unref();

	// Wait for server to be ready
	await waitForServer();

	// Read the port from server.json
	const info: ServerInfo = JSON.parse(readFileSync(serverJsonPath, 'utf-8'));
	return `http://localhost:${info.port}`;
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitForServer(maxAttempts = 30): Promise<void> {
	const serverJsonPath = getServerJsonPath();

	for (let i = 0; i < maxAttempts; i++) {
		if (existsSync(serverJsonPath)) {
			try {
				const info: ServerInfo = JSON.parse(
					readFileSync(serverJsonPath, 'utf-8'),
				);
				if (isProcessRunning(info.pid)) {
					return;
				}
			} catch {
				// Keep waiting
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	throw new Error('Server failed to start');
}

export function getServerUrl(): string | null {
	const serverJsonPath = getServerJsonPath();

	if (!existsSync(serverJsonPath)) {
		return null;
	}

	try {
		const info: ServerInfo = JSON.parse(
			readFileSync(serverJsonPath, 'utf-8'),
		);
		return `http://localhost:${info.port}`;
	} catch {
		return null;
	}
}
