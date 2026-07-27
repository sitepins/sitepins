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

  const userId = auth?.user?.user_id;
  const hasCountry = !!auth?.user?.country;

  // set user country for the first time
  useEffect(() => {
    if (!userId || hasCountry) return;
    updateUserCountry({ userId, country: country || "Unknown" });
  }, [userId, hasCountry, country, updateUserCountry]);

  return null;
};

export default CookieConsent;
