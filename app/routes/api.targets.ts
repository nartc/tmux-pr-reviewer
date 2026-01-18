// API route for listing delivery targets (MCP clients + clipboard)
import { Effect } from 'effect';
import { runtime } from '../lib/effect-runtime';
import { TransportService } from '../services/transport.service';

export async function loader() {
	return runtime.runPromise(
		Effect.gen(function* () {
			const transport = yield* TransportService;

			const targets = yield* transport.listTargets;
			const mcpStatus = yield* transport.getMcpStatus;

			return Response.json({
				targets,
				mcpStatus,
			});
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(
					Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: 'Failed to list targets',
							targets: [
								{
									id: 'clipboard',
									type: 'clipboard',
									name: 'Copy to Clipboard',
									connected: true,
								},
							],
							mcpStatus: { clientCount: 0, clients: [] },
						},
						{ status: 200 }, // Return 200 with fallback data
					),
				),
			),
		),
	);
}
