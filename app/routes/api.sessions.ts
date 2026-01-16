import { tmuxService } from '../services/tmux.service';
import type { Route } from './+types/api.sessions';

export async function loader() {
	const isAvailable = tmuxService.isAvailable();

	if (!isAvailable) {
		return Response.json({
			available: false,
			sessions: [],
			error: 'tmux is not installed or not available',
		});
	}

	const sessions = await tmuxService.listSessions();
	const codingAgentSessions = sessions.filter(
		(s) => s.detectedProcess !== null,
	);

	return Response.json({
		available: true,
		sessions,
		codingAgentSessions,
	});
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const intent = formData.get('intent') as string;

	if (intent === 'test') {
		const sessionName = formData.get('sessionName') as string;

		if (!sessionName) {
			return Response.json(
				{ error: 'Missing session name' },
				{ status: 400 },
			);
		}

		try {
			const testMessage = `[PR Reviewer Test] This is a test message sent at ${new Date().toLocaleTimeString()}. If you see this, the connection is working!`;
			await tmuxService.sendToSession(sessionName, testMessage);
			return Response.json({ success: true });
		} catch (error) {
			console.error('Test send error:', error);
			return Response.json(
				{
					error:
						error instanceof Error
							? error.message
							: 'Failed to send test',
				},
				{ status: 500 },
			);
		}
	}

	return Response.json({ error: 'Unknown intent' }, { status: 400 });
}
