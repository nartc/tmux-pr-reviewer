import { Button, Dialog, Spinner, Text, TextField } from '@radix-ui/themes';
import { useEffect, useState } from 'react';
import { VscCheck, VscSourceControl } from 'react-icons/vsc';
import { useFetcher } from 'react-router';

interface BaseBranchSelectorProps {
	currentBaseBranch: string;
	repoId: string;
	sessionId: string;
	onBranchChange?: (branch: string) => void;
}

export function BaseBranchSelector({
	currentBaseBranch,
	repoId,
	sessionId,
	onBranchChange,
}: BaseBranchSelectorProps) {
	const [open, setOpen] = useState(false);
	const [branches, setBranches] = useState<string[]>([]);
	const [selectedBranch, setSelectedBranch] = useState(currentBaseBranch);
	const [loading, setLoading] = useState(false);
	const fetcher = useFetcher();

	useEffect(() => {
		if (open) {
			fetchBranches();
		}
	}, [open]);

	const fetchBranches = async () => {
		setLoading(true);
		try {
			setBranches(['main', 'master', 'develop', 'staging']);
		} catch (error) {
			console.error('Failed to fetch branches:', error);
		}
		setLoading(false);
	};

	const handleSave = () => {
		fetcher.submit(
			{
				intent: 'updateBaseBranch',
				sessionId,
				baseBranch: selectedBranch,
			},
			{ method: 'POST', action: '/api/repos' },
		);
		onBranchChange?.(selectedBranch);
		setOpen(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger>
				<Button
					variant="ghost"
					size="1"
					className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
					aria-label={`Change base branch (currently ${currentBaseBranch})`}
				>
					<VscSourceControl aria-hidden="true" />
					{currentBaseBranch}
				</Button>
			</Dialog.Trigger>

			<Dialog.Content maxWidth="350px" className="space-y-4">
				<Dialog.Title>Select Base Branch</Dialog.Title>

				{loading ? (
					<div className="flex items-center justify-center py-8">
						<Spinner size="3" />
					</div>
				) : (
					<div
						className="space-y-1"
						role="radiogroup"
						aria-label="Select base branch"
					>
						{branches.map((branch) => (
							<Button
								key={branch}
								variant="ghost"
								onClick={() => setSelectedBranch(branch)}
								role="radio"
								aria-checked={selectedBranch === branch}
								className={`w-full justify-between ${
									selectedBranch === branch
										? 'bg-zinc-100 dark:bg-zinc-800/50'
										: ''
								}`}
							>
								<Text size="2">{branch}</Text>
								{selectedBranch === branch && (
									<VscCheck aria-hidden="true" />
								)}
							</Button>
						))}
					</div>
				)}

				{/* Custom branch input */}
				<div className="space-y-2">
					<Text size="2" weight="medium">
						Or enter a custom branch:
					</Text>
					<TextField.Root
						value={selectedBranch}
						onChange={(e) => setSelectedBranch(e.target.value)}
						placeholder="branch-name"
					/>
				</div>

				<div className="flex justify-end gap-2">
					<Dialog.Close>
						<Button variant="soft" color="gray">
							Cancel
						</Button>
					</Dialog.Close>
					<Button onClick={handleSave} disabled={!selectedBranch}>
						Apply
					</Button>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	);
}
