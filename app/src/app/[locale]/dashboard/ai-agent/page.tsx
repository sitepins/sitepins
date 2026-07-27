import Container from "@/components/container";
import { getAuth } from "@/lib/auth/auth-server";
import { redirect } from "next/navigation";
import AISettings from "./_components/ai-agent";

export default async function AiAgent() {
  const auth = await getAuth();

  if (!auth) {
    redirect(`/login?from=${encodeURIComponent("/dashboard/ai-agent")}`);
  }

  return (
    <Container>
      <AISettings />
    </Container>
  );
}
