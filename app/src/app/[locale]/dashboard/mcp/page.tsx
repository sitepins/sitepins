import Container from "@/components/container";
import { getAuth } from "@/lib/auth/auth-server";
import { redirect } from "next/navigation";
import McpConnection from "./_components/mcp-connection";

export default async function McpConnectionPage() {
  const auth = await getAuth();

  if (!auth) {
    redirect(`/login?from=${encodeURIComponent("/dashboard/mcp")}`);
  }

  return (
    <Container>
      <McpConnection />
    </Container>
  );
}
