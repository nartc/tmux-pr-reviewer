import { DropdownMenu, IconButton, Text } from '@radix-ui/themes';
import { useState, type ReactNode } from 'react';
import { VscChevronLeft, VscChevronRight, VscSettings } from 'react-icons/vsc';
import { useTheme } from '../lib/theme.js';
import { GlobalLoadingBar } from './GlobalLoadingBar.js';

interface LayoutProps {
	children: ReactNode;
	leftSidebar?: ReactNode;
	rightSidebar?: ReactNode;
	header?: ReactNode;
	headerActions?: ReactNode;
}

export function Layout({
	children,
	leftSidebar,
	rightSidebar,
	header,
	headerActions,
}: LayoutProps) {
	const [leftCollapsed, setLeftCollapsed] = useState(true);

	return (
		<div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
			<GlobalLoadingBar />
			{/* Header */}
			<header className="h-12 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0">
				<div className="flex items-center gap-4">
					<Text size="4" weight="bold">
						PR Reviewer
					</Text>
					{header}
				</div>
				<div className="flex items-center gap-2">
					{headerActions}
					<SettingsMenu />
				</div>
			</header>

			{/* Small screen message */}
			<div className="flex md:hidden items-center justify-center flex-1 p-4 text-center text-gray-500">
				<Text color="gray">
					Please use a larger screen (tablet or desktop) for the best
					experience.
				</Text>
			</div>

			{/* Main content area - hidden on small screens */}
			<div className="hidden md:flex flex-1 overflow-hidden">
				{/* Left sidebar */}
				{leftSidebar && (
					<aside
						aria-label="File explorer"
						className={`border-r border-gray-200 dark:border-gray-800 shrink-0 flex flex-col transition-all duration-200 ${
							leftCollapsed ? 'w-10' : 'w-64'
						}`}
					>
						{/* Collapse toggle */}
						<IconButton
							variant="ghost"
							size="1"
							onClick={() => setLeftCollapsed(!leftCollapsed)}
							className="!w-full !rounded-none h-8"
							aria-label={
								leftCollapsed
									? 'Expand file explorer'
									: 'Collapse file explorer'
							}
							aria-expanded={!leftCollapsed}
						>
							{leftCollapsed ? (
								<VscChevronRight aria-hidden="true" />
							) : (
								<VscChevronLeft aria-hidden="true" />
							)}
						</IconButton>
						{/* Sidebar content */}
						<div
							className={`flex-1 overflow-y-auto ${leftCollapsed ? 'hidden' : ''}`}
						>
							{leftSidebar}
						</div>
					</aside>
				)}

				{/* Main content */}
				<main className="flex-1 overflow-auto">{children}</main>

				{/* Right sidebar */}
				{rightSidebar && (
					<aside
						aria-label="Comment queue"
						className="w-80 border-l border-gray-200 dark:border-gray-800 overflow-y-auto shrink-0"
					>
						{rightSidebar}
					</aside>
				)}
			</div>
		</div>
	);
}

function SettingsMenu() {
	const { theme, setTheme, density, setDensity } = useTheme();

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<IconButton variant="ghost" aria-label="Settings">
					<VscSettings />
				</IconButton>
			</DropdownMenu.Trigger>

			<DropdownMenu.Content align="end" sideOffset={5}>
				<DropdownMenu.Label>Theme</DropdownMenu.Label>
				<DropdownMenu.RadioGroup
					value={theme}
					onValueChange={(v) => setTheme(v as typeof theme)}
				>
					<DropdownMenu.RadioItem value="light">
						Light
					</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="dark">
						Dark
					</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="system">
						System
					</DropdownMenu.RadioItem>
				</DropdownMenu.RadioGroup>

				<DropdownMenu.Separator />

				<DropdownMenu.Label>Density</DropdownMenu.Label>
				<DropdownMenu.RadioGroup
					value={density}
					onValueChange={(v) => setDensity(v as typeof density)}
				>
					<DropdownMenu.RadioItem value="normal">
						Normal
					</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="compact">
						Compact
					</DropdownMenu.RadioItem>
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
}

// Simple layout without sidebars for landing page
export function SimpleLayout({ children }: { children: ReactNode }) {
	return (
		<div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
			<header className="h-12 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0">
				<Text size="4" weight="bold">
					PR Reviewer
				</Text>
				<SettingsMenu />
			</header>
			<main className="flex-1 overflow-auto">{children}</main>
		</div>
	);
}
