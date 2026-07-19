"use client";

import { store } from "@/redux/store";
import React from "react";
import { Provider } from "react-redux";

type RtkProvidersProps = {
  children: React.ReactNode;
};

export function RtkProviders({ children }: RtkProvidersProps) {
  return <Provider store={store}>{children}</Provider>;
}
