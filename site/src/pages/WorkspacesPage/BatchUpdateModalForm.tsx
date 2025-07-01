import { TemplateVersion, type Workspace } from "api/typesGenerated";
import { type FC, useMemo, useState } from "react";
import { Dialog, DialogContent } from "components/Dialog/Dialog";
import { Button } from "components/Button/Button";
import { useQueries } from "react-query";
import { templateVersion } from "api/queries/templates";

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

type WorkspaceDeltaEntry = Readonly<{}>;
type WorkspaceDeltas = Map<string, WorkspaceDeltaEntry | null>;

function separateWorkspacesByDormancy(
	workspaces: readonly Workspace[],
): readonly [dormant: readonly Workspace[], active: readonly Workspace[]] {
	const dormant: Workspace[] = [];
	const active: Workspace[] = [];

	for (const ws of workspaces) {
		// If a workspace doesn't have any pending updates whatsoever, we can
		// safely skip processing it
		if (!ws.outdated) {
			continue;
		}
		if (ws.dormant_at) {
			dormant.push(ws);
		} else {
			active.push(ws);
		}
	}

	return [dormant, active];
}

type BatchUpdateModalFormProps = Readonly<{
	workspacesToUpdate: readonly Workspace[];
	onClose: () => void;
	onSubmit: () => void;
}>;

export const BatchUpdateModalForm: FC<BatchUpdateModalFormProps> = ({
	workspacesToUpdate,
	onClose,
	onSubmit,
}) => {
	// We need to take a local snapshot of the workspaces that existed on mount
	// because workspaces are such a mutable resource, and there's a chance that
	// they can be changed by another user + be subject to a query invalidation
	// while the form is open. We need to cross-reference these with the latest
	// workspaces from props so that we can display any changes in the UI
	const [cachedWorkspaces, setCachedWorkspaces] = useState(workspacesToUpdate);
	// Dormant workspaces can't be activated without activating them first. For
	// now, we'll only show the user that some workspaces can't be updated, and
	// then skip over them for all other update logic
	const [dormant, active] = separateWorkspacesByDormancy(cachedWorkspaces);

	// The workspaces don't have all necessary data by themselves, so we need to
	// fetch the unique template versions, and massage the results
	const groups = groupWorkspacesByTemplateVersionId(active);
	const templateVersionQueries = useQueries({
		queries: groups.map((g) => templateVersion(g.templateVersionId)),
	});
	// React Query persists previous errors even if a query is no longer in the
	// error state, so we need to explicitly check the isError property
	const error = templateVersionQueries.find((q) => q.isError)?.error;
	const merged = templateVersionQueries.every((q) => q.isSuccess)
		? templateVersionQueries.map((q) => q.data)
		: undefined;

	// Also need to tease apart workspaces that are actively running, because
	// there's a whole set of warnings we need to issue about them
	const running = active.filter((a) => a.latest_build.status === "running");
	const workspacesChangedWhileOpen = workspacesToUpdate !== cachedWorkspaces;

	const deltas = useMemo<WorkspaceDeltas>(() => new Map(), []);

	return (
		<Dialog>
			<DialogContent>
				<form
					className="max-w-lg px-4"
					onSubmit={(e) => {
						e.preventDefault();
						console.log("Blah");
						onSubmit();
					}}
				>
					<div className="flex flex-row justify-between">
						<h2 className="text-xl font-semibold m-0 leading-tight">
							Review updates
						</h2>
						<Button
							disabled={workspacesChangedWhileOpen}
							onClick={() => setCachedWorkspaces(workspacesToUpdate)}
						>
							Refresh
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
};
