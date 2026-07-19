import { EBillingPeriod, EPackage } from "@/lib/plan/types";
import { createSlice } from "@reduxjs/toolkit";

// Self-hosted plan state: every feature unlocked, no billing.
// A hosted deployment can override this module (slice.cloud.ts) with a
// billing-backed implementation exposing the same exports.

interface PlanState {
  currentPackage: EPackage;
  frequency?: EBillingPeriod;
  isPending: boolean;
}

export const packageSlice = createSlice({
  name: "package",
  initialState: {
    currentPackage: EPackage.ENTERPRISE,
    frequency: EBillingPeriod.LIFETIME,
    isPending: false,
  },
  reducers: {
    setPackage: (
      state: PlanState,
      action: {
        payload: {
          currentPackage: EPackage;
          frequency?: EBillingPeriod;
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
export function usePlanBootstrap(_args: { userId?: string; enabled: boolean }) {}
