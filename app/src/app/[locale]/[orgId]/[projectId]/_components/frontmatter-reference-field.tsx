import { decodeGitContent } from "@/lib/utils/git-content";
import { useGitProvider } from "@/hooks/use-git-provider";
import { logger } from "@/lib/logger";
import {} from "@/components/ui/alert-dialog";
import {} from "@/components/ui/breadcrumb";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { Template } from "@/lib/utils/schema-helpers";
import { selectConfig } from "@/redux/features/config/slice";
import { useLazyGetGitHubContentQuery } from "@/redux/features/github";
import { useLazyGetGitLabContentQuery } from "@/redux/features/gitlab";
import { useAppSelector } from "@/redux/store";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

/**
 * Dropdown fields whose options come from the repository — a folder listing, a
 * referenced file, or a static list — rather than from the schema itself.
 */

function matchPattern(str: string, pattern: string) {
  if (!pattern) return true;
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexPattern}$`).test(str);
}

export function useReferenceOptions(item: Template) {
  const config = useAppSelector(selectConfig);
  const { useGitTrees, useGitContent } = useGitProvider();

  // Tree query for folder references
  const { data: treeData, isFetching: treeFetching } = useGitTrees("", {
    recursive: true,
    skip: item.referenceType !== "folder" || !config.token,
  });

  // Content query for single-file references
  const { data: contentData, isFetching: contentFetching } = useGitContent(
    item.referencePath || "",
    {
      skip:
        item.referenceType !== "file" || !item.referencePath || !config.token,
    },
  );

  const [lazyGetGhContent] = useLazyGetGitHubContentQuery();
  const [lazyGetGlContent] = useLazyGetGitLabContentQuery();
  const [folderFieldOptions, setFolderFieldOptions] = useState<
    Record<string, string>
  >({});

  const trees = useMemo(() => treeData?.files || [], [treeData]);

  const folderFiles = useMemo(() => {
    if (item.referenceType !== "folder") return [];
    return trees
      .filter(
        (t) =>
          t.type === "blob" && t.path?.startsWith(item.referencePath + "/"),
      )
      .filter((t) => {
        const pathStr = t.path || "";
        const name = pathStr.replace(item.referencePath + "/", "") || "";
        if (!name) return false;
        if (item.referenceExclude && matchPattern(name, item.referenceExclude))
          return false;
        if (item.referenceInclude && !matchPattern(name, item.referenceInclude))
          return false;
        return true;
      });
  }, [
    item.referenceType,
    item.referencePath,
    item.referenceExclude,
    item.referenceInclude,
    trees,
  ]);

  useEffect(() => {
    if (
      item.referenceType === "folder" &&
      item.referenceField &&
      folderFiles.length > 0
    ) {
      const fetchFields = async () => {
        const newOptions: Record<string, string> = {};
        const limitedFiles = folderFiles.slice(0, 20); // Limit to 20 files for safety

        await Promise.all(
          limitedFiles.map(async (file) => {
            try {
              let contentStr = "";
              if (isGitHubProvider(config.provider)) {
                const res = await lazyGetGhContent({
                  owner: config.owner,
                  repo: config.repoName,
                  path: file.path!,
                  ref: config.branch,
                  config: config,
                }).unwrap();
                if (typeof res?.data === "string") {
                  contentStr = res.data;
                } else if (res?.content) {
                  contentStr = decodeURIComponent(
                    escape(atob(res.content.replace(/\n/g, ""))),
                  );
                }
              } else if (isGitLabProvider(config.provider)) {
                const res = await lazyGetGlContent({
                  id: config.repoName
                    ? `${config.owner}/${config.repoName}`
                    : config.owner,
                  file_path: file.path!,
                  ref: config.branch,
                }).unwrap();
                if (typeof res?.data === "string") {
                  contentStr = res.data;
                } else if (res?.content) {
                  contentStr = decodeURIComponent(
                    escape(atob((res.content as string).replace(/\n/g, ""))),
                  );
                }
              }

              if (contentStr) {
                const format = fmDetector(
                  contentStr,
                  file.path?.split(".").pop(),
                );
                const parsed = parseContentJson(contentStr, format);
                const fieldToFetch =
                  item.referenceField === "___slug___"
                    ? "slug"
                    : item.referenceField;
                if (parsed?.data && parsed.data[fieldToFetch!]) {
                  newOptions[file.path!] = String(parsed.data[fieldToFetch!]);
                }
              }
            } catch (e) {
              logger.error("Failed to fetch folder field", e);
            }
          }),
        );
        setFolderFieldOptions(newOptions);
      };
      fetchFields();
    }
  }, [
    item.referenceField,
    item.referenceType,
    folderFiles,
    config,
    lazyGetGhContent,
    lazyGetGlContent,
  ]);

  let options: { label: string; value: string }[] = [];
  const isFetching = treeFetching || contentFetching;

  if (item.referenceType === "static" || !item.referenceType) {
    options = (item.options || []).map((opt) => ({ label: opt, value: opt }));
  } else if (item.referenceType === "folder") {
    options = folderFiles.map((t) => {
      const pathStr = t.path || "";
      const filename = pathStr.replace(item.referencePath + "/", "") || "";
      let label = "";
      if (item.referenceField === "___slug___") {
        const generatedSlug = filename.replace(/\.[^/.]+$/, "");
        label = folderFieldOptions[pathStr] || generatedSlug;
      } else {
        label = folderFieldOptions[pathStr] || filename;
      }
      return { label, value: label };
    });
  } else if (item.referenceType === "file") {
    try {
      const rawContent = decodeGitContent(contentData);

      if (rawContent) {
        const format = fmDetector(
          rawContent,
          item.referencePath?.split(".").pop(),
        );
        const parsedResult = parseContentJson(rawContent, format);
        const data = parsedResult?.data;

        if (Array.isArray(data)) {
          if (data.every((v) => typeof v === "string")) {
            options = data.map((s) => ({ label: s, value: s }));
          }
        } else if (data && typeof data === "object") {
          if (item.referenceField && data[item.referenceField]) {
            const fieldData = data[item.referenceField];
            if (
              Array.isArray(fieldData) &&
              fieldData.every((v) => typeof v === "string")
            ) {
              options = fieldData.map((s: string) => ({ label: s, value: s }));
            }
          } else {
            const stringArrayEntry = Object.entries(data).find(
              ([, v]) =>
                Array.isArray(v) &&
                (v as unknown[]).every((i) => typeof i === "string"),
            );
            if (stringArrayEntry) {
              options = (stringArrayEntry[1] as string[]).map((s) => ({
                label: s,
                value: s,
              }));
            }
          }
        }
      }
    } catch (e) {
      logger.error("Failed to parse reference file", e);
    }
  }

  return { options, isFetching };
}

export function ReferenceDropdown({
  item,
  value,
  onChange,
}: {
  item: Template;
  value: string;
  onChange: (value: string) => void;
}) {
  const { options, isFetching } = useReferenceOptions(item);
  const tEditor = useTranslations("editor");

  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger disabled={isFetching}>
        <SelectValue
          placeholder={
            isFetching
              ? tEditor("renderer.loading_options")
              : tEditor("renderer.select_an_option")
          }
        />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt, index) => (
          <SelectItem key={index} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReferenceMultiSelect({
  item,
  value,
  onChange,
}: {
  item: Template;
  value: { id: string; value: string }[];
  onChange: (value: { id: string; value: string }[]) => void;
}) {
  const { options, isFetching } = useReferenceOptions(item);
  const tEditor = useTranslations("editor");
  const selectedValues = (value || []).map((v) => v.value);
  const anchor = useComboboxAnchor();

  return (
    <Combobox
      multiple
      value={selectedValues}
      onValueChange={(newValues: string[]) => {
        const updated = newValues.map((val) => {
          const existing = (value || []).find((v) => v.value === val);
          return existing || { id: crypto.randomUUID(), value: val };
        });
        onChange(updated);
      }}
      items={options.map((o) => o.value)}
    >
      <ComboboxChips ref={anchor} className="min-h-10">
        {selectedValues.map((val) => (
          <ComboboxChip key={val}>
            {options.find((o) => o.value === val)?.label || val}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          placeholder={
            isFetching
              ? tEditor("renderer.loading")
              : tEditor("renderer.select_options")
          }
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{tEditor("renderer.no_items_found")}</ComboboxEmpty>
        <ComboboxList>
          {(v: string) => {
            const opt = options.find((o) => o.value === v);
            return (
              <ComboboxItem key={v} value={v}>
                {opt?.label || v}
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
