import {
	Badge,
	Button,
	Dialog,
	Heading,
	IconButton,
	Text,
	Tooltip,
} from '@radix-ui/themes';
import { Effect } from 'effect';
import { useCallback, useState } from 'react';
import {
	VscAdd,
	VscArrowRight,
	VscGitCommit,
	VscRepo,
	VscTrash,
} from 'react-icons/vsc';
import { Form, redirect, useFetcher, useLoaderData } from 'react-router';

import { EmptyRepos } from '../components/empty-states';
import { SimpleLayout } from '../components/layout';
import { RepoPicker } from '../components/repo-picker';
import { runtime } from '../lib/effect-runtime';
import { RepoService, type RepoWithPath } from '../services/repo.service';
import type { Route } from './+types/home';

export function meta() {
	return [
		{ title: 'PR Reviewer' },
		{ name: 'description', content: 'Review LLM-generated code commits' },
	];
}

export async function loader() {
	return runtime.runPromise(
		Effect.gen(function* () {
			const repo = yield* RepoService;
			const repos = yield* repo.getAllRepos;
			return { repos };
		}),
	);
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const intent = formData.get('intent');

	return runtime.runPromise(
		Effect.gen(function* () {
			const repo = yield* RepoService;

			if (intent === 'add') {
				const path = formData.get('path') as string;
				if (!path) {
					return { error: 'Path is required' };
				}

				const { repo: createdRepo } =
					yield* repo.createOrGetRepoFromPath(path);
				// Get or create session and redirect to review page
				const session = yield* repo.getOrCreateSession(
					createdRepo.id,
					path,
				);
				return redirect(
					`/review/${session.id}?path=${encodeURIComponent(path)}`,
				);
			}

			if (intent === 'delete') {
				const repoId = formData.get('repoId') as string;
				if (repoId) {
					yield* repo.deleteRepo(repoId);
				}
				return { success: true };
			}

			if (intent === 'open') {
				const repoId = formData.get('repoId') as string;
				const path = formData.get('path') as string;
				if (repoId && path) {
					const session = yield* repo.getOrCreateSession(
						repoId,
						path,
					);
					return redirect(
						`/review/${session.id}?path=${encodeURIComponent(path)}`,
					);
				}
				return { error: 'Missing repo or path' };
			}

			return { error: 'Unknown action' };
		}).pipe(
			Effect.catchAll((error) =>
				Effect.succeed({
					error: String(error) || 'Failed to perform action',
				}),
			),
		),
	);
}

export default function Home() {
	const { repos } = useLoaderData<typeof loader>();
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const fetcher = useFetcher();

	const handleSelectRepo = useCallback(
		(path: string) => {
			setIsAddModalOpen(false);
			fetcher.submit(
				{ intent: 'add', path },
				{ method: 'POST', action: '/?index' },
			);
		},
		[fetcher],
	);

	const handleOpenModal = useCallback(() => {
		setIsAddModalOpen(true);
	}, []);

	const handleCloseModal = useCallback(() => {
		setIsAddModalOpen(false);
	}, []);

	return (
		<SimpleLayout>
			<div className="max-w-4xl mx-auto p-8 space-y-8">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<Heading size="5" className="text-theme-primary">
							Repositories
						</Heading>
						<Text size="2" className="text-theme-secondary">
							{repos.length === 0
								? 'Add a repository to get started'
								: `${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'}`}
						</Text>
					</div>
					<Button
						size="3"
						onClick={handleOpenModal}
						className="btn-press"
					>
						<VscAdd className="w-4 h-4" />
						Add Repository
					</Button>
				</div>

				{repos.length === 0 ? (
					<EmptyRepos onAddRepo={handleOpenModal} />
				) : (
					<div className="grid gap-4">
						{repos.map((repo) => (
							<RepoCard key={repo.id} repo={repo} />
						))}
					</div>
				)}
			</div>

			{/* Add Repository Modal */}
			<Dialog.Root open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
				<Dialog.Content className="max-w-2xl">
					<Dialog.Title>Add Repository</Dialog.Title>
					<RepoPicker
						onSelect={handleSelectRepo}
						onCancel={handleCloseModal}
					/>
				</Dialog.Content>
			</Dialog.Root>
		</SimpleLayout>
	);
}

function RepoCard({ repo }: { repo: RepoWithPath }) {
	const primaryPath = repo.paths[0]?.path;

	return (
		<div className="card-hover p-4 animate-fade-in-up">
			<div className="flex items-start justify-between gap-4">
				{/* Left side - Repo info */}
				<div className="flex items-start gap-3 min-w-0 flex-1">
					<div className="p-2 rounded-lg shrink-0 bg-theme-surface-hover">
						<VscRepo className="w-5 h-5 text-theme-secondary" />
					</div>
					<div className="min-w-0 flex-1 space-y-1">
						<Heading
							size="3"
							truncate
							className="text-theme-primary"
						>
							{repo.name}
						</Heading>
						{repo.remote_url ? (
							<Text
								size="1"
								truncate
								className="text-theme-muted"
							>
								{repo.remote_url}
							</Text>
						) : (
							<Text size="1" className="text-theme-muted">
								Local repository
							</Text>
						)}
						{primaryPath && (
							<div className="flex items-center gap-1 text-theme-muted">
								<VscGitCommit className="w-3.5 h-3.5" />
								<Text size="1" truncate>
									{primaryPath}
								</Text>
							</div>
						)}
					</div>
				</div>

				{/* Right side - Actions */}
				<div className="flex items-center gap-2 shrink-0">
					{primaryPath && (
						<Form method="POST" action="/?index">
							<input type="hidden" name="intent" value="open" />
							<input
								type="hidden"
								name="repoId"
								value={repo.id}
							/>
							<input
								type="hidden"
								name="path"
								value={primaryPath}
							/>
							<Button
								type="submit"
								size="2"
								className="btn-press"
							>
								Open
								<VscArrowRight className="w-4 h-4" />
							</Button>
						</Form>
					)}
					<Form method="POST" action="/?index">
						<input type="hidden" name="intent" value="delete" />
						<input type="hidden" name="repoId" value={repo.id} />
						<Tooltip content="Delete repository">
							<IconButton
								type="submit"
								variant="ghost"
								color="red"
								className="btn-press"
								aria-label="Delete repository"
							>
								<VscTrash className="w-4 h-4" />
							</IconButton>
						</Tooltip>
					</Form>
				</div>
			</div>

			{/* Multiple paths indicator */}
			{repo.paths.length > 1 && (
				<div className="pt-3 theme-divider space-y-2">
					<Text size="1" className="text-theme-muted">
						{repo.paths.length} paths linked
					</Text>
					<div className="flex flex-wrap gap-2">
						{repo.paths.slice(0, 3).map((p) => (
							<Badge
								key={p.id}
								variant="soft"
								color="gray"
								size="1"
							>
								{p.path.split('/').pop()}
							</Badge>
						))}
						{repo.paths.length > 3 && (
							<Badge variant="soft" color="gray" size="1">
								+{repo.paths.length - 3} more
							</Badge>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
