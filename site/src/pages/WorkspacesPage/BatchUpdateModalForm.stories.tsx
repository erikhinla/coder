import { Meta, StoryObj } from "@storybook/react";
import { BatchUpdateModalForm } from "./BatchUpdateModalForm";

const meta: Meta<typeof BatchUpdateModalForm> = {
	title: "pages/WorkspacesPage/BatchUpdateModalForm",
	component: BatchUpdateModalForm,
	args: {
		// Not terribly useful to represent any stories without the modal being
		// open
		open: true,
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const MixOfWorkspaces: Story = {};

export const ProcessingWithWorkspaces: Story = {};

export const OnlyDormant: Story = {};

export const WorkspacesWitFetchError: Story = {};

export const OnlyReadyToUpdate: Story = {};

export const TransitioningWorkspaces: Story = {};

// Be sure to add an action for failing to accept consequences
export const RunningWorkspaces: Story = {};

export const TriggeredVerticalOverflow: Story = {};

export const NoWorkspacesToUpdate: Story = {};
