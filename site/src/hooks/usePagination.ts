import { DEFAULT_RECORDS_PER_PAGE } from "components/PaginationWidget/utils";

type UsePaginationOptions = Readonly<{
	searchParams: URLSearchParams;
	onSearchParamsChange: (newParams: URLSearchParams) => void;
}>;

type UsePaginationResult = Readonly<{
	page: number;
	limit: number;
	offset: number;
	goToPage: (page: number) => void;
}>;

export function usePagination(
	options: UsePaginationOptions,
): UsePaginationResult {
	const { searchParams, onSearchParamsChange } = options;
	const page = searchParams.get("page") ? Number(searchParams.get("page")) : 1;
	const limit = DEFAULT_RECORDS_PER_PAGE;

	return {
		page,
		limit,
		offset: page <= 0 ? 0 : (page - 1) * limit,
		goToPage: (newPage) => {
			const abortNavigation =
				page === newPage || !Number.isFinite(page) || !Number.isInteger(page);
			if (abortNavigation) {
				return;
			}

			const copy = new URLSearchParams(searchParams);
			copy.set("page", page.toString());
			onSearchParamsChange(copy);
		},
	};
}
