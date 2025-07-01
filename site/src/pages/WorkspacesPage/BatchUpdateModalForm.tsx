import type { Workspace } from "api/typesGenerated";
import { type FC, ReactElement, ReactNode, useState } from "react";
import { Dialog, DialogContent } from "components/Dialog/Dialog";
import { Button } from "components/Button/Button";
import { useQueries } from "react-query";
import { templateVersion } from "api/queries/templates";
import { Loader } from "components/Loader/Loader";
import { ErrorAlert } from "components/Alert/ErrorAlert";
import { Avatar } from "components/Avatar/Avatar";

/**
 * @todo Need to decide if we should include the template display name here, or
 * if we'll be able to get that data as part of other fetches. It's also
 * possible that the new UX might not require it at all?
 */
type TemplateVersionGroup = Readonly<{
	templateVersionId: string;
	affectedWorkspaces: readonly Workspace[];
}>;

function groupWorkspacesByTemplateVersionId(
	workspaces: readonly Workspace[],
): readonly TemplateVersionGroup[] {
	const grouped = new Map<string, TemplateVersionGroup>();

	for (const ws of workspaces) {
		const templateVersionId = ws.latest_build.template_version_id;
		const value = grouped.get(templateVersionId);
		if (value !== undefined) {
			// Need to do type assertion to make value mutable as an
			// implementation detail. Doing things the "proper" way adds a bunch
			// of needless boilerplate for a single-line computation
			const target = value.affectedWorkspaces as Workspace[];
			target.push(ws);
			continue;
		}

		grouped.set(templateVersionId, {
			templateVersionId,
			affectedWorkspaces: [ws],
		});
	}

	return [...grouped.values()];
}

type Separation = Readonly<{
	dormant: readonly Workspace[];
	noUpdateNeeded: readonly Workspace[];
	readyToUpdate: readonly Workspace[];
}>;

function separateWorkspaces(workspaces: readonly Workspace[]): Separation {
	const noUpdateNeeded: Workspace[] = [];
	const dormant: Workspace[] = [];
	const readyToUpdate: Workspace[] = [];

	for (const ws of workspaces) {
		if (!ws.outdated) {
			noUpdateNeeded.push(ws);
			continue;
		}
		if (ws.dormant_at !== null) {
			dormant.push(ws);
			continue;
		}
		readyToUpdate.push(ws);
	}

	return { dormant, noUpdateNeeded, readyToUpdate };
}

type WorkspacePanelProps = Readonly<{
	workspaceName: string;
	workspaceIconUrl: string;
	label?: ReactNode;
	adornment?: ReactNode;
}>;

const ReviewPanel: FC<WorkspacePanelProps> = ({
	workspaceName,
	label,
	workspaceIconUrl,
}) => {
	return (
		<div className="rounded-md px-4 py-2 border border-solid border-content-secondary/50 text-sm">
			<div className="flex flex-row flex-wrap grow items-center gap-2">
				<Avatar size="sm" variant="icon" src={workspaceIconUrl} />
				{workspaceName}
			</div>
		</div>
	);
};

type ReviewFormProps = Readonly<{
	workspacesToUpdate: readonly Workspace[];
	onCancel: () => void;
	onSubmit: () => void;
}>;

const ReviewForm: FC<ReviewFormProps> = ({
	workspacesToUpdate,
	onCancel,
	onSubmit,
}) => {
	// We need to take a local snapshot of the workspaces that existed on mount
	// because workspaces are such a mutable resource, and there's a chance that
	// they can be changed by another user + be subject to a query invalidation
	// while the form is open
	const [cachedWorkspaces, setCachedWorkspaces] = useState(workspacesToUpdate);
	// Dormant workspaces can't be activated without activating them first. For
	// now, we'll only show the user that some workspaces can't be updated, and
	// then skip over them for all other update logic
	const { dormant, noUpdateNeeded, readyToUpdate } =
		separateWorkspaces(cachedWorkspaces);

	// The workspaces don't have all necessary data by themselves, so we need to
	// fetch the unique template versions, and massage the results
	const groups = groupWorkspacesByTemplateVersionId(readyToUpdate);
	const templateVersionQueries = useQueries({
		queries: groups.map((g) => templateVersion(g.templateVersionId)),
	});
	// React Query persists previous errors even if a query is no longer in the
	// error state, so we need to explicitly check the isError property to see
	// if any of the queries actively have an error
	const error = templateVersionQueries.find((q) => q.isError)?.error;
	const merged = templateVersionQueries.every((q) => q.isSuccess)
		? templateVersionQueries.map((q) => q.data)
		: undefined;

	// Also need to tease apart workspaces that are actively running, because
	// there's a whole set of warnings we need to issue about them
	const running = readyToUpdate.filter(
		(ws) => ws.latest_build.status === "running",
	);

	const workspacesChangedWhileOpen = workspacesToUpdate !== cachedWorkspaces;
	const updateIsReady = error !== undefined && readyToUpdate.length > 0;

	return (
		<form
			className="overflow-y-auto max-h-[90vh]"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="flex flex-row justify-between items-center pb-6">
				<h3 className="text-2xl font-semibold m-0 leading-tight">
					Review update
				</h3>

				<Button
					variant="outline"
					disabled={!workspacesChangedWhileOpen}
					onClick={() => setCachedWorkspaces(workspacesToUpdate)}
				>
					Refresh list
				</Button>
			</div>

			{error !== undefined && <ErrorAlert error={error} />}

			{noUpdateNeeded.length > 0 && (
				<section className="border-0 border-t border-solid border-t-content-secondary/25 py-4">
					<div className="max-w-prose">
						<h4 className="m-0">Updated workspaces</h4>
						<p className="m-0 text-sm leading-snug text-content-secondary">
							These workspaces are fully up to date and will be skipped during
							the update.
						</p>
					</div>

					<ul className="list-none p-0">
						{noUpdateNeeded.map((ws) => (
							<li key={ws.id}>
								<ReviewPanel
									workspaceName={ws.name}
									workspaceIconUrl={ws.template_icon}
								/>
							</li>
						))}
					</ul>
				</section>
			)}

			{dormant.length > 0 && (
				<section className="border-0 border-t border-solid border-t-content-secondary/25 py-4">
					<div className="max-w-prose">
						<h4 className="m-0">Dormant workspaces</h4>
						<p className="m-0 text-sm leading-snug text-content-secondary">
							Dormant workspaces cannot be updated without first activating the
							workspace. They will be skipped during the batch update.
						</p>
					</div>

					<ul className="list-none p-0">
						{dormant.map((ws) => (
							<li key={ws.id}>
								<ReviewPanel
									workspaceName={ws.name}
									workspaceIconUrl={ws.template_icon}
								/>
							</li>
						))}
					</ul>
				</section>
			)}

			<div className="flex flex-row flex-wrap justify-end gap-4">
				<Button variant="outline" onClick={onCancel}>
					Cancel
				</Button>
				<Button variant="default" type="submit" disabled={!updateIsReady}>
					Update
				</Button>
			</div>
		</form>
	);
};

type BatchUpdateModalFormProps = Readonly<{
	workspacesToUpdate: readonly Workspace[];
	open: boolean;
	loading: boolean;
	onClose: () => void;
	onSubmit: () => void;
}>;

export const BatchUpdateModalForm: FC<BatchUpdateModalFormProps> = ({
	open,
	loading,
	workspacesToUpdate,
	onClose,
	onSubmit,
}) => {
	return (
		<Dialog
			open={open}
			onOpenChange={() => {
				if (open) {
					onClose();
				}
			}}
		>
			<DialogContent className="max-w-screen-md">
				{loading ? (
					<Loader />
				) : (
					<ReviewForm
						workspacesToUpdate={workspacesToUpdate}
						onCancel={onClose}
						onSubmit={() => {
							onSubmit();
							onClose();
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
};
