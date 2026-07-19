import Container from "@/components/container";
import { ReactNode } from "react";

export default function OrgSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <Container>{children}</Container>;
}
