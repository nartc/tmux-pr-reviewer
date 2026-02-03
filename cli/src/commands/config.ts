// Agent configuration command for local-pr-reviewer

import * as p from '@clack/prompts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import color from 'picocolors';
import { getAgentsConfigPath } from '../utils/paths.js';

interface AgentsConfig {
	default: string;
	projects: Record<string, string>;
}

export async function config(
	args: Record<string, string | boolean>,
): Promise<void> {
	const configPath = getAgentsConfigPath();

	let agentsConfig: AgentsConfig = {
		default: 'claude',
		projects: {},
	};

	// Load existing config
	if (existsSync(configPath)) {
		try {
			agentsConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
		} catch {
			// Use defaults if file is corrupted
		}
	}

	const setDefault = args['set-default'];
	const setProject = args['set-project'];

	// Show current config if no modification flags
	if (!setDefault && !setProject) {
		p.intro(color.bgCyan(color.black(' Agent Configuration ')));

		console.log(`\nDefault agent: ${color.cyan(agentsConfig.default)}`);

		const projects = Object.entries(agentsConfig.projects);
		if (projects.length > 0) {
			console.log('\nProject overrides:');
			for (const [path, agent] of projects) {
				console.log(`  ${path}: ${color.cyan(agent)}`);
			}
		} else {
			console.log('\nNo project overrides configured.');
		}

		console.log(`\nConfig file: ${color.dim(configPath)}\n`);
		return;
	}

	// Set default agent
	if (typeof setDefault === 'string') {
		if (!['claude', 'opencode'].includes(setDefault)) {
			console.error(
				color.red(
					`Invalid agent: ${setDefault}. Use 'claude' or 'opencode'.`,
				),
			);
			process.exit(1);
		}
		agentsConfig.default = setDefault;
		writeFileSync(configPath, JSON.stringify(agentsConfig, null, 2));
		console.log(`Default agent set to: ${color.cyan(setDefault)}`);
		return;
	}

	// Set project-specific agent
	if (typeof setProject === 'string') {
		// Find the agent argument (next positional arg after --set-project value)
		const argv = process.argv;
		const setProjectIndex = argv.indexOf('--set-project');
		const agent = argv[setProjectIndex + 2];

		if (!agent || !['claude', 'opencode'].includes(agent)) {
			console.error(
				color.red(
					'Usage: config --set-project /path/to/repo <claude|opencode>',
				),
			);
			process.exit(1);
		}

		agentsConfig.projects[setProject] = agent;
		writeFileSync(configPath, JSON.stringify(agentsConfig, null, 2));
		console.log(`Agent for ${setProject} set to: ${color.cyan(agent)}`);
		return;
	}
}
