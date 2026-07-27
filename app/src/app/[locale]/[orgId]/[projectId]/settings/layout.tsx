import Container from "@/components/container";
import { ReactNode } from "react";

export default function ProjectSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <Container>{children}</Container>;
}
