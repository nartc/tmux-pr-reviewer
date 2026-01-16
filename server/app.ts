import { createRequestHandler } from '@react-router/express';
import express from 'express';
import 'react-router';

export const app = express();

// Request logging middleware
app.use((req, res, next) => {
	const start = Date.now();
	res.on('finish', () => {
		const duration = Date.now() - start;
		if (process.env.NODE_ENV !== 'production') {
			console.log(
				`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`,
			);
		}
	});
	next();
});

// React Router request handler
app.use(
	createRequestHandler({
		build: () => import('virtual:react-router/server-build'),
	}),
);
