// Core does not enumerate plans — plan names belong to whoever sells them.
// A package is an opaque identifier here; the hosted cloud edition overrides
// this module (types.cloud.ts) with its own tiers and billing periods, and
// can add new ones without touching core.

export type PackageId = string;
