export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function dashboardFilters(params: Record<string, string | string[] | undefined>) {
  return {
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
    search: firstParam(params.search),
  };
}
