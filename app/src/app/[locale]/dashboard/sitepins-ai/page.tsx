import Container from "@/components/container";
import { getAuth } from "@/lib/auth/auth-server";
import { redirect } from "next/navigation";
import AISettings from "./_components/sitepins-ai";

export default async function SitepinsAI() {
  const auth = await getAuth();

  if (!auth) {
    redirect(`/login?from=${encodeURIComponent("/sitepins-ai")}`);
  }

  return (
    <Container>
      <AISettings />
    </Container>
  );
}
