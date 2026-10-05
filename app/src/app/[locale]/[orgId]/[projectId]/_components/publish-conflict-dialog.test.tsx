import en from "@/i18n/en/editor.json";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PublishConflictDialog from "./publish-conflict-dialog";

// The real dialog renders into a portal, which server rendering skips.
vi.mock("@/components/ui/alert-dialog", () => {
  const Pass = ({
    children,
    open,
  }: {
    children?: React.ReactNode;
    open?: boolean;
  }) => (open === false ? null : <div>{children}</div>);
  return {
    AlertDialog: Pass,
    AlertDialogContent: Pass,
    AlertDialogDescription: Pass,
    AlertDialogFooter: Pass,
    AlertDialogHeader: Pass,
    AlertDialogTitle: Pass,
  };
});

const renderText = (props: {
  remoteContent?: string;
  remoteDeleted?: boolean;
}) =>
  renderToString(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <PublishConflictDialog
        open
        filePath="content/post.md"
        remoteContent={props.remoteContent}
        remoteDeleted={props.remoteDeleted ?? false}
        localContent={"Intro\nEdited in Sitepins\n"}
        pending={false}
        onOverwrite={() => {}}
        onCancel={() => {}}
      />
    </NextIntlClientProvider>,
  )
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

describe("PublishConflictDialog", () => {
  it("shows which repository lines would be lost", () => {
    const text = renderText({
      remoteContent: "Intro\nBody\nAppended in GitHub\n",
    });
    const t = en.editor.publish_conflict;

    expect(text).toContain(t.title);
    expect(text).toContain(t.description);
    expect(text).toContain("-Appended in GitHub");
    expect(text).toContain("+Edited in Sitepins");
    expect(text).toContain(t.cancel);
    expect(text).toContain(t.overwrite);
  });

  it("explains a remote delete without a diff", () => {
    const text = renderText({ remoteDeleted: true });
    const t = en.editor.publish_conflict;

    expect(text).toContain(t.deleted_description);
    expect(text).not.toContain(t.preview_title);
  });
});
