import Container from "@/components/container";
import { getAuth } from "@/lib/auth/auth-server";
import { redirect } from "next/navigation";
import { ScrollToHash } from "../account/_components/scroll-to-hash";
import CoAuthorPreference from "./_components/coauthor-preference";
import LanguagePreference from "./_components/language-preference";
import ThemePreference from "./_components/theme-preference";

export default async function PreferencePage() {
  const auth = await getAuth();

  if (!auth) {
    redirect(`/login?from=${encodeURIComponent("/dashboard/preference")}`);
  }

  return (
    <Container>
      <ScrollToHash />
      <div className="flex flex-col gap-6">
        <LanguagePreference userId={auth.user.user_id} />
        <ThemePreference userId={auth.user.user_id} />
        <CoAuthorPreference userId={auth.user.user_id} />
      </div>
    </Container>
  );
}
