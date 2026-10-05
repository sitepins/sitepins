import { gitBlobSha } from "@/lib/utils/git-utils";
import { updateConfig } from "@/redux/features/config/slice";
import { AppStore, makeStore } from "@/redux/store";
import {
  createFakeGitHub,
  createFakeGitLab,
  ORIGINAL,
  THEIRS,
} from "@/test/fake-git-hosts";
import { renderToString } from "react-dom/server";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitLogic } from "./use-commit-logic";

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    getSession: async () => null,
    useSession: () => ({ data: null }),
  },
}));

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ toast }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgId: "org-1", projectId: "proj-1" }),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));
vi.mock("@/hooks/use-add-log", () => ({ useAddLog: () => [async () => ({})] }));
vi.mock("@/hooks/use-images", () => ({
  useImages: () => ({ images: [], clearImages: () => {} }),
}));

const PATH = "content/post.md";

let store: AppStore;

/** Mounts the hook the way EditorWrapper does for a file opened at `gitSha`. */
const openEditor = (gitSha: string | undefined) => {
  const captured: ReturnType<typeof useCommitLogic>[] = [];
  const Probe = ({
    onRender,
  }: {
    onRender: (hook: ReturnType<typeof useCommitLogic>) => void;
  }) => {
    const hook = useCommitLogic({
      socket: null,
      state: { data: { title: "Hello, edited in Sitepins" }, page_content: "" },
      setState: vi.fn(),
      setBaseline: vi.fn(),
      filePath: PATH,
      fmType: "yaml",
      schema: [],
      snippets: [],
      startWith: "---",
      pageContent: "Body",
      onReplaceContentRef: vi.fn(),
      gitSha,
    });
    onRender(hook);
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe onRender={(hook) => captured.push(hook)} />
    </Provider>,
  );
  return captured[0];
};

const useProvider = (provider: "Github" | "Gitlab") =>
  store.dispatch(
    updateConfig({
      token: "app-token",
      owner: "acme",
      repoName: "site",
      branch: "main",
      provider,
      content: "content",
    }),
  );

beforeEach(() => {
  store = makeStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCommitLogic on GitHub", () => {
  beforeEach(() => useProvider("Github"));

  it("publishes when nobody else touched the file", async () => {
    const gh = createFakeGitHub({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const editor = openEditor(gh.fileAt("main", PATH)!.sha);

    await editor.prepareCommit(false, false);

    expect(gh.fileAt("main", PATH)!.content).toContain("edited in Sitepins");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(editor.getBaseSha()).toBe(gh.fileAt("main", PATH)!.sha);
  });

  it("refuses to overwrite a line added in GitHub after the file was opened", async () => {
    const gh = createFakeGitHub({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const editor = openEditor(gh.fileAt("main", PATH)!.sha);
    gh.push({ [PATH]: THEIRS });

    await editor.prepareCommit(false, false);

    expect(gh.fileAt("main", PATH)!.content).toBe(THEIRS);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps guarding after an earlier publish in the same session", async () => {
    const gh = createFakeGitHub({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const editor = openEditor(gh.fileAt("main", PATH)!.sha);
    await editor.prepareCommit(false, false);
    const published = gh.fileAt("main", PATH)!.content;

    gh.push({ [PATH]: `${published}\nAppended by a developer.\n` });
    await editor.prepareCommit(false, false);

    expect(gh.fileAt("main", PATH)!.content).toContain(
      "Appended by a developer.",
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("refuses when the collaborative room is based on an older version", async () => {
    const gh = createFakeGitHub({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const original = gh.fileAt("main", PATH)!.sha;
    gh.push({ [PATH]: THEIRS });

    // This tab loaded the new version, but joined a room still on the old one.
    const editor = openEditor(gh.fileAt("main", PATH)!.sha);
    editor.collabBase.onRoomJoined({ baseSha: original, frontmatter: null });
    await editor.prepareCommit(false, false);

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(gh.fileAt("main", PATH)!.content).toBe(THEIRS);
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("useCommitLogic on GitLab", () => {
  beforeEach(() => useProvider("Gitlab"));

  it("publishes when nobody else touched the file", async () => {
    const gl = createFakeGitLab({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gl.fetch);
    const editor = openEditor(gitBlobSha(ORIGINAL));

    await editor.prepareCommit(false, false);

    expect(gl.read(PATH)).toContain("edited in Sitepins");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(editor.getBaseSha()).toBe(gitBlobSha(gl.read(PATH)!));
  });

  it("refuses to overwrite a line added in GitLab after the file was opened", async () => {
    const gl = createFakeGitLab({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gl.fetch);
    const editor = openEditor(gitBlobSha(ORIGINAL));
    gl.commit({ [PATH]: THEIRS });

    await editor.prepareCommit(false, false);

    expect(gl.read(PATH)).toBe(THEIRS);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps guarding after an earlier publish in the same session", async () => {
    const gl = createFakeGitLab({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gl.fetch);
    const editor = openEditor(gitBlobSha(ORIGINAL));
    await editor.prepareCommit(false, false);

    gl.commit({ [PATH]: `${gl.read(PATH)}\nAppended by a developer.\n` });
    await editor.prepareCommit(false, false);

    expect(gl.read(PATH)).toContain("Appended by a developer.");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("refuses when the collaborative room is based on an older version", async () => {
    const gl = createFakeGitLab({ [PATH]: ORIGINAL });
    vi.stubGlobal("fetch", gl.fetch);
    gl.commit({ [PATH]: THEIRS });

    const editor = openEditor(gitBlobSha(THEIRS));
    editor.collabBase.onRoomJoined({
      baseSha: gitBlobSha(ORIGINAL),
      frontmatter: null,
    });
    await editor.prepareCommit(false, false);

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(gl.read(PATH)).toBe(THEIRS);
  });
});
