"use client";

import { authClient } from "@/lib/auth/auth-client";
import countryDetector from "@/lib/utils/country-detector";
import { useUpdateUserCountryMutation } from "@/redux/features/user/user-api";
import { useEffect } from "react";

// Open-source edition: detects the user's country once (for localization
// defaults) and nothing else. The hosted cloud edition overrides this
// module (cookie-consent.cloud.tsx) with referral-attribution cookies,
// visit-history logging, and announcements.
const CookieConsent = () => {
  const country = countryDetector();
  const { data: auth } = authClient.useSession();
  const [updateUserCountry] = useUpdateUserCountryMutation();

  const isAuthenticated = !!auth;

  // set user country for the first time
  useEffect(() => {
    if (isAuthenticated) {
      const updateCountry = async () => {
        await updateUserCountry({
          userId: auth.user.user_id,
          country: country || "Unknown",
        }).unwrap();
      };

      if (!auth.user.country) {
        updateCountry();
      }
    }
  }, [isAuthenticated]);

  return null;
};

export default CookieConsent;
