import type {
	Meta,
	Parameters,
	StoryContext,
	StoryObj,
} from "@storybook/react";
import { templateVersionRoot } from "api/queries/templates";
import type { TemplateVersion, Workspace } from "api/typesGenerated";
import { useState, type ComponentProps } from "react";
import { useQueryClient } from "react-query";
import { MockTemplateVersion, MockWorkspace } from "testHelpers/entities";
import { BatchUpdateModalForm } from "./BatchUpdateModalForm";

type Writeable<T> = { -readonly [Key in keyof T]: T[Key] };

const meta: Meta<typeof BatchUpdateModalForm> = {
	title: "pages/WorkspacesPage/BatchUpdateModalForm",
	component: BatchUpdateModalForm,
	args: {
		open: true,
		isProcessing: false,
		onSubmit: () => window.alert("Hooray! Everything has been submitted"),
		// Since we're using Radix, any cancel functionality is also going to
		// trigger when you click outside the component bounds, which would make
		// doing an alert really annoying in the Storybook web UI
		onCancel: () => console.log("Canceled"),
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

type Seeds = NonNullable<Parameters["queries"]>;

type PatchedDependencies = Readonly<{
	workspaces: readonly Workspace[];
	seeds: Seeds;
}>;
function createPatchedDependencies(size: number): PatchedDependencies {
	const workspaces: Workspace[] = [];
	const seeds: Seeds = [];

	for (let i = 1; i <= size; i++) {
		const patchedTemplateVersion: TemplateVersion = {
			...MockTemplateVersion,
			id: `${MockTemplateVersion.id}-${i}`,
			name: `${MockTemplateVersion.name}-${i}`,
		};

		const patchedWorkspace: Workspace = {
			...MockWorkspace,
			outdated: true,
			id: `${MockWorkspace.id}-${i}`,
			template_active_version_id: patchedTemplateVersion.id,

			latest_build: {
				...MockWorkspace.latest_build,
				status: "stopped",
			},
		};

		workspaces.push(patchedWorkspace);
		seeds.push({
			key: [templateVersionRoot, patchedWorkspace.template_active_version_id],
			data: patchedTemplateVersion,
		});
	}

	return { workspaces, seeds };
}

export const NoWorkspacesSelected: Story = {
	args: {
		workspacesToUpdate: [],
	},
};

export const OnlyReadyToUpdate: Story = {
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
		ctx.parameters = { ...ctx.parameters, queries: seeds };
	},
};

export const CurrentlyProcessing: Story = {
	args: { isProcessing: true },
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
		ctx.parameters = { ...ctx.parameters, queries: seeds };
	},
};

/**
 * @todo 2025-07-15 - Need to figure out if there's a decent way to validate
 * that the onCancel callback gets called when you press the "Close" button,
 * without going into Jest+RTL.
 */
export const OnlyDormantWorkspaces: Story = {
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		for (const ws of workspaces) {
			const writable = ws as Writeable<Workspace>;
			writable.dormant_at = new Date().toISOString();
		}
		ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
		ctx.parameters = { ...ctx.parameters, queries: seeds };
	},
};

export const FetchError: Story = {
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
		ctx.parameters = { ...ctx.parameters, queries: seeds };
	},
	decorators: [
		(Story, ctx) => {
			const queryClient = useQueryClient();
			queryClient.clear();

			for (const ws of ctx.args.workspacesToUpdate) {
				void queryClient.fetchQuery({
					queryKey: [templateVersionRoot, ws.template_active_version_id],
					queryFn: () => {
						throw new Error("Workspaces? Sir, this is a Wendy's.");
					},
				});
			}

			return <Story />;
		},
	],
};

export const TransitioningWorkspaces: Story = {};

// Be sure to add an action for failing to accept consequences
export const RunningWorkspaces: Story = {};

export const MixOfWorkspaces: Story = {};

export const TriggeredVerticalOverflow: Story = {};

export const NoWorkspacesToUpdate: Story = {};
