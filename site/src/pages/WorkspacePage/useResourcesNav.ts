import type { WorkspaceResource } from "api/typesGenerated";
import { useEffectEvent } from "hooks/hookPolyfills";
import { useSearchParamsKey } from "hooks/useSearchParamsKey";
import { useCallback, useEffect } from "react";

export const resourceOptionValue = (resource: WorkspaceResource) => {
	return `${resource.type}_${resource.name}`;
};

// TODO: This currently serves as a temporary workaround for synchronizing the
// resources tab during workspace transitions. The optimal resolution involves
// eliminating the sync and updating the URL within the workspace data update
// event in the WebSocket "onData" event. However, this requires substantial
// refactoring. Consider revisiting this solution in the future for a more
// robust implementation.
export const useResourcesNav = (resources: WorkspaceResource[]) => {
	const resourcesNav = useSearchParamsKey({ key: "resources" });
	
	// Get the default resource (first resource with agents) for display purposes
	// without setting it in the URL
	const defaultResource = resources.find(
		(resource) => resource.agents && resource.agents.length > 0
	);
	const defaultValue = defaultResource ? resourceOptionValue(defaultResource) : "";
	
	// Use URL value if present, otherwise use default for display
	const currentValue = resourcesNav.value || defaultValue;
	
	const isSelected = useCallback(
		(resource: WorkspaceResource) => {
			return resourceOptionValue(resource) === currentValue;
		},
		[currentValue],
	);

	const onResourceChanges = useEffectEvent(
		(resources?: WorkspaceResource[]) => {
			// No automatic URL parameter setting - resources are selected for display
			// based on URL parameter if present, or default resource if not
		},
	);
	useEffect(() => {
		onResourceChanges(resources);
	}, [onResourceChanges, resources]);

	const select = useCallback(
		(resource: WorkspaceResource) => {
			resourcesNav.setValue(resourceOptionValue(resource));
		},
		[resourcesNav],
	);

	return {
		isSelected,
		select,
		value: currentValue,
	};
};
