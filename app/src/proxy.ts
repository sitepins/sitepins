import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "./lib/auth/auth-server";
import { routing } from "./lib/i18n/routing";
import { gateProtectedRequest } from "./lib/proxy-gate";
import { PUBLIC_ROUTES } from "./lib/public-routes";
import { safeInternalPath } from "./lib/safe-redirect";
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

  // 3. Apply auth logic
  if (isPublicRoute(pathname)) {
    // Redirect already-authed users away from auth pages
    if ((await getAuthOnce()) && isAuthRoute(pathname)) {
      const safe = safeInternalPath(nextUrl.searchParams.get("from"));
      const target = isAuthRoute(safe) ? "/" : safe;
      return NextResponse.redirect(new URL(target, origin), 302);
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

    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      path: "/",
      sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
      secure: isProduction,
    };

    if (currentLocale && currentLocale !== localeToSet) {
      const syncResponse = NextResponse.redirect(request.url, 302);
      syncResponse.cookies.set("NEXT_LOCALE", localeToSet, {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 365,
      });
      syncResponse.cookies.set("locale_synced", "1", cookieOptions);
      return syncResponse;
    }

    intlResponse.cookies.set("NEXT_LOCALE", localeToSet, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 365,
    });
    intlResponse.cookies.set("locale_synced", "1", cookieOptions);
  }

  return (
    (await gateProtectedRequest({
      request,
      userId: authData.user.user_id,
      response: intlResponse,
    })) ?? intlResponse
  );
}

// exclude Next internals, API routes, static assets, and PWA endpoints
export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|images|icons|favicon\\.ico|sw\\.js|manifest\\.webmanifest|manifest\\.json|offline\\.html|\\.well-known).*)",
      // WebSocket upgrades can't take a proxy response and break the session fetch
      missing: [{ type: "header", key: "upgrade" }],
    },
  ],
};
