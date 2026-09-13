"use client";

import { AiMarkdown } from "@/components/ai-markdown";
import { AiUpgrade } from "@/components/ai-upgrade";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { getAICredential } from "@/editor/plugins/copilot-kit";
import { useAiAccess } from "@/hooks/use-ai-access";
import { useOs } from "@/hooks/use-os";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { getCloudSearchGroups } from "@/lib/menu-cloud";
import { cn } from "@/lib/utils/cn";
import { sanitizedPath } from "@/lib/utils/common";
import isConfigFile from "@/lib/utils/is-config-file";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { TConfig, TFiles } from "@/types";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  Copy,
  FileCode2,
  FileIcon,
  ImageIcon,
  Loader2,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Square,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useParams, useRouter } from "next/navigation";
import path from "path";
import * as React from "react";

type OrgSearchBarProps = {
  files?: TFiles[];
  config?: TConfig;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
};

type SearchItem = {
  id: string;
  label: string;
  href: string;
  target?: "_blank";
  orgId?: string;
  file?: TFiles;
  keywords: string[];
};

type SearchItemGroup = {
  groupLabel: string;
  items: SearchItem[];
};

type SearchTranslationItem = Omit<SearchItem, "id">;

// Pre-normalized haystack so keystrokes only run substring checks.
type FileSearchItem = SearchItem & { haystack: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const flattenFiles = (nodes: TFiles[]): TFiles[] =>
  nodes.reduce((acc: TFiles[], file) => {
    if ((file.type === "blob" || file.isFile) && !file.isMedia) {
      acc.push(file);
    }
    if (file.children && file.children.length > 0) {
      acc.push(...flattenFiles(file.children));
    }
    return acc;
  }, []);

const flattenConfigFiles = (nodes: TFiles[], configs?: string[]): TFiles[] =>
  nodes.reduce((acc: TFiles[], file) => {
    const isIncluded = configs?.some((item: string) => {
      const ext = item.includes(".") ? item.slice(item.lastIndexOf(".")) : "";
      if (ext) {
        return file.path.includes(item);
      }
      return file.path.includes(sanitizedPath(item) + "/");
    });

    if (isIncluded && (!file.children || file.children.length === 0)) {
      acc.push(file);
    }

    if (file.children && file.children.length > 0) {
      acc.push(...flattenConfigFiles(file.children, configs));
    }
    return acc;
  }, []);

const normalizeSearchString = (value: string) =>
  value
    .replace(/[\s_\-./\\]+/g, " ")
    .trim()
    .toLowerCase();

const MAX_FILE_RESULTS = 50;
const DEFAULT_FILE_RESULTS = 5;

export const resolveFileUrl = (
  filePath: string,
  orgId: string,
  projectId: string,
  config?: TConfig,
): string => {
  const normalizedPath = filePath.replace(/^content\//, "");
  if (
    config?.media &&
    (normalizedPath.startsWith(config.media + "/") ||
      normalizedPath === config.media)
  ) {
    const mediaRelativePath = normalizedPath.replace(config.media + "/", "");
    const folderPath = path.dirname(mediaRelativePath);
    return `/${orgId}/${projectId}/media/${folderPath === "." ? "" : folderPath}`;
  }
  if (isConfigFile(normalizedPath)) {
    return `/${orgId}/${projectId}/config/${normalizedPath}`;
  }
  const isInContentOrMedia =
    (config?.content &&
      (normalizedPath.startsWith(config.content + "/") ||
        normalizedPath === config.content)) ||
    (config?.media &&
      (normalizedPath.startsWith(config.media + "/") ||
        normalizedPath === config.media));
  if (!isInContentOrMedia) {
    return `/${orgId}/${projectId}/code/${normalizedPath}`;
  }
  return `/${orgId}/${projectId}/content/${normalizedPath}`;
};

export function GlobalSearch({
  files,
  config,
  open: controlledOpen,
  setOpen: controlledSetOpen,
}: OrgSearchBarProps = {}) {
  const tCommon = useTranslations("common");
  const tSearch = useTranslations("search");
  const locale = useLocale();
  const { isDesktop, isMac } = useOs();
  const { resolvedTheme, setTheme } = useTheme();
  const { checkAiAccess, isSearchAiEnabled: searchAiEnabled } = useAiAccess();

  // --- Open/close state ---
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledSetOpen! : setInternalOpen;

  // --- Search query ---
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);

  // --- Inline AI panel state ---
  const [aiOpen, setAiOpen] = React.useState(false);
  const [aiInput, setAiInput] = React.useState("");
  const [aiMessages, setAiMessages] = React.useState<ChatMessage[]>([]);
  const [isAiStreaming, setIsAiStreaming] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const aiAbortRef = React.useRef<AbortController | null>(null);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  // Ref so handleAiSend can always read the latest projectContext without
  // being declared after fileList (which projectContext depends on).
  const projectContextRef = React.useRef<unknown>(undefined);

  // Refs for AI conversation with synchronous updates so handleAiSend always has the latest state
  const aiMessagesRef = React.useRef<ChatMessage[]>([]);
  const setAiMessagesSafe = React.useCallback(
    (action: React.SetStateAction<ChatMessage[]>) => {
      setAiMessages((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        aiMessagesRef.current = next;
        return next;
      });
    },
    [],
  );

  const isStreamingRef = React.useRef(false);

  // Auto-close AI panel if search AI is disabled
  React.useEffect(() => {
    if (!searchAiEnabled && aiOpen) {
      closeAiPanel();
    }
  }, [searchAiEnabled, aiOpen]);

  // ⌘+K toggle
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  // Focus the shared input on open or mode switch
  React.useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open, aiOpen]);

  // Scroll AI chat to top when new messages arrive (since newest response is at the top)
  React.useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = 0;
    }
  }, [aiMessages.length]);

  const router = useRouter();
  const params = useParams<{ orgId: string; projectId?: string }>();
  const orgId = params?.orgId;
  const projectId = params?.projectId;
  const { data: orgs } = useGetOrgsQuery();
  const { canAccessProFeatures } = useOwnerPlan();
  const configs = config?.configs;
  const searchItems = tSearch.raw("items") as Record<
    string,
    SearchTranslationItem
  >;

  // --- AI send ---
  const handleAiSend = React.useCallback(
    async (customPrompt?: string) => {
      if (isStreamingRef.current) return;

      const domValue = searchInputRef.current?.value;
      const promptText = (customPrompt ?? domValue ?? aiInput).trim();
      if (!promptText) return;
      if (!checkAiAccess()) return;

      const cred = getAICredential();
      if (!cred) return;

      isStreamingRef.current = true;
      setIsAiStreaming(true);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: promptText,
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };

      // Filter out empty messages from history to keep conversation clean
      const prevMessages = aiMessagesRef.current.filter(
        (m) => m.content && m.content.trim().length > 0,
      );
      const newMessages = [...prevMessages, userMsg];
      setAiMessagesSafe([...newMessages, assistantMsg]);
      if (searchInputRef.current) {
        searchInputRef.current.value = "";
      }
      setAiInput("");

      const controller = new AbortController();
      aiAbortRef.current = controller;

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            apiKey: cred.apiKey,
            provider: cred.provider,
            model: cred.model,
            projectContext: projectContextRef.current,
          }),
        });

        if (!response.ok) {
          let errMsg = `AI request failed (${response.status})`;
          try {
            const errJson = await response.json();
            if (errJson?.error) errMsg = errJson.error;
          } catch {
            // fallback
          }
          throw new Error(errMsg);
        }

        if (!response.body) {
          throw new Error("AI response failed (no body received)");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let receivedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          receivedText += chunk;
          setAiMessagesSafe((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m,
            ),
          );
        }
        const finalChunk = decoder.decode();
        if (finalChunk) {
          receivedText += finalChunk;
          setAiMessagesSafe((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + finalChunk }
                : m,
            ),
          );
        }

        if (!receivedText.trim()) {
          throw new Error(
            "No response received from AI. Please check your AI model settings and try again.",
          );
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // Keep partial content if aborted, or remove empty placeholder
          setAiMessagesSafe((prev) =>
            prev.filter(
              (m) =>
                m.id !== assistantId ||
                (m.content && m.content.trim().length > 0),
            ),
          );
        } else {
          setAiMessagesSafe((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      (err as Error).message ||
                      "Sorry, something went wrong. Please check your AI settings and try again.",
                  }
                : m,
            ),
          );
        }
      } finally {
        isStreamingRef.current = false;
        setIsAiStreaming(false);
        aiAbortRef.current = null;
      }
    },
    [aiInput, checkAiAccess, setAiMessagesSafe],
  );

  // Open the inline AI panel, optionally pre-filling & auto-sending
  const openAiPanel = React.useCallback(
    (prefill?: string, autoSend = false) => {
      if (!searchAiEnabled) return;
      if (!checkAiAccess()) return;
      setAiOpen(true);
      if (prefill) {
        setAiInput(prefill);
        if (autoSend) {
          setTimeout(() => handleAiSend(prefill), 50);
        }
      }
      setTimeout(() => searchInputRef.current?.focus(), 50);
    },
    [checkAiAccess, handleAiSend, searchAiEnabled],
  );

  const closeAiPanel = () => {
    aiAbortRef.current?.abort();
    setAiOpen(false);
    // Preserves conversation history until the search modal itself is closed
    setAiInput("");
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const replaceTemplate = (
    template: string,
    replacements?: Record<string, string>,
  ) =>
    replacements
      ? Object.entries(replacements).reduce(
          (current, [key, value]) =>
            current.replace(new RegExp(`\\{${key}\\}`, "g"), value),
          template,
        )
      : template;

  const getFileIcon = (file: TFiles) => {
    const filePath = file.path.replace(/^content\//, "");
    if (isConfigFile(filePath)) {
      return <Settings className="me-2 h-4 w-4 shrink-0" />;
    }
    if (config?.media && filePath.startsWith(config.media)) {
      return <ImageIcon className="me-2 h-4 w-4 shrink-0" />;
    }
    const isInContentOrMedia =
      (config?.content && filePath.startsWith(config.content)) ||
      (config?.media && filePath.startsWith(config.media));
    if (!isInContentOrMedia && !isConfigFile(filePath)) {
      return <FileCode2 className="me-2 h-4 w-4 shrink-0" />;
    }
    return <FileIcon className="me-2 h-4 w-4 shrink-0" />;
  };

  const fileList = React.useMemo(() => {
    if (!files || !files.length || !projectId) return [];
    const rootChildren =
      (files as TFiles[]).find((t) => t.name === "root")?.children ?? [];
    const themeChildren =
      (files as TFiles[]).find((t) => t.name === "theme")?.children ?? [];
    const codeChildren =
      (files as TFiles[]).find((t) => t.name === "code")?.children ?? [];
    const contentFiles = flattenFiles(rootChildren);
    const configFiles = flattenConfigFiles(themeChildren, configs);
    if (!canAccessProFeatures) return [...contentFiles, ...configFiles];
    const codeFiles = flattenFiles(codeChildren);
    return [...contentFiles, ...configFiles, ...codeFiles];
  }, [files, canAccessProFeatures, configs, projectId]);

  // --- Build rich project context for the AI ---
  // Placed after fileList so we can include the full file tree in the context.
  // This is sent as `projectContext` to /api/ai/chat.
  const projectContext = React.useMemo(() => {
    if (!projectId || !config) return undefined;

    const collections = config.arrangement
      ?.filter((a) => a.type === "folder")
      .map((a) => ({
        name: a.groupName,
        path: a.targetPath,
        createUrl: `/${orgId}/${projectId}/content/${a.targetPath}`,
      }));

    // Build a file tree grouped by collection — capped at 80 entries total to preserve context budget
    const MAX_FILES = 80;
    const filesByCollection: Record<
      string,
      Array<{ path: string; url: string }>
    > = {};
    let count = 0;

    for (const file of fileList) {
      if (count >= MAX_FILES) break;
      const normalizedPath = file.path.replace(/^content\//, "");
      const collection = collections?.find(
        (c) =>
          normalizedPath.startsWith(c.path + "/") || normalizedPath === c.path,
      );
      const url = resolveFileUrl(file.path, orgId, projectId, config);
      const isCode = url.includes(`/${projectId}/code/`);
      const isConfigFileItem = url.includes(`/${projectId}/config/`);
      const bucket =
        collection?.name ??
        (isCode
          ? "Code & Templates"
          : isConfigFileItem
            ? "Configuration"
            : "_root");
      if (!filesByCollection[bucket]) filesByCollection[bucket] = [];
      filesByCollection[bucket].push({
        path: normalizedPath,
        url,
      });
      count++;
    }

    return {
      projectId,
      orgId,
      repoName: config.repoName || projectId,
      framework: config.framework || "Static Site",
      contentDir: config.content || null,
      mediaDir: config.media || null,
      branch: config.branch || "main",
      collections: collections || [],
      configFiles: config.configs || [],
      filesByCollection,
    };
  }, [projectId, orgId, config, fileList]);

  // Keep ref in sync so handleAiSend (declared before fileList) can always
  // read the latest projectContext without a stale closure.
  React.useEffect(() => {
    projectContextRef.current = projectContext;
  }, [projectContext]);

  const contentRoot = config?.content;

  const fileSearchItems = React.useMemo<FileSearchItem[]>(
    () =>
      fileList.map((file) => {
        let displayPath = file.path.replace(/^content\//, "");
        if (contentRoot && displayPath.startsWith(contentRoot)) {
          displayPath = displayPath.replace(contentRoot, "");
          if (displayPath.startsWith("/"))
            displayPath = displayPath.substring(1);
        }
        return {
          id: `file-${file.path}`,
          label: displayPath,
          href:
            orgId && projectId
              ? resolveFileUrl(file.path, orgId, projectId, config)
              : "#",
          file,
          keywords: [file.name, file.path],
          haystack: [
            normalizeSearchString(displayPath),
            normalizeSearchString(file.name),
            normalizeSearchString(file.path),
          ].join(" "),
        };
      }),
    [fileList, contentRoot, orgId, projectId, config],
  );

  const handleFileSelect = (file: TFiles) => {
    setOpen(false);
    setQuery("");
    const currentOrgId = (params?.orgId as string) || orgId;
    if (!currentOrgId || !projectId) return;
    router.push(resolveFileUrl(file.path, currentOrgId, projectId, config));
  };

  const results = React.useMemo(() => {
    const q = normalizeSearchString(deferredQuery);

    const createSearchItem = (
      key: string,
      replacements?: Record<string, string>,
    ): SearchItem => {
      const item = searchItems?.[key];
      return {
        id: key,
        href: item ? replaceTemplate(item.href, replacements) : "/",
        label: item?.label ?? key,
        target: item?.target,
        keywords: item?.keywords ?? [],
      };
    };

    const getOrgSearchSettings = (orgIdVal: string): SearchItem[] => [
      createSearchItem("org-general", { orgId: orgIdVal }),
      createSearchItem("org-members", { orgId: orgIdVal }),
      createSearchItem("org-sandbox", { orgId: orgIdVal }),
    ];

    const orgKeywords = (tSearch.raw("org_keywords") as string[]) ?? [
      "org",
      "organization",
      "switch",
      "workspace",
    ];

    const filterItems = (items: SearchItem[]): SearchItem[] =>
      q === ""
        ? items
        : items.filter((item) => {
            const normalizedLabel = normalizeSearchString(item.label);
            const normalizedKeywords = item.keywords.map(normalizeSearchString);
            return (
              normalizedLabel.includes(q) ||
              normalizedKeywords.some((kw) => kw.includes(q))
            );
          });

    const orgItems: SearchItem[] = (orgs || []).map((org) => ({
      id: `switch-org-${org.org_id}`,
      label: `${org.org_name}`,
      href: `/org-${org.org_id}`,
      orgId: org.org_id,
      keywords: [...orgKeywords, org.org_name],
    }));

    const groups: SearchItemGroup[] = [
      {
        groupLabel: tSearch("groupLabels.organizations"),
        items: filterItems(orgItems),
      },
      {
        groupLabel: tSearch("groupLabels.preferences"),
        items: filterItems([
          createSearchItem("language"),
          createSearchItem("theme"),
          createSearchItem("coauthor"),
        ]),
      },
      ...getCloudSearchGroups(locale).map((group) => ({
        groupLabel: group.groupLabel,
        items: filterItems(group.items),
      })),
      {
        groupLabel: tSearch("groupLabels.organization_settings"),
        items: filterItems(orgId ? getOrgSearchSettings(orgId) : []),
      },
      {
        groupLabel: tSearch("groupLabels.ai_agent"),
        items: filterItems([createSearchItem("ai-agent")]),
      },
      {
        groupLabel: tSearch("groupLabels.support_updates"),
        items: filterItems([
          createSearchItem("discord-support"),
          createSearchItem("updates-feedback"),
        ]),
      },
      {
        groupLabel: tSearch("groupLabels.account"),
        items: filterItems([
          createSearchItem("display-picture"),
          createSearchItem("display-name"),
          createSearchItem("change-password"),
          createSearchItem("set-password"),
          createSearchItem("newsletter"),
        ]),
      },
    ];

    if (projectId && fileSearchItems.length) {
      const filteredFileItems: SearchItem[] = [];
      const limit = q === "" ? DEFAULT_FILE_RESULTS : MAX_FILE_RESULTS;
      for (const item of fileSearchItems) {
        if (q !== "" && !item.haystack.includes(q)) continue;
        filteredFileItems.push(item);
        if (filteredFileItems.length >= limit) break;
      }
      if (filteredFileItems.length > 0) {
        groups.unshift({
          groupLabel: tSearch("groupLabels.files") || "Files",
          items: filteredFileItems,
        });
      }
    }

    return groups.filter((group) => group.items.length > 0);
  }, [
    orgId,
    orgs,
    deferredQuery,
    searchItems,
    tSearch,
    projectId,
    fileSearchItems,
    locale,
  ]);

  const hasQuery = deferredQuery.trim().length >= 1;
  const aiLabel = hasQuery
    ? tSearch("ask_about_query", { query: deferredQuery.trim() })
    : tSearch("ask_ai_copilot");

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-background hover:bg-muted/40 border-border flex h-auto w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-4 py-2.25 transition-colors"
      >
        <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
          <Search className="size-4 shrink-0" />
          <span className="truncate">{tSearch("placeholder")}</span>
        </span>
        {isDesktop && (
          <KbdGroup className="shrink-0">
            <Kbd>{isMac ? "⌘+K" : "Ctrl+K"}</Kbd>
          </KbdGroup>
        )}
      </button>

      <CommandDialog
        className="max-w-2xl overflow-hidden md:p-0"
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            aiAbortRef.current?.abort();
            setQuery("");
            setAiOpen(false);
            setAiMessagesSafe([]);
            setAiInput("");
            if (searchInputRef.current) {
              searchInputRef.current.value = "";
            }
          }
        }}
      >
        {/* ─── UNIFIED INPUT (search or AI depending on mode) ── */}
        <Command shouldFilter={false} className="space-y-0 rounded-none p-0">
          <CommandInput
            ref={searchInputRef}
            icon={
              aiOpen ? (
                isAiStreaming ? (
                  <Loader2 className="text-primary size-4 shrink-0 animate-spin opacity-80" />
                ) : (
                  <Sparkles className="text-primary size-4 shrink-0 opacity-80" />
                )
              ) : undefined
            }
            endAddon={
              aiOpen ? (
                <div className="flex items-center gap-1">
                  {isAiStreaming ? (
                    <button
                      type="button"
                      onClick={() => {
                        aiAbortRef.current?.abort();
                      }}
                      aria-label="Stop generating"
                      className="text-muted-foreground hover:text-foreground hover:bg-muted/80 flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
                    >
                      <Square className="size-3 fill-current" />
                    </button>
                  ) : aiInput.trim() ||
                    searchInputRef.current?.value?.trim() ? (
                    <button
                      type="button"
                      onClick={() => handleAiSend()}
                      aria-label={tSearch("ai_send")}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 flex size-6 cursor-pointer items-center justify-center rounded-md shadow-xs transition-colors"
                    >
                      <ArrowUp className="size-3.5 stroke-[2.5]" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeAiPanel}
                    aria-label={tSearch("controls.close")}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/80 flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                </div>
              ) : undefined
            }
            placeholder={
              aiOpen ? tSearch("ai_placeholder") : tSearch("placeholder")
            }
            value={aiOpen ? aiInput : query}
            onValueChange={(v) => {
              if (aiOpen) setAiInput(v);
              else setQuery(v);
            }}
            onKeyDown={(e) => {
              if (aiOpen) {
                // AI mode — Enter sends, Esc goes back to search
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAiSend();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeAiPanel();
                }
              } else {
                // Search mode — Enter with a query and no results → open AI (only if search AI is enabled)
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  hasQuery &&
                  results.length === 0 &&
                  searchAiEnabled
                ) {
                  e.preventDefault();
                  openAiPanel(query.trim(), true);
                }
              }
            }}
          />

          {/* ─── RESULTS LIST (hidden when AI panel is open) ── */}
          {!aiOpen && (
            <CommandList className="p-1">
              <CommandEmpty>
                <div className="text-muted-foreground flex flex-col items-center gap-3 py-6 text-xs">
                  <span>{tCommon("status.no_results")}</span>
                  {hasQuery && (
                    <>
                      {/* AI fallback */}
                      {searchAiEnabled && (
                        <button
                          type="button"
                          onClick={() => openAiPanel(query.trim(), true)}
                          className="border-border hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors"
                        >
                          <Sparkles className="text-primary size-3.5 shrink-0" />
                          <span>{aiLabel}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </CommandEmpty>

              {/* ✨ Ask AI Copilot — pinned at the TOP */}
              {searchAiEnabled && (
                <CommandGroup>
                  <CommandItem
                    onSelect={() =>
                      openAiPanel(
                        query.trim() || undefined,
                        Boolean(query.trim()),
                      )
                    }
                  >
                    <Sparkles className="me-2 size-4" />
                    <span>{aiLabel}</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {results.length > 0 && <CommandSeparator />}

              {results.map((result, idx) => (
                <React.Fragment key={result.groupLabel || idx}>
                  {idx > 0 && <CommandSeparator />}
                  <CommandGroup heading={result.groupLabel}>
                    {result.items.map((item) => (
                      <CommandItem
                        key={item.id}
                        onSelect={() => {
                          if (item.file) {
                            handleFileSelect(item.file);
                            return;
                          }
                          if (item.id === "quick-toggle-theme") {
                            const nextTheme =
                              resolvedTheme === "dark" ? "light" : "dark";
                            setTheme(nextTheme);
                            setOpen(false);
                            setQuery("");
                            return;
                          }
                          setOpen(false);
                          setQuery("");
                          if (item.target === "_blank") {
                            window.open(item.href, "_blank");
                            return;
                          }
                          if (item.orgId) {
                            localStorage.setItem(
                              "last_working_org_id",
                              item.orgId,
                            );
                          }
                          const [pathUrl, hash] = item.href.split("#");
                          if (hash)
                            sessionStorage.setItem("scroll-to-section", hash);
                          router.push(pathUrl.replace(/\/$/, "") || "/");
                        }}
                      >
                        {item.file ? getFileIcon(item.file) : null}
                        <span>{item.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </React.Fragment>
              ))}
            </CommandList>
          )}

          {/* ─── INLINE AI PANEL ──────────────────────────────── */}
          {aiOpen && (
            <div className="flex flex-col">
              {/* AI conversation */}
              <div
                ref={chatScrollRef}
                className="flex max-h-96 min-h-32 flex-col gap-4 overflow-y-auto p-4"
              >
                {aiMessages.length === 0 ? (
                  /* Empty state — suggestions */
                  <div className="flex flex-col items-center gap-3 py-2 text-center">
                    <div className="bg-primary/10 flex size-9 items-center justify-center rounded-full">
                      <Bot className="text-primary size-4" />
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {tSearch("copilot_title")}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {tSearch("copilot_subtitle")}
                      </p>
                    </div>
                    {/* Contextual suggestions only available inside a project */}
                    {projectId && (
                      <div className="grid w-full grid-cols-2 gap-1.5 text-left">
                        {[
                          tSearch("suggestion_1"),
                          tSearch("suggestion_2"),
                          tSearch("suggestion_3"),
                          tSearch("suggestion_4"),
                        ].map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => openAiPanel(s, true)}
                            className="border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer rounded-md border p-2 text-left text-xs transition-colors"
                          >
                            &quot;{s}&quot;
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  [...aiMessages].reverse().map((msg) =>
                    msg.role === "user" ? (
                      /* User bubble */
                      <div key={msg.id} className="flex justify-end">
                        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed select-text">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      /* Assistant bubble */
                      <div
                        key={msg.id}
                        className="flex flex-col items-start gap-1"
                      >
                        <div className="text-muted-foreground flex items-center gap-1 font-mono text-[10px] uppercase">
                          <Sparkles className="size-2.5" />
                          Copilot
                        </div>
                        <div className="border-border bg-muted/40 w-full rounded-xl rounded-tl-sm border p-3 text-xs leading-relaxed">
                          {msg.content ? (
                            <AiMarkdown content={msg.content} />
                          ) : (
                            <div className="text-muted-foreground flex items-center gap-2">
                              <Loader2 className="size-3 animate-spin" />
                              <span>Thinking…</span>
                            </div>
                          )}

                          {msg.content && !isAiStreaming && (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(msg.id, msg.content)
                              }
                              className={cn(
                                "text-muted-foreground hover:text-foreground mt-2 flex cursor-pointer items-center gap-1 text-[10px] transition-colors",
                              )}
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="text-success size-3" />
                                  {tSearch("copied")}
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3" />
                                  {tSearch("copy")}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              {/* AI footer */}
              <div className="border-border bg-muted/20 text-muted-foreground flex items-center justify-between border-t px-3.5 py-2 text-[11px]">
                <div className="flex items-center gap-3">
                  {aiMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        aiAbortRef.current?.abort();
                        setAiMessagesSafe([]);
                        setAiInput("");
                        if (searchInputRef.current) {
                          searchInputRef.current.value = "";
                        }
                        setTimeout(() => searchInputRef.current?.focus(), 50);
                      }}
                      className="hover:text-foreground inline-flex cursor-pointer items-center gap-1"
                    >
                      <RotateCcw className="size-3" />
                      {tSearch("new_query")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAiSend()}
                    disabled={isAiStreaming}
                    className="hover:text-foreground inline-flex cursor-pointer items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <KbdGroup>
                      <Kbd>↵</Kbd>
                    </KbdGroup>
                    {tSearch("ai_send")}
                  </button>
                  <span className="flex items-center gap-1">
                    <KbdGroup>
                      <Kbd>Esc</Kbd>
                    </KbdGroup>
                    {tSearch("controls.close")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ─── FOOTER (search mode only) ──────────────────── */}
          {!aiOpen && (
            <div className="border-border text-muted-foreground flex items-center gap-4 border-t px-3.5 py-2 text-xs">
              <span className="flex items-center gap-1.5">
                <KbdGroup>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                </KbdGroup>
                {tSearch("controls.navigate")}
              </span>
              <span className="flex items-center gap-1.5">
                <KbdGroup>
                  <Kbd>↵</Kbd>
                </KbdGroup>
                {tSearch("controls.select")}
              </span>
              <span className="flex items-center gap-1.5">
                <KbdGroup>
                  <Kbd>Esc</Kbd>
                </KbdGroup>
                {tSearch("controls.close")}
              </span>
            </div>
          )}
        </Command>
      </CommandDialog>

      <AiUpgrade />
    </div>
  );
}
