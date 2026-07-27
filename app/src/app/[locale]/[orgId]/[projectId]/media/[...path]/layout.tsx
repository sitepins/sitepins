import Container from "@/components/container";
import MediaDragWrapper from "./_components/media-drag-wrapper";
import MediaHeader from "./_components/media-header";

export default function MediaLayout({
  children,
}: LayoutProps<"/[locale]/[orgId]/[projectId]/media/[...path]">) {
  return (
    <MediaDragWrapper>
      <Container fullWidth className="space-y-0">
        <MediaHeader />
        {children}
      </Container>
    </MediaDragWrapper>
  );
}
