"use client";

import { Button } from "@/components/ui/button";
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
import { useOs } from "@/hooks/use-os";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { sanitizedPath } from "@/lib/utils/common";
import isConfigFile from "@/lib/utils/is-config-file";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { TFiles } from "@/types";
import { FileCode2, FileIcon, ImageIcon, Search, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import path from "path";
import * as React from "react";

interface OrgSearchBarProps {
  files?: TFiles[];
  config?: any;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

type SearchItem = {
  id: string;
  label: string;
  href: string;
  target?: "_blank";
  orgId?: string;
  file?: TFiles;
  keywords: string[];
};

type SearchTranslationItem = Omit<SearchItem, "id">;

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

const flattenConfigFiles = (nodes: TFiles[], configs?: any): TFiles[] =>
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

export function GlobalSearch({
  files,
  config,
  open: controlledOpen,
  setOpen: controlledSetOpen,
}: OrgSearchBarProps = {}) {
  const tCommon = useTranslations("common");
  const tSearch = useTranslations("search");
  const { isDesktop, isMac } = useOs();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledSetOpen! : setInternalOpen;
  const [query, setQuery] = React.useState("");

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

  const router = useRouter();
  const params = useParams<{ orgId: string; projectId?: string }>();
  const orgId = params?.orgId;
  const projectId = params?.projectId;
  const { data: orgs } = useGetOrgsQuery();
  const { canAccessPremiumFeatures } = useOwnerPlan();
  const configs = config?.configs;
  const searchItems = tSearch.raw("items") as Record<
    string,
    SearchTranslationItem
  >;

  const replaceTemplate = (
    template: string,
    replacements?: Record<string, string>,
  ) =>
    replacements
      ? Object.entries(replacements).reduce(
          (current, [key, value]) =>
            current.replace(new RegExp(`\{${key}\}`, "g"), value),
          template,
        )
      : template;

  const getFileIcon = (file: TFiles) => {
    const filePath = file.path.replace(/^content\//, "");

    if (isConfigFile(filePath)) {
      return <Settings className="mr-2 h-4 w-4" />;
    }

    if (config?.media && filePath.startsWith(config.media)) {
      return <ImageIcon className="mr-2 h-4 w-4" />;
    }

    const isInContentOrMedia =
      (config?.content && filePath.startsWith(config.content)) ||
      (config?.media && filePath.startsWith(config.media));

    if (!isInContentOrMedia && !isConfigFile(filePath)) {
      return <FileCode2 className="mr-2 h-4 w-4" />;
    }

    return <FileIcon className="mr-2 h-4 w-4" />;
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

    if (!canAccessPremiumFeatures) {
      return [...contentFiles, ...configFiles];
    }

    const codeFiles = flattenFiles(codeChildren);
    return [...contentFiles, ...configFiles, ...codeFiles];
  }, [files, canAccessPremiumFeatures, configs, projectId]);

  const handleFileSelect = (file: TFiles) => {
    setOpen(false);
    setQuery("");

    const filePath = file.path;
    const normalizedPath = filePath.replace(/^content\//, "");
    const currentOrgId = (params?.orgId as string) || orgId;

    if (
      config?.media &&
      (normalizedPath.startsWith(config.media + "/") ||
        normalizedPath === config.media)
    ) {
      const mediaRelativePath = normalizedPath.replace(config.media + "/", "");
      const folderPath = path.dirname(mediaRelativePath);

      router.push(
        `/${currentOrgId}/${projectId}/media/${folderPath === "." ? "" : folderPath}`,
      );
      return;
    }

    if (isConfigFile(normalizedPath)) {
      router.push(`/${currentOrgId}/${projectId}/configs/${normalizedPath}`);
      return;
    }

    const isInContentOrMedia =
      (config?.content &&
        (normalizedPath.startsWith(config.content + "/") ||
          normalizedPath === config.content)) ||
      (config?.media &&
        (normalizedPath.startsWith(config.media + "/") ||
          normalizedPath === config.media));

    if (!isInContentOrMedia) {
      router.push(`/${currentOrgId}/${projectId}/code/${normalizedPath}`);
      return;
    }

    router.push(`/${currentOrgId}/${projectId}/content/${normalizedPath}`);
  };

  const results = React.useMemo(() => {
    const q = normalizeSearchString(query);

    const getFileSearchItems = (): SearchItem[] =>
      fileList.map((file) => {
        let displayPath = file.path.replace(/^content\//, "");

        if (config?.content && displayPath.startsWith(config.content)) {
          displayPath = displayPath.replace(config.content, "");
          if (displayPath.startsWith("/")) {
            displayPath = displayPath.substring(1);
          }
        }

        return {
          id: `file-${file.path}`,
          label: displayPath,
          href: "#",
          file,
          keywords: [
            file.name,
            file.path,
            normalizeSearchString(file.name),
            normalizeSearchString(file.path),
            normalizeSearchString(displayPath),
          ],
        };
      });

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

    const getOrgSearchSettings = (orgId: string): SearchItem[] => [
      createSearchItem("org-general", { orgId }),
      createSearchItem("org-members", { orgId }),
      createSearchItem("org-sandbox", { orgId }),
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
      {
        groupLabel: tSearch("groupLabels.billing"),
        items: filterItems([createSearchItem("manage-billing")]),
      },
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

    if (projectId && files && files.length) {
      let filteredFileItems = getFileSearchItems().filter((item) => {
        if (q === "") return true;
        const normalizedLabel = normalizeSearchString(item.label);
        const normalizedKeywords = item.keywords.map(normalizeSearchString);
        return (
          normalizedLabel.includes(q) ||
          normalizedKeywords.some((kw) => kw.includes(q))
        );
      });

      if (q === "") {
        filteredFileItems = filteredFileItems.slice(0, 5);
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
    query,
    searchItems,
    tSearch,
    projectId,
    files,
    fileList,
    config,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Button
        onClick={() => setOpen(true)}
        variant="ghost"
        className="bg-background hover:bg-background border-border h-auto w-full items-center justify-between border px-4 py-2.25"
      >
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <Search />
          {tCommon("search_placeholder")}
        </span>
        {isDesktop && (
          <KbdGroup>
            <Kbd>{isMac ? "⌘+K" : "Ctrl+K"}</Kbd>
          </KbdGroup>
        )}
      </Button>
      <CommandDialog
        className="md:p-0"
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              placeholder={tSearch("placeholder")}
              value={query}
              onValueChange={setQuery}
            />
            <button
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              className="absolute top-1/2 right-3 -translate-y-1/2"
            >
              <KbdGroup>
                <Kbd>Esc</Kbd>
              </KbdGroup>
            </button>
          </div>
          <CommandList>
            <CommandEmpty>{tCommon("status.no_results")}</CommandEmpty>
            {results.map((result, idx) => (
              <React.Fragment key={result.groupLabel || idx}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={result.groupLabel}>
                  {result.items.map((item) => (
                    <CommandItem
                      onSelect={() => {
                        setOpen(false);
                        setQuery("");

                        if (item.file) {
                          handleFileSelect(item.file);
                          return;
                        }

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
                      key={item.id}
                    >
                      {item.file ? getFileIcon(item.file) : null}
                      <span>{item.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>
          <div className="border-border text-muted-foreground sticky bottom-0 flex items-center gap-4 border-t px-3 py-2 text-xs">
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
        </Command>
      </CommandDialog>
    </div>
  );
}

interface SearchItemGroup {
  groupLabel: string;
  items: SearchItem[];
}
