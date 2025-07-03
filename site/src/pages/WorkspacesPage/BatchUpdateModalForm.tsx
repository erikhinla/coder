import type { Workspace, WorkspaceStatus } from "api/typesGenerated";
import {
	type FC,
	forwardRef,
	type ReactNode,
	Suspense,
	useId,
	useRef,
	useState,
} from "react";
import { Dialog, DialogContent, DialogTitle } from "components/Dialog/Dialog";
import { Button } from "components/Button/Button";
import { useQueries, useSuspenseQueries } from "react-query";
import { templateVersion } from "api/queries/templates";
import { Loader } from "components/Loader/Loader";
import { ErrorAlert } from "components/Alert/ErrorAlert";
import { Avatar } from "components/Avatar/Avatar";
import { cn } from "utils/cn";
import { Checkbox } from "components/Checkbox/Checkbox";
import { Badge } from "components/Badge/Badge";
import { Label } from "@radix-ui/react-label";
import { Spinner } from "components/Spinner/Spinner";

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
		const templateVersionId = ws.template_active_version_id;
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

type UpdateTypePartition = Readonly<{
	dormant: readonly Workspace[];
	noUpdateNeeded: readonly Workspace[];
	readyToUpdate: readonly Workspace[];
}>;

function separateWorkspacesByUpdateType(
	workspaces: readonly Workspace[],
): UpdateTypePartition {
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
	running?: boolean;
	label?: ReactNode;
	adornment?: ReactNode;
	className?: string;
}>;

const ReviewPanel: FC<WorkspacePanelProps> = ({
	workspaceName,
	label,
	running,
	workspaceIconUrl,
	className,
}) => {
	// Preemptively adding border to this component so that it still looks
	// decent when used outside of a list
	return (
		<div
			className={cn(
				"rounded-md px-4 py-3 border border-solid border-border text-sm",
				className,
			)}
		>
			<div className="flex flex-row flex-wrap grow items-center gap-3">
				<Avatar size="sm" variant="icon" src={workspaceIconUrl} />
				<div className="flex flex-col gap-0.5">
					<span className="flex flex-row items-center gap-2">
						<span className="leading-tight">{workspaceName}</span>
						{running && (
							<Badge size="xs" variant="warning" border="none">
								Running
							</Badge>
						)}
					</span>
					<span className="text-xs leading-tight text-content-secondary">
						{label}
					</span>
				</div>
			</div>
		</div>
	);
};

type TemplateNameChangeProps = Readonly<{
	oldTemplateName: string;
	newTemplateName: string;
}>;

const TemplateNameChange: FC<TemplateNameChangeProps> = ({
	oldTemplateName,
	newTemplateName,
}) => {
	return (
		<>
			<span aria-hidden>
				{oldTemplateName} &rarr; {newTemplateName}
			</span>
			<span className="sr-only">
				Template {oldTemplateName} will be updated to template {newTemplateName}
			</span>
		</>
	);
};

type RunningWorkspacesWarningProps = Readonly<{
	acceptedConsequences: boolean;
	onAcceptedConsequencesChange: (newValue: boolean) => void;
}>;

const RunningWorkspacesWarning = forwardRef<
	HTMLButtonElement,
	RunningWorkspacesWarningProps
>(({ acceptedConsequences, onAcceptedConsequencesChange }, ref) => {
	return (
		<div className="rounded-md border-border-warning border border-solid p-4">
			<h4 className="m-0 font-semibold">Running workspaces detected</h4>
			<ul className="flex flex-col gap-1 m-0 [&>li]:leading-snug text-content-secondary pt-1">
				<li>
					Updating a workspace will start it on its latest template version.
					This can delete non-persistent data.
				</li>
				<li>
					Anyone connected to a running workspace will be disconnected until the
					update is complete.
				</li>
				<li>Any unsaved data will be lost.</li>
			</ul>
			<Label className="flex flex-row gap-2 items-center pt-4">
				<Checkbox
					ref={ref}
					className="border-border-warning bg-surface-orange"
					checked={acceptedConsequences}
					onCheckedChange={onAcceptedConsequencesChange}
				/>
				I acknowledge these consequences.
			</Label>
		</div>
	);
});

// Used to force the user to acknowledge that batch updating has risks in
// certain situations and could destroy their data
type ConsequencesStage = "notAccepted" | "accepted" | "failedValidation";

const transitioningStatuses: readonly WorkspaceStatus[] = [
	"canceling",
	"deleting",
	"pending",
	"starting",
	"stopping",
];

type ReviewFormProps = Readonly<{
	workspacesToUpdate: readonly Workspace[];
	isProcessing: boolean;
	onCancel: () => void;
	onSubmit: () => void;
}>;

const ReviewForm: FC<ReviewFormProps> = ({
	workspacesToUpdate,
	isProcessing,
	onCancel,
	onSubmit,
}) => {
	const hookId = useId();
	const [stage, setStage] = useState<ConsequencesStage>("notAccepted");
	const checkboxRef = useRef<HTMLButtonElement>(null);

	// We have to make sure that we don't let the user submit anything while
	// workspaces are transitioning, or else we'll run into a race condition.
	// If a user starts a workspace, and then immediately batch-updates it, the
	// workspace won't be in the running state yet. We need to issue warnings
	// about how updating running workspaces is a destructive action, but if
	// the user goes through the form quickly enough, they'll be able to update
	// without seeing the warning
	const transitioning = workspacesToUpdate.filter((ws) =>
		transitioningStatuses.includes(ws.latest_build.status),
	);

	// Dormant workspaces can't be activated without activating them first. For
	// now, we'll only show the user that some workspaces can't be updated, and
	// then skip over them for all other update logic
	const { dormant, noUpdateNeeded, readyToUpdate } =
		separateWorkspacesByUpdateType(workspacesToUpdate);

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

	const runningIds = new Set<string>(
		readyToUpdate
			.filter((ws) => ws.latest_build.status === "running")
			.map((ws) => ws.id),
	);

	const failedValidationId = `${hookId}-failed-validation`;
	const hasRunningWorkspaces = runningIds.size > 0;
	const consequencesResolved = !hasRunningWorkspaces || stage === "accepted";
	const canSubmit =
		consequencesResolved && error === undefined && readyToUpdate.length > 0;

	return (
		<form
			className="max-h-[80vh]"
			onSubmit={(e) => {
				e.preventDefault();
				if (canSubmit) {
					onSubmit();
					return;
				}
				if (stage === "notAccepted") {
					setStage("failedValidation");
					checkboxRef.current?.scrollIntoView();
				}
			}}
		>
			{error !== undefined ? (
				<ErrorAlert error={error} />
			) : (
				<>
					<div className="overflow-y-auto flex flex-col gap-2 pb-3">
						<div className="flex flex-row justify-between items-center pb-4">
							<DialogTitle asChild>
								<h3 className="text-3xl font-semibold m-0 leading-tight">
									Review updates
								</h3>
							</DialogTitle>
						</div>

						{hasRunningWorkspaces && (
							<div className="pb-2">
								<RunningWorkspacesWarning
									acceptedConsequences={stage === "accepted"}
									onAcceptedConsequencesChange={(newChecked) => {
										const newStage = newChecked ? "accepted" : "notAccepted";
										setStage(newStage);
									}}
								/>
							</div>
						)}

						{readyToUpdate.length > 0 && (
							<section>
								<div className="max-w-prose">
									<h4 className="m-0">Ready to update</h4>
									<p className="m-0 text-sm leading-snug text-content-secondary">
										These workspaces require no additional build parameters to
										update.
									</p>
								</div>

								<ul className="list-none p-0 flex flex-col rounded-md border border-solid border-border">
									{readyToUpdate.map((ws) => {
										const matchedQuery = templateVersionQueries.find(
											(q) => q.data?.id === ws.template_active_version_id,
										);
										const newTemplateName = matchedQuery?.data?.name;

										return (
											<li
												key={ws.id}
												className="[&:not(:last-child)]:border-b-border [&:not(:last-child)]:border-b [&:not(:last-child)]:border-solid border-0"
											>
												<ReviewPanel
													className="border-none"
													running={runningIds.has(ws.id)}
													workspaceName={ws.name}
													workspaceIconUrl={ws.template_icon}
													label={
														newTemplateName !== undefined && (
															<TemplateNameChange
																newTemplateName={newTemplateName}
																oldTemplateName={
																	ws.latest_build.template_version_name
																}
															/>
														)
													}
												/>
											</li>
										);
									})}
								</ul>
							</section>
						)}

						{noUpdateNeeded.length > 0 && (
							<section>
								<div className="max-w-prose">
									<h4 className="m-0">Already updated</h4>
									<p className="m-0 text-sm leading-snug text-content-secondary">
										These workspaces are already updated and will be skipped.
									</p>
								</div>

								<ul className="list-none p-0 flex flex-col rounded-md border border-solid border-border">
									{noUpdateNeeded.map((ws) => (
										<li
											key={ws.id}
											className="[&:not(:last-child)]:border-b-border [&:not(:last-child)]:border-b [&:not(:last-child)]:border-solid border-0"
										>
											<ReviewPanel
												className="border-none"
												workspaceName={ws.name}
												workspaceIconUrl={ws.template_icon}
											/>
										</li>
									))}
								</ul>
							</section>
						)}

						{dormant.length > 0 && (
							<section>
								<div className="max-w-prose">
									<h4 className="m-0">Dormant workspaces</h4>
									<p className="m-0 text-sm leading-snug text-content-secondary">
										Dormant workspaces cannot be updated without first
										activating the workspace. They will be skipped during the
										batch update.
									</p>
								</div>

								<ul className="list-none p-0 flex flex-col rounded-md border border-solid border-border">
									{dormant.map((ws) => (
										<li
											key={ws.id}
											className="[&:not(:last-child)]:border-b-border [&:not(:last-child)]:border-b [&:not(:last-child)]:border-solid border-0"
										>
											<ReviewPanel
												className="border-none"
												workspaceName={ws.name}
												workspaceIconUrl={ws.template_icon}
											/>
										</li>
									))}
								</ul>
							</section>
						)}
					</div>

					<div className="border-0 border-t border-solid border-t-border pt-8">
						<div className="flex flex-row flex-wrap justify-end gap-4">
							<Button variant="outline" onClick={onCancel}>
								Cancel
							</Button>
							<Button
								variant="default"
								type="submit"
								disabled={isProcessing}
								aria-describedby={
									stage === "failedValidation" ? failedValidationId : undefined
								}
							>
								{isProcessing && (
									<>
										<Spinner loading />
										<span className="sr-only">
											Waiting for workspaces to finish processing
										</span>
									</>
								)}
								<span aria-hidden={isProcessing}>Update</span>
							</Button>
						</div>

						{stage === "failedValidation" && (
							<p
								id={failedValidationId}
								className="m-0 text-highlight-red text-right text-sm pt-2"
							>
								Please check the checkbox to continue.
							</p>
						)}
					</div>
				</>
			)}
		</form>
	);
};

type BatchUpdateModalFormProps = Readonly<{
	open: boolean;
	isProcessing: boolean;
	workspacesToUpdate: readonly Workspace[];
	onCancel: () => void;
	onSubmit: () => void;
}>;

export const BatchUpdateModalForm: FC<BatchUpdateModalFormProps> = ({
	open,
	isProcessing,
	workspacesToUpdate,
	onCancel,
	onSubmit,
}) => {
	return (
		<Dialog
			open={open}
			onOpenChange={() => {
				if (open) {
					onCancel();
				}
			}}
		>
			<DialogContent className="max-w-screen-md">
				<ReviewForm
					workspacesToUpdate={workspacesToUpdate}
					isProcessing={isProcessing}
					onCancel={onCancel}
					onSubmit={onSubmit}
				/>
			</DialogContent>
		</Dialog>
	);
};
