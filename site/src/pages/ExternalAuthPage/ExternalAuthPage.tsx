import Button from "@mui/material/Button";
import type { ApiErrorResponse } from "api/errors";
import {
	exchangeExternalAuthDevice,
	externalAuthDevice,
	externalAuthProvider,
} from "api/queries/externalAuth";
import { isAxiosError } from "axios";
import {
	isExchangeErrorRetryable,
	newRetryDelay,
} from "components/GitDeviceAuth/GitDeviceAuth";
import { SignInLayout } from "components/SignInLayout/SignInLayout";
import { Welcome } from "components/Welcome/Welcome";
import { useAuthenticated } from "hooks";
import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "react-query";
import { useParams, useSearchParams } from "react-router-dom";
import ExternalAuthPageView from "./ExternalAuthPageView";

const ExternalAuthPage: FC = () => {
	const { provider } = useParams() as { provider: string };
	const [searchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const [retryCount, setRetryCount] = useState(0);
	const [isRetrying, setIsRetrying] = useState(false);

	const externalAuthProviderOpts = externalAuthProvider(provider);
	const externalAuthProviderQuery = useQuery(externalAuthProviderOpts);

	const externalAuthDeviceOpts = externalAuthDevice(provider);
	const externalAuthDeviceQuery = useQuery({
		...externalAuthDeviceOpts,
		enabled: externalAuthProviderQuery.data?.device === true,
	});

	const retryDelay = useMemo(
		() => newRetryDelay(externalAuthDeviceQuery.data?.interval),
		[externalAuthDeviceQuery.data],
	);
	const exchangeExternalAuthDeviceQuery = useQuery({
		...exchangeExternalAuthDevice(
			provider,
			externalAuthDeviceQuery.data?.device_code ?? "",
			queryClient,
		),
		enabled: Boolean(externalAuthDeviceQuery.data),
		retry: (failureCount, error) =>
			isExchangeErrorRetryable(error) && failureCount < 10,
		retryDelay,
		// We don't want to refetch the query outside of the standard retry
		// logic, because the device auth flow is very strict about rate limits.
		refetchOnWindowFocus: false,
	});

	// Check if we're in a redirected state and need to retry
	const redirectedParam = searchParams?.get("redirected");
	const isRedirected = redirectedParam && redirectedParam.toLowerCase() === "true";

	// Auto-retry mechanism for redirected OAuth flows
	useEffect(() => {
		if (isRedirected && !externalAuthProviderQuery.data?.authenticated && retryCount < 3) {
			const timer = setTimeout(() => {
				setIsRetrying(true);
				setRetryCount(prev => prev + 1);
				// Force refetch the auth status
				externalAuthProviderQuery.refetch().finally(() => {
					setIsRetrying(false);
				});
			}, 1000 + (retryCount * 1000)); // Exponential backoff: 1s, 2s, 3s

			return () => clearTimeout(timer);
		}
	}, [isRedirected, externalAuthProviderQuery.data?.authenticated, retryCount, externalAuthProviderQuery]);

	if (externalAuthProviderQuery.isLoading || !externalAuthProviderQuery.data) {
		return null;
	}

	let deviceExchangeError: ApiErrorResponse | undefined;
	if (isAxiosError(exchangeExternalAuthDeviceQuery.failureReason)) {
		deviceExchangeError =
			exchangeExternalAuthDeviceQuery.failureReason.response?.data;
	} else if (isAxiosError(externalAuthDeviceQuery.failureReason)) {
		deviceExchangeError = externalAuthDeviceQuery.failureReason.response?.data;
	}

	if (
		!externalAuthProviderQuery.data.authenticated &&
		!externalAuthProviderQuery.data.device
	) {
		if (isRedirected) {
			// Show loading state while retrying
			if (isRetrying || retryCount < 3) {
				return (
					<SignInLayout>
						<Welcome>Completing authentication...</Welcome>
						<p css={{ textAlign: "center" }}>
							{isRetrying ? "Verifying authentication..." : "Please wait while we complete your authentication."}
						</p>
					</SignInLayout>
				);
			}

			// Show error only after retries are exhausted
			// The auth flow redirected the user here. If we redirect back to the
			// callback, that resets the flow and we'll end up in an infinite loop.
			// So instead, show an error, as the user expects to be authenticated at
			// this point.
			// TODO: Unsure what to do about the device auth flow, should we also
			// show an error there?
			return (
				<SignInLayout>
					<Welcome>Failed to validate oauth access token</Welcome>

					<p css={{ textAlign: "center" }}>
						Attempted to validate the user&apos;s oauth access token from the
						authentication flow. This situation may occur as a result of an
						external authentication provider misconfiguration. Verify the
						external authentication validation URL is accurately configured.
					</p>
					<br />
					<Button
						onClick={() => {
							// Reset retry count and try again
							setRetryCount(0);
							setIsRetrying(false);
							// Redirect to the auth flow again
							window.location.href = `/external-auth/${provider}/callback`;
						}}
					>
						Retry
					</Button>
				</SignInLayout>
			);
		}
		window.location.href = `/external-auth/${provider}/callback`;
		return null;
	}

	return (
		<ExternalAuthPageView
			externalAuth={externalAuthProviderQuery.data}
			onReauthenticate={() => {
				queryClient.setQueryData(externalAuthProviderOpts.queryKey, {
					...externalAuthProviderQuery.data,
					authenticated: false,
				});
				window.location.href = `/external-auth/${provider}/callback`;
			}}
			deviceExchangeError={deviceExchangeError}
			externalAuthDevice={externalAuthDeviceQuery.data}
			isExchangingToken={exchangeExternalAuthDeviceQuery.isLoading}
			onExchangeToken={() => {
				exchangeExternalAuthDeviceQuery.refetch();
			}}
		/>
	);
};

export default ExternalAuthPage;
