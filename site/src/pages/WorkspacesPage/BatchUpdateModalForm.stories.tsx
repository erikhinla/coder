import type { Meta, Parameters, StoryObj } from "@storybook/react";
import { templateVersionRoot } from "api/queries/templates";
import type {
	TemplateVersion,
	Workspace,
	WorkspaceBuild,
} from "api/typesGenerated";
import { useQueryClient } from "react-query";
import { MockTemplateVersion, MockWorkspace } from "testHelpers/entities";
import { BatchUpdateModalForm } from "./BatchUpdateModalForm";
import { ACTIVE_BUILD_STATUSES } from "./WorkspacesPage";
import { expect, screen, userEvent, within } from "@storybook/test";

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

type QueryEntry = NonNullable<Parameters["queries"]>;

type PatchedDependencies = Readonly<{
	workspaces: readonly Workspace[];
	seeds: QueryEntry;
}>;
function createPatchedDependencies(size: number): PatchedDependencies {
	const workspaces: Workspace[] = [];
	const seeds: QueryEntry = [];

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

export const NoWorkspacesToUpdate: Story = {};

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

export const TransitioningWorkspaces: Story = {
	args: { isProcessing: true },
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(
			2 * ACTIVE_BUILD_STATUSES.length,
		);
		for (const [i, ws] of workspaces.entries()) {
			if (i % 2 === 0) {
				continue;
			}
			const writable = ws.latest_build as Writeable<WorkspaceBuild>;
			writable.status = ACTIVE_BUILD_STATUSES[i % ACTIVE_BUILD_STATUSES.length];
		}
		ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
		ctx.parameters = { ...ctx.parameters, queries: seeds };
	},
};

export const RunningWorkspaces: Story = {
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		for (const ws of workspaces) {
			const writable = ws.latest_build as Writeable<WorkspaceBuild>;
			writable.status = "running";
		}
		ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
		ctx.parameters = { ...ctx.parameters, queries: seeds };
	},
	play: async () => {
		// Can't use canvasElement from the play function's context because the
		// component node uses React Portals and won't be part of the main
		// canvas body
		const modal = within(
			screen.getByRole("dialog", { name: "Review updates" }),
		);

		const updateButton = modal.getByRole("button", { name: "Update" });
		await userEvent.click(updateButton, {
			/**
			 * @todo 2025-07-15 - Something in the test setup is causing the
			 * Update button to get treated as though it should opt out of
			 * pointer events, which causes userEvent to break. All of our code
			 * seems to be fine - we do have logic to disable pointer events,
			 * but only when the button is obviously configured wrong (e.g.,
			 * it's configured as a link but has no URL).
			 *
			 * Disabling this check makes things work again, but shoots our
			 * confidence for how accessible the UI is, even if we know that at
			 * this point, the button exists, has the right text content, and is
			 * not disabled.
			 *
			 * We should aim to remove this property as soon as possible,
			 * opening up an issue upstream if necessary.
			 */
			pointerEventsCheck: 0,
		});
		await modal.findByText("Please acknowledge consequences to continue.");

		const checkbox = modal.getByRole("checkbox", {
			name: /I acknowledge these consequences\./,
		});
		expect(checkbox).toHaveFocus();
	},
};

export const MixOfWorkspaces: Story = {};
