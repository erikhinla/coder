import { API } from "api/api";
import type { ExternalAuth } from "api/typesGenerated";
import type { QueryClient, UseMutationOptions } from "react-query";

// Returns all configured external auths for a given user.
export const externalAuths = () => {
	return {
		queryKey: ["external-auth"],
		queryFn: () => API.getUserExternalAuthProviders(),
		// Reduce stale time to ensure fresh data when navigating back
		staleTime: 30000, // 30 seconds
		// Always refetch on mount to ensure we have the latest auth status
		refetchOnMount: true,
	};
};

export const externalAuthProvider = (providerId: string) => {
	return {
		queryKey: ["external-auth", providerId],
		queryFn: () => API.getExternalAuthProvider(providerId),
		// Reduce stale time to ensure fresh data when navigating back
		staleTime: 30000, // 30 seconds
		// Always refetch on mount to ensure we have the latest auth status
		refetchOnMount: true,
	};
};

export const externalAuthDevice = (providerId: string) => {
	return {
		queryFn: () => API.getExternalAuthDevice(providerId),
		queryKey: ["external-auth", providerId, "device"],
	};
};

export const exchangeExternalAuthDevice = (
	providerId: string,
	deviceCode: string,
	queryClient: QueryClient,
) => {
	return {
		queryFn: () =>
			API.exchangeExternalAuthDevice(providerId, {
				device_code: deviceCode,
			}),
		queryKey: ["external-auth", providerId, "device", deviceCode],
		onSuccess: async () => {
			// Force a refresh of the Git auth status.
			await queryClient.invalidateQueries({
				queryKey: ["external-auth", providerId],
			});
			// Also invalidate the main external auth list
			await queryClient.invalidateQueries({
				queryKey: ["external-auth"],
			});
		},
	};
};

export const validateExternalAuth = (
	queryClient: QueryClient,
): UseMutationOptions<ExternalAuth, unknown, string> => {
	return {
		mutationFn: API.getExternalAuthProvider,
		onSuccess: (data, providerId) => {
			queryClient.setQueryData(["external-auth", providerId], data);
			// Also invalidate the main external auth list to ensure consistency
			queryClient.invalidateQueries({
				queryKey: ["external-auth"],
			});
		},
	};
};

export const unlinkExternalAuths = (queryClient: QueryClient) => {
	return {
		mutationFn: API.unlinkExternalAuthProvider,
		onSuccess: async () => {
			// Invalidate all external auth queries to ensure fresh data
			await queryClient.invalidateQueries({
				queryKey: ["external-auth"],
			});
		},
	};
};
