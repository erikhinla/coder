import { QueryKey } from "react-query";

export const chromatic = {
	modes: {
		dark: { theme: "dark" },
		light: { theme: "light" },
	},
};

export const chromaticWithTablet = {
	modes: {
		"dark desktop": { theme: "dark" },
		"light tablet": { theme: "light", viewport: "ipad" },
	},
};

/**
 * Use this key when you want to attach a `QueryOption` array to your story
 * parameters. The `withQuery` decorator in `preview.jsx` will detect the array
 * and automatically seed your query cache with the data.
 */
export const queryParametersKey = "queries";

export type QueryParameterSeed = Readonly<{
	key: QueryKey;
	data: unknown;
}>
