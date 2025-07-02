import { getErrorDetail, getErrorMessage } from "api/errors";
import { workspacePermissionsByOrganization } from "api/queries/organizations";
import { templates } from "api/queries/templates";
import { workspaces } from "api/queries/workspaces";
import { useFilter } from "components/Filter/Filter";
import { useUserFilterMenu } from "components/Filter/UserFilter";
import { displayError } from "components/GlobalSnackbar/utils";
import { useAuthenticated } from "hooks";
import { useEffectEvent } from "hooks/hookPolyfills";
import { usePagination } from "hooks/usePagination";
import { useDashboard } from "modules/dashboard/useDashboard";
import { useOrganizationsFilterMenu } from "modules/tableFiltering/options";
import { type FC, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "react-query";
import { useSearchParams } from "react-router-dom";
import { pageTitle } from "utils/page";
import { BatchDeleteConfirmation } from "./BatchDeleteConfirmation";
import { WorkspacesPageView } from "./WorkspacesPageView";
import { useBatchActions } from "./batchActions";
import { useStatusFilterMenu, useTemplateFilterMenu } from "./filter/menus";
import { BatchUpdateModalForm } from "./BatchUpdateModalForm";

function useSafeSearchParams(): ReturnType<typeof useSearchParams> {
	// Have to wrap setSearchParams because React Router doesn't make sure that
	// the function's memory reference stays stable on each render, even though
	// its logic never changes, and even though it has function update support
	const [searchParams, setSearchParams] = useSearchParams();
	const stableSetSearchParams = useEffectEvent(setSearchParams);

	// Need this to be a tuple type, but can't use "as const", because that would
	// make the whole array readonly and cause type mismatches downstream
	return [searchParams, stableSetSearchParams] as ReturnType<
		typeof useSearchParams
	>;
}

type BatchAction = "delete" | "update";

const WorkspacesPage: FC = () => {
	const queryClient = useQueryClient();
	// If we use a useSearchParams for each hook, the values will not be in sync.
	// So we have to use a single one, centralizing the values, and pass it to
	// each hook.
	const [searchParams, setSearchParams] = useSafeSearchParams();
	const pagination = usePagination({
		searchParams,
		onSearchParamsChange: setSearchParams,
	});
	const { permissions, user: me } = useAuthenticated();
	const { entitlements } = useDashboard();
	const templatesQuery = useQuery(templates());
	const workspacePermissionsQuery = useQuery(
		workspacePermissionsByOrganization(
			templatesQuery.data?.map((template) => template.organization_id),
			me.id,
		),
	);

	// Filter templates based on workspace creation permission
	const filteredTemplates = useMemo(() => {
		if (!templatesQuery.data || !workspacePermissionsQuery.data) {
			return templatesQuery.data;
		}

		return templatesQuery.data.filter((template) => {
			const workspacePermission =
				workspacePermissionsQuery.data[template.organization_id];
			return workspacePermission?.createWorkspaceForUserID;
		});
	}, [templatesQuery.data, workspacePermissionsQuery.data]);

	const filterProps = useWorkspacesFilter({
		searchParams,
		onSearchParamsChange: setSearchParams,
		onFilterChange: () => pagination.goToPage(1),
	});

	const workspacesQueryOptions = workspaces({
		...pagination,
		q: filterProps.filter.query,
	});
	const { data, error, refetch } = useQuery({
		...workspacesQueryOptions,
		refetchInterval: ({ state }) => {
			return state.error ? false : 5_000;
		},
	});

	const [checkedWorkspaceIds, setCheckedWorkspaceIds] = useState(
		new Set<string>(),
	);
	const checkedWorkspaces =
		data?.workspaces.filter((w) => checkedWorkspaceIds.has(w.id)) ?? [];
	const [activeBatchAction, setActiveBatchAction] = useState<BatchAction>();
	const canCheckWorkspaces =
		entitlements.features.workspace_batch_actions.enabled;
	const batchActions = useBatchActions({
		onSuccess: async () => {
			await refetch();
			setCheckedWorkspaceIds(new Set());
		},
	});

	// We always want to uncheck the selected workspaces when the url changes,
	// because it has filtering and pagination that can change which workspaces
	// the user can interact with. Can probably make this logic more fine-
	// grained, but we don't want to swap this to a useEffect, because that
	// will introduce extra page-wide renders in one of the heaviest pages in
	// the entire site
	const [cachedParams, setCachedParams] = useState(searchParams);
	if (cachedParams !== searchParams && checkedWorkspaceIds.size > 0) {
		setCachedParams(searchParams);
		setCheckedWorkspaceIds(new Set());
	}

	return (
		<>
			<Helmet>
				<title>{pageTitle("Workspaces")}</title>
			</Helmet>

			<WorkspacesPageView
				canCreateTemplate={permissions.createTemplates}
				canChangeVersions={permissions.updateTemplates}
				checkedWorkspaces={checkedWorkspaces}
				onCheckChange={(newWorkspaces) => {
					setCheckedWorkspaceIds((current) => {
						const newIds = newWorkspaces.map((ws) => ws.id);
						const sameContent =
							current.size === newIds.length &&
							newIds.every((id) => current.has(id));
						if (sameContent) {
							return current;
						}
						return new Set(newIds);
					});
				}}
				canCheckWorkspaces={canCheckWorkspaces}
				templates={filteredTemplates}
				templatesFetchStatus={templatesQuery.status}
				workspaces={data?.workspaces}
				error={error}
				count={data?.count}
				page={pagination.page}
				limit={pagination.limit}
				onPageChange={pagination.goToPage}
				filterProps={filterProps}
				isRunningBatchAction={batchActions.isProcessing}
				onDeleteAll={() => setActiveBatchAction("delete")}
				onUpdateAll={() => setActiveBatchAction("update")}
				onStartAll={() => batchActions.start(checkedWorkspaces)}
				onStopAll={() => batchActions.stop(checkedWorkspaces)}
				onActionSuccess={async () => {
					await queryClient.invalidateQueries({
						queryKey: workspacesQueryOptions.queryKey,
					});
				}}
				onActionError={(error) => {
					displayError(
						getErrorMessage(error, "Failed to perform action"),
						getErrorDetail(error),
					);
				}}
			/>

			<BatchDeleteConfirmation
				isLoading={batchActions.isProcessing}
				checkedWorkspaces={checkedWorkspaces}
				open={activeBatchAction === "delete"}
				onConfirm={async () => {
					await batchActions.delete(checkedWorkspaces);
					setActiveBatchAction(undefined);
				}}
				onClose={() => {
					setActiveBatchAction(undefined);
				}}
			/>

			<BatchUpdateModalForm
				open={activeBatchAction === "update"}
				isProcessing={batchActions.isProcessing}
				workspacesToUpdate={checkedWorkspaces}
				onCancel={() => setActiveBatchAction(undefined)}
				onSubmit={async () => {
					window.alert("Hooray!");
					/**
					 * @todo Make sure this gets added back in once more of the
					 * component has been fleshed out
					 */
					if (false) {
						await batchActions.updateTemplateVersions({
							workspaces: checkedWorkspaces,
							isDynamicParametersEnabled: false,
						});
					}
					setActiveBatchAction(undefined);
				}}
			/>
		</>
	);
};

export default WorkspacesPage;

type UseWorkspacesFilterOptions = {
	searchParams: URLSearchParams;
	onSearchParamsChange: (newParams: URLSearchParams) => void;
	onFilterChange: () => void;
};

const useWorkspacesFilter = ({
	searchParams,
	onSearchParamsChange,
	onFilterChange,
}: UseWorkspacesFilterOptions) => {
	const filter = useFilter({
		fallbackFilter: "owner:me",
		searchParams,
		onSearchParamsChange,
		onUpdate: onFilterChange,
	});

	const { permissions } = useAuthenticated();
	const canFilterByUser = permissions.viewDeploymentConfig;
	const userMenu = useUserFilterMenu({
		value: filter.values.owner,
		onChange: (option) =>
			filter.update({ ...filter.values, owner: option?.value }),
		enabled: canFilterByUser,
	});

	const templateMenu = useTemplateFilterMenu({
		value: filter.values.template,
		onChange: (option) =>
			filter.update({ ...filter.values, template: option?.value }),
	});

	const statusMenu = useStatusFilterMenu({
		value: filter.values.status,
		onChange: (option) =>
			filter.update({ ...filter.values, status: option?.value }),
	});

	const { showOrganizations } = useDashboard();
	const organizationsMenu = useOrganizationsFilterMenu({
		value: filter.values.organization,
		onChange: (option) => {
			filter.update({
				...filter.values,
				organization: option?.value,
			});
		},
	});

	return {
		filter,
		menus: {
			user: canFilterByUser ? userMenu : undefined,
			template: templateMenu,
			status: statusMenu,
			organizations: showOrganizations ? organizationsMenu : undefined,
		},
	};
};
