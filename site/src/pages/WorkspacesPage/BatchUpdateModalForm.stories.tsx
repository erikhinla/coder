import type { Meta, StoryObj } from "@storybook/react";
import { BatchUpdateModalForm } from "./BatchUpdateModalForm";
import { MockTemplateVersion, MockWorkspace } from "testHelpers/entities";
import { useQueryClient } from "react-query";
import { templateVersionRoot } from "api/queries/templates";
import type { TemplateVersion, Workspace } from "api/typesGenerated";

const meta: Meta<typeof BatchUpdateModalForm> = {
	title: "pages/WorkspacesPage/BatchUpdateModalForm",
	component: BatchUpdateModalForm,
	args: {
		// There's no point in having stories with the modal not open
		open: true,
		// Not adding logic here, because Radix will make the callback fire
		// every time you click outside the main region. That gets really
		// annoying when working with the Story in the Storybook UI
		onCancel: () => {},
		onSubmit: () => window.alert("Hooray! Everything has been submitted"),
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const NoWorkspacesSelected: Story = {
	args: {
		workspacesToUpdate: [],
	},
};

export const CurrentlyProcessing: Story = {
	args: {
		isProcessing: true,
	},

	beforeEach: (ctx) => {
		const workspaces: Workspace[] = [];
		const templateVersions: TemplateVersion[] = [];

		for (let i = 1; i <= 5; i++) {
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
			templateVersions.push(patchedTemplateVersion);
		}

		ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
		ctx.parameters = { ...ctx.parameters, templateVersions };
	},

	decorators: [
		(Story, ctx) => {
			const queryClient = useQueryClient();
			const versions = ctx.parameters
				.templateVersions as readonly TemplateVersion[];

			for (const ws of ctx.args.workspacesToUpdate) {
				const v = versions.find((v) => v.id === ws.template_active_version_id);
				queryClient.setQueryData(
					[templateVersionRoot, ws.template_active_version_id],
					v,
				);
			}

			return <Story />;
		},
	],
};

export const OnlyDormantWorkspaces: Story = {};

export const FetchError: Story = {};

export const OnlyReadyToUpdate: Story = {};

export const TransitioningWorkspaces: Story = {};

// Be sure to add an action for failing to accept consequences
export const RunningWorkspaces: Story = {};

export const MixOfWorkspaces: Story = {};

export const TriggeredVerticalOverflow: Story = {};

export const NoWorkspacesToUpdate: Story = {};
