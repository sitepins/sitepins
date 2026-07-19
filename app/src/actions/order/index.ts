"use server";

import { fetchApi } from "../utils";

interface PreOrderData {
  email: string;
  package?: string;
  billing?: string;
  current_time?: string;
}

/**
 * Track abandoned checkout
 */
export const trackAbandonedCheckout = async (data: PreOrderData) => {
  try {
    await fetchApi<{ success: boolean; message: string }>({
      endPoint: "/order/pre-order",
      method: "POST",
      body: {
        email: data.email,
        package: data.package,
        billing: data.billing,
        current_time: data.current_time || new Date().toISOString(),
      } as any,
      cache: "no-cache",
    });

    return {
      success: true,
      message: "Checkout tracked successfully",
    };
  } catch (error) {
    console.error("Error tracking abandoned checkout:", error);
    return {
      success: false,
      message: "Failed to track checkout",
    };
  }
};
