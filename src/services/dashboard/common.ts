import { z } from "zod";

export const DASHBOARD_PAGE_SIZE = 25;

export const opaqueIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(DASHBOARD_PAGE_SIZE),
  search: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(80).optional(),
  ),
}).strict();

export type DashboardPagination = z.infer<typeof paginationSchema>;

export function parsePagination(input: unknown): DashboardPagination {
  return paginationSchema.parse(input);
}

export function pageWindow(pagination: DashboardPagination) {
  return {
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  };
}

export function paginatedResult<T>(items: T[], total: number, pagination: DashboardPagination) {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

export const optionalReviewNoteSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(500).optional(),
);

export function conciseSafeMetadata(value: unknown): Record<string, string | number | boolean | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).slice(0, 12).flatMap(([key, item]) => {
    if (typeof item === "string") return [[key, item.slice(0, 300)] as const];
    if (typeof item === "number" || typeof item === "boolean" || item === null) return [[key, item] as const];
    return [];
  });
  return Object.fromEntries(entries);
}
