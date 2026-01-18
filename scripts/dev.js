#!/usr/bin/env node
// Dev script - starts the React Router dev server and provides MCP setup info

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// MCP config paths for various agents
const configPaths = [
	// Claude Code
	join(homedir(), '.config', 'claude', 'config.json'),
	// Cline (VS Code extension)
	join(
		homedir(),
		'.config',
		'Code',
		'User',
		'globalStorage',
		'saoudrizwan.claude-dev',
		'settings',
		'cline_mcp_settings.json',
	),
	// Continue.dev
	join(homedir(), '.continue', 'config.json'),
	// Cursor
	join(homedir(), '.cursor', 'mcp.json'),
];

// Check if MCP is configured for any agent
const checkMcpConfigured = () => {
	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			try {
				const config = JSON.parse(readFileSync(configPath, 'utf-8'));
				if (
					config.mcpServers?.['pr-reviewer'] ||
					config.servers?.['pr-reviewer']
				) {
					return true;
				}
			} catch {
				// Ignore parse errors
			}
		}
	}
	return false;
};

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                    PR Reviewer v2.0                        ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Start React Router dev server
const app = spawn('pnpm', ['run', 'dev:app'], {
	stdio: 'inherit',
	shell: true,
});

console.log('✓ React Router dev server starting...');
console.log('  → http://localhost:5173');
console.log('');

// Check MCP configuration
const configured = checkMcpConfigured();

if (configured) {
	console.log('✓ MCP server configured');
	console.log(
		'  → Available tools: check_pr_comments, mark_comment_resolved,',
	);
	console.log('    list_pending_comments, get_comment_details');
} else {
	console.log('⚠️  MCP not configured for any coding agent');
	console.log('');
	console.log('   Run: pnpm setup:mcp');
	console.log('');
	console.log('   Or manually add to your agent config:');
	console.log('   {');
	console.log('     "mcpServers": {');
	console.log('       "pr-reviewer": {');
	console.log('         "command": "node",');
	console.log(
		`         "args": ["${join(process.cwd(), 'dist', 'mcp-server', 'index.js')}"]`,
	);
	console.log('       }');
	console.log('     }');
	console.log('   }');
}

console.log('');
console.log('─────────────────────────────────────────────────────────────');
console.log('');

// Handle cleanup
process.on('SIGINT', () => {
	console.log('\n\nShutting down...');
	app.kill();
	process.exit(0);
});

process.on('SIGTERM', () => {
	app.kill();
	process.exit(0);
});

app.on('error', (error) => {
	console.error('Failed to start dev server:', error);
	process.exit(1);
});

app.on('exit', (code) => {
	if (code !== 0 && code !== null) {
		console.error(`Dev server exited with code ${code}`);
	}
	process.exit(code ?? 0);
});
