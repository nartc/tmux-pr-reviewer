// API route for MCP connection status
import { Effect } from 'effect';
import { runtime } from '../lib/effect-runtime';
import { TransportService } from '../services/transport.service';

export async function loader() {
	return runtime.runPromise(
		Effect.gen(function* () {
			const transport = yield* TransportService;
			const status = yield* transport.getMcpStatus;

			return Response.json({
				connected: status.clientCount > 0,
				clientCount: status.clientCount,
				clients: status.clients,
			});
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(
					Response.json(
						{
							connected: false,
							clientCount: 0,
							clients: [],
							error:
								error instanceof Error
									? error.message
									: 'Failed to get MCP status',
						},
						{ status: 200 },
					),
				),
			),
		),
	);
}
