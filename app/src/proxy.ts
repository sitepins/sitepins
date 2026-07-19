import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "./lib/auth/auth-server";
import { routing } from "./lib/i18n/routing";
import { PUBLIC_ROUTES } from "./lib/public-routes";
import {
  hasCompletedOnboarding,
  onboardingEnabled,
} from "./lib/onboarding-gate";
import { getUserLanguage } from "./redux/features/user-preference/preference-server";

// Routes that are accessible without authentication (path without locale prefix)
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

// match exact or prefix + slash. avoids matching `/login-foo`
function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// Ensure redirect URL is same-origin to prevent open redirect vulnerabilities
function isSafeRedirect(from: string | null, origin: string) {
  if (!from) return false;
  try {
    const url = new URL(from, origin);
    return url.origin === origin;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const origin = nextUrl.origin;

  // Lazily fetch auth only once — shared across locale detection and auth logic
  let auth: Awaited<ReturnType<typeof getAuth>> | undefined;
  const getAuthOnce = async () => {
    if (auth === undefined) auth = await getAuth(request);
    return auth;
  };

  const intlMiddleware = createMiddleware(routing);
  const intlResponse = intlMiddleware(request);

  // If next-intl issued a redirect, return it
  const redirectLocation = intlResponse.headers.get("Location");
  if (redirectLocation) {
    return intlResponse;
  }

  // 3. Apply auth / onboarding logic
  if (isPublicRoute(pathname)) {
    // Redirect already-authed users away from auth pages
    if ((await getAuthOnce()) && isAuthRoute(pathname)) {
      const hasPersonaCookie = request.cookies.get(
        "onboarding_completed",
      )?.value;
      const from = nextUrl.searchParams.get("from") || "/";
      const safe = isSafeRedirect(from, origin) ? from : "/";
      if (hasPersonaCookie || !onboardingEnabled) {
        return NextResponse.redirect(new URL(safe, origin), 302);
      }
      const onboardingUrl = new URL(
        `/onboarding?from=${encodeURIComponent(safe)}`,
        origin,
      );
      return NextResponse.redirect(onboardingUrl, 302);
    }
    return intlResponse;
  }

  // For protected routes, require auth
  const authData = await getAuthOnce();
  if (!authData) {
    const from = `${nextUrl.pathname}${nextUrl.search || ""}`;
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("from", from);
    return NextResponse.redirect(loginUrl, 302);
  }

  // Sync locale from DB on session start or page refresh.
  // locale_synced is a session cookie (no maxAge) — cleared when browser closes.
  // Cache-Control header signals F5/Ctrl+R so we re-sync those too.
  const hasLocaleCookie = request.cookies.has("NEXT_LOCALE");
  const hasSyncCookie = request.cookies.has("locale_synced");
  const cacheControl = request.headers.get("cache-control") ?? "";
  const isRefresh =
    cacheControl.includes("no-cache") || cacheControl.includes("max-age=0");

  if (!hasLocaleCookie || !hasSyncCookie || isRefresh) {
    const dbLanguage = await getUserLanguage(
      authData.user.user_id,
      request.headers.get("cookie") || "",
    );
    const localeToSet = dbLanguage ?? "en";
    const currentLocale = request.cookies.get("NEXT_LOCALE")?.value;

    const syncResponse = NextResponse.redirect(request.url, 302);
    syncResponse.cookies.set("NEXT_LOCALE", localeToSet, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    // session cookie — no maxAge, cleared when browser closes
    syncResponse.cookies.set("locale_synced", "1", { path: "/" });

    // Only redirect if locale actually changed or cookie was missing.
    // Avoids redirect loop on refresh when locale already matches DB.
    if (!hasLocaleCookie || currentLocale !== localeToSet) {
      return syncResponse;
    }

    // Locale matches — attach sync cookie to final intlResponse instead
    intlResponse.cookies.set("locale_synced", "1", { path: "/" });
  }

  // Check for User Persona
  const hasPersonaCookie = request.cookies.get("onboarding_completed")?.value;

  if (pathname === "/onboarding") {
    const from = nextUrl.searchParams.get("from") || "/";
    if (hasPersonaCookie) {
      return NextResponse.redirect(new URL(from, origin), 302);
    }

    const hasPersonaInDB = await hasCompletedOnboarding(
      authData.user.user_id,
      request.headers.get("cookie") || "",
    );

    if (hasPersonaInDB) {
      const res = NextResponse.redirect(new URL(from, origin), 302);
      res.cookies.set("onboarding_completed", "true", {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
      return res;
    }
  } else {
    if (!hasPersonaCookie) {
      if (
        await hasCompletedOnboarding(
          authData.user.user_id,
          request.headers.get("cookie") || "",
        )
      ) {
        const res = intlResponse;
        res.cookies.set("onboarding_completed", "true", {
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
        });
        return res;
      } else {
        const onboardingUrl = new URL("/onboarding", origin);
        const from = `${nextUrl.pathname}${nextUrl.search || ""}`;
        onboardingUrl.searchParams.set("redirect", from);
        return NextResponse.redirect(onboardingUrl, 302);
      }
    }
  }

  return intlResponse;
}

// exclude Next internals, API routes, and browser probe endpoints
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|images|favicon.ico|\\.well-known).*)",
  ],
};
