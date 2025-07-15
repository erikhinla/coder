import type {
	Meta,
	ReactRenderer,
	StoryContext,
	StoryObj,
} from "@storybook/react";
import { BatchUpdateModalForm } from "./BatchUpdateModalForm";
import { MockTemplateVersion, MockWorkspace } from "testHelpers/entities";
import { QueryKey, QueryOptions, useQueryClient } from "react-query";
import { templateVersionRoot } from "api/queries/templates";
import type { TemplateVersion, Workspace } from "api/typesGenerated";
import { ComponentProps } from "react";
import { QueryParameterSeed, queryParametersKey } from "testHelpers/chromatic";

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
};

export default meta;
type Story = StoryObj<typeof meta>;

type PatchedDependencies = Readonly<{
	workspaces: readonly Workspace[];
	seeds: QueryParameterSeed[];
}>;
function createPatchedDependencies(size: number): PatchedDependencies {
	const workspaces: Workspace[] = [];
	const seeds: QueryParameterSeed[] = [];

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

type Context = StoryContext<ComponentProps<typeof BatchUpdateModalForm>>;
function patchContext(
	ctx: Context,
	workspaces: readonly Workspace[],
	seeds: QueryParameterSeed[],
): void {
	ctx.args = { ...ctx.args, workspacesToUpdate: workspaces };
	ctx.parameters = { ...ctx.parameters, [queryParametersKey]: seeds };
}

export const NoWorkspacesSelected: Story = {
	args: {
		workspacesToUpdate: [],
	},
};

export const OnlyReadyToUpdate: Story = {
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		patchContext(ctx, workspaces, seeds);
	},
};

export const CurrentlyProcessing: Story = {
	args: { isProcessing: true },
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		patchContext(ctx, workspaces, seeds);
	},
};

/**
 * @todo This story is correct, but the component output is wrong
 */
export const OnlyDormantWorkspaces: Story = {
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		for (const ws of workspaces) {
			const writable = ws as Writeable<Workspace>;
			writable.dormant_at = new Date().toISOString();
		}
		patchContext(ctx, workspaces, seeds);
	},
};

/**
 * @todo This story is correct, but the component output is wrong
 */
export const FetchError: Story = {
	beforeEach: (ctx) => {
		const { workspaces, seeds } = createPatchedDependencies(3);
		patchContext(ctx, workspaces, seeds);
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
