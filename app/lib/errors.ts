import { Data } from 'effect';

// Database errors
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
	message: string;
	cause?: unknown;
}> {}

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
	entity: string;
	id: string;
}> {}

// Git errors
export class GitError extends Data.TaggedError('GitError')<{
	message: string;
	cause?: unknown;
}> {}

export class NotAGitRepoError extends Data.TaggedError('NotAGitRepoError')<{
	path: string;
}> {}

export class GitCloneError extends Data.TaggedError('GitCloneError')<{
	url: string;
	cause?: unknown;
}> {}

export class GitFetchError extends Data.TaggedError('GitFetchError')<{
	remote: string;
	cause?: unknown;
}> {}

export class GitDiffError extends Data.TaggedError('GitDiffError')<{
	base: string;
	head: string;
	cause?: unknown;
}> {}

export class GitBranchError extends Data.TaggedError('GitBranchError')<{
	branch: string;
	cause?: unknown;
}> {}

// tmux errors
export class TmuxError extends Data.TaggedError('TmuxError')<{
	message: string;
	cause?: unknown;
}> {}

export class TmuxSessionNotFoundError extends Data.TaggedError(
	'TmuxSessionNotFoundError',
)<{
	session: string;
}> {}

export class TmuxNotAvailableError extends Data.TaggedError(
	'TmuxNotAvailableError',
)<{}> {}

export class TmuxBufferError extends Data.TaggedError('TmuxBufferError')<{
	buffer: string;
	cause?: unknown;
}> {}

export class TmuxSendError extends Data.TaggedError('TmuxSendError')<{
	session: string;
	cause?: unknown;
}> {}

// AI errors
export class AIError extends Data.TaggedError('AIError')<{
	message: string;
	provider?: string;
	cause?: unknown;
}> {}

export class AIProviderUnavailableError extends Data.TaggedError(
	'AIProviderUnavailableError',
)<{
	provider: string;
}> {}

export class AIRateLimitError extends Data.TaggedError('AIRateLimitError')<{
	provider: string;
	retryAfter?: number;
}> {}

export class AIContextLengthError extends Data.TaggedError(
	'AIContextLengthError',
)<{
	provider: string;
	maxTokens: number;
}> {}

export class AINetworkError extends Data.TaggedError('AINetworkError')<{
	provider: string;
	cause?: unknown;
}> {}

// Comment errors
export class CommentNotFoundError extends Data.TaggedError(
	'CommentNotFoundError',
)<{
	id: string;
}> {}

export class CommentValidationError extends Data.TaggedError(
	'CommentValidationError',
)<{
	field: string;
	message: string;
}> {}

// Repo errors
export class RepoNotFoundError extends Data.TaggedError('RepoNotFoundError')<{
	id: string;
}> {}

export class RepoPathNotFoundError extends Data.TaggedError(
	'RepoPathNotFoundError',
)<{
	path: string;
}> {}

export class SessionNotFoundError extends Data.TaggedError(
	'SessionNotFoundError',
)<{
	id: string;
}> {}

// Send errors
export class SendError extends Data.TaggedError('SendError')<{
	message: string;
	cause?: unknown;
}> {}

// Validation errors
export class ValidationError extends Data.TaggedError('ValidationError')<{
	field: string;
	message: string;
}> {}
