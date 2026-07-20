import { describe, expect, it } from "vitest";
import { paginationHelpers } from "./paginationHelper";

describe("calculatePagination", () => {
  it("defaults page/limit/sort when options is empty", () => {
    const result = paginationHelpers.calculatePagination({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.skip).toBe(0);
    expect(result.sortBy).toBe("createdAt");
    expect(result.sortOrder).toBe("desc");
  });

  it("computes skip from page and limit", () => {
    const result = paginationHelpers.calculatePagination({ page: 3, limit: 20 });
    expect(result.skip).toBe(40);
  });

  it("falls back to defaults for non-numeric page/limit instead of NaN", () => {
    const result = paginationHelpers.calculatePagination({
      page: "abc" as unknown as number,
      limit: undefined,
    });
    expect(Number.isNaN(result.page)).toBe(false);
    expect(Number.isNaN(result.limit)).toBe(false);
    expect(Number.isNaN(result.skip)).toBe(false);
    expect(result.skip).toBe(0);
  });

  it("falls back to defaults for zero or negative page/limit", () => {
    const result = paginationHelpers.calculatePagination({ page: 0, limit: -5 });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.skip).toBe(0);
  });

  it("honors explicit sortBy/sortOrder", () => {
    const result = paginationHelpers.calculatePagination({
      sortBy: "project_name",
      sortOrder: "asc",
    });
    expect(result.sortBy).toBe("project_name");
    expect(result.sortOrder).toBe("asc");
  });
});
