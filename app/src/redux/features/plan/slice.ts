import { TPackageId } from "@/lib/plan/types";
import { createSlice } from "@reduxjs/toolkit";

// Self-hosted plan state: every feature unlocked, no billing. `null` means
// "no plan applies" rather than naming a tier — core doesn't know any.
// A hosted deployment overrides this module (slice.cloud.ts) with a
// billing-backed implementation exposing the same exports.

type PlanState = {
  currentPackage: TPackageId | null;
  frequency?: string;
  isPending: boolean;
};

export const packageSlice = createSlice({
  name: "package",
  initialState: {
    currentPackage: null,
    frequency: undefined,
    isPending: false,
  } as PlanState,
  reducers: {
    setPackage: (
      state: PlanState,
      action: {
        payload: {
          currentPackage: TPackageId | null;
          frequency?: string;
        };
      },
    ) => {
      state.currentPackage = action.payload.currentPackage;
      state.frequency = action.payload.frequency;
      state.isPending = false;
    },
  },
});

export const selectCurrentPackage = (state: { package: PlanState }) =>
  state.package;

export const { setPackage } = packageSlice.actions;

// Called once after login to load plan data. No-op when self-hosted.
export function usePlanBootstrap(_args: {
  userId?: string;
  enabled: boolean;
}) {}
