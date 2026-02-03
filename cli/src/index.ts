#!/usr/bin/env node
// CLI entry point for local-pr-reviewer v2

import { config } from './commands/config.js';
import { loop } from './commands/loop.js';
import { setup } from './commands/setup.js';
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { migrateIfNeeded } from './utils/migration.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
	console.log(`
local-pr-reviewer v2 - PR review loop for AI coding agents

Usage:
  npx local-pr-reviewer [command] [options]

Commands:
  (default)     Start the review loop in current directory
  setup         Install and configure local-pr-reviewer
  start         Start the review server only
  stop          Stop the review server
  config        Manage agent configuration

Options:
  --help        Show this help message
  --agent       Override agent for this session (claude|opencode)

Examples:
  npx local-pr-reviewer
  npx local-pr-reviewer --agent opencode
  npx local-pr-reviewer setup
  npx local-pr-reviewer config
  npx local-pr-reviewer config --set-default claude
  npx local-pr-reviewer config --set-project /path/to/repo opencode
`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
	const result: Record<string, string | boolean> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const nextArg = args[i + 1];

			// Check if next arg is a value (not another flag)
			if (nextArg && !nextArg.startsWith('--')) {
				result[key] = nextArg;
				i++; // Skip the next arg
			} else if (arg.includes('=')) {
				const [k, v] = arg.slice(2).split('=');
				result[k] = v;
			} else {
				result[key] = true;
			}
		}
	}

	return result;
}

async function main(): Promise<void> {
	const parsedArgs = parseArgs(args);

	if (parsedArgs.help || command === 'help') {
		printHelp();
		process.exit(0);
	}

	// Commands that don't need migration check
	if (command === 'setup') {
		await setup({ force: parsedArgs.force === true });
		return;
	}

	// All other commands: check migration first
	const migrationResult = await migrateIfNeeded();
	if (!migrationResult.ok) {
		console.error(migrationResult.message);
		console.log('\nRun `npx local-pr-reviewer setup` to configure.');
		process.exit(1);
	}

	switch (command) {
		case 'start':
			await start({
				repo:
					typeof parsedArgs.repo === 'string'
						? parsedArgs.repo
						: undefined,
			});
			break;

		case 'stop':
			await stop();
			break;

		case 'config':
			await config(parsedArgs);
			break;

		case undefined:
			// Default: start loop
			await loop({
				agent:
					typeof parsedArgs.agent === 'string'
						? parsedArgs.agent
						: undefined,
			});
			break;

		default:
			console.error(`Unknown command: ${command}`);
			printHelp();
			process.exit(1);
	}
}

main().catch((error) => {
	console.error('Error:', error.message);
	process.exit(1);
});
