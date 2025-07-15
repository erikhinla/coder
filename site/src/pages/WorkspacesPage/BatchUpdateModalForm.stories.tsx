import type {
	Meta,
	ReactRenderer,
	StoryContext,
	StoryObj,
} from "@storybook/react";
import { BatchUpdateModalForm } from "./BatchUpdateModalForm";
import { MockTemplateVersion, MockWorkspace } from "testHelpers/entities";
import { useQueryClient } from "react-query";
import { templateVersionRoot } from "api/queries/templates";
import type { TemplateVersion, Workspace } from "api/typesGenerated";
import { ComponentProps } from "react";

type Writeable<T> = { -readonly [Key in keyof T]: T[Key] };

const templateVersionsKey = "_templateVersions";

const meta: Meta<typeof BatchUpdateModalForm> = {
	title: "pages/WorkspacesPage/BatchUpdateModalForm",
	component: BatchUpdateModalForm,

	args: {
		open: true,
		isProcessing: false,
		onSubmit: () => window.alert("Hooray! Everything has been submitted"),
		// Not adding logic here, because Radix will make the callback fire
		// every time you click outside the main region. That gets really
		// annoying when working with the Story in the Storybook UI
		onCancel: () => {},
	},

	decorators: [
		// This decorator is intended to be attached to each story, to make sure
		// that data-fetching dependencies are properly seeded. But it won't
		// work by itself. Each story must properly initialize all `args`, and
		// embed relevant template versions via `ctx.parameters`. Probably the
		// easiest way to do that is via each story's `beforeEach` function
		(Story, ctx) => {
			const queryClient = useQueryClient();
			const versions = ctx.parameters[
				templateVersionsKey
			] as readonly TemplateVersion[];

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

export default meta;
type Story = StoryObj<typeof meta>;

type PatchedDependencies = Readonly<{
	workspaces: readonly Workspace[];
	templateVersions: readonly TemplateVersion[];
}>;
function createPatchedDependencies(size: number): PatchedDependencies {
	const workspaces: Workspace[] = [];
	const templateVersions: TemplateVersion[] = [];

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
		templateVersions.push(patchedTemplateVersion);
	}

	return { workspaces, templateVersions };
}

type Context = StoryContext<ComponentProps<typeof BatchUpdateModalForm>>;
function patchContext(
	ctx: Context,
	workspaces: readonly Workspace[],
	templateVersions: readonly TemplateVersion[],
): void {
	ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
	ctx.parameters = {
		...ctx.parameters,
		[templateVersionsKey]: templateVersions,
	};
}

export const NoWorkspacesSelected: Story = {
	args: {
		workspacesToUpdate: [],
	},
};

export const CurrentlyProcessing: Story = {
	args: { isProcessing: true },
	beforeEach: (ctx) => {
		const { workspaces, templateVersions } = createPatchedDependencies(3);
		patchContext(ctx, workspaces, templateVersions);
	},
};

export const OnlyDormantWorkspaces: Story = {
	beforeEach: (ctx) => {
		const { workspaces, templateVersions } = createPatchedDependencies(3);
		for (const ws of workspaces) {
			const writable = ws as Writeable<Workspace>;
			writable.dormant_at = new Date().toISOString();
		}
		patchContext(ctx, workspaces, templateVersions);
	},
};

export const FetchError: Story = {};

export const OnlyReadyToUpdate: Story = {};

export const TransitioningWorkspaces: Story = {};

// Be sure to add an action for failing to accept consequences
export const RunningWorkspaces: Story = {};

export const MixOfWorkspaces: Story = {};

export const TriggeredVerticalOverflow: Story = {};

export const NoWorkspacesToUpdate: Story = {};
