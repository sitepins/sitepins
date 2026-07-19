"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils/cn";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import { matchPattern } from "@/lib/utils/git-utils";
import isConfigFile from "@/lib/utils/is-config-file";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import {
  createNewField as libCreateNewField,
  Template,
} from "@/lib/utils/schema-helpers";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubTreesQuery,
  useLazyGetGitHubContentQuery,
} from "@/redux/features/github";
import {
  useGetGitLabTreesQuery,
  useLazyGetGitLabContentQuery,
} from "@/redux/features/gitlab";
import { useAppSelector } from "@/redux/store";
import { TTree } from "@/types";
import {
  ArrowLeft,
  Calendar,
  Check,
  Code2,
  Eye,
  EyeOff,
  Files,
  GripVertical,
  Hash,
  Image as ImageIcon,
  List,
  Plus,
  Settings,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { Reorder, useDragControls, useMotionValue } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// snake_case helper used by both components
const toSnakeCase = (input: string) =>
  input
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();

export const getTypeIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case "string":
      return Type;
    case "number":
      return Hash;
    case "boolean":
      return ToggleLeft;
    case "media":
      return ImageIcon;
    case "gallery":
      return Files;
    case "array":
      return List;
    case "date":
    case "datetime":
      return Calendar;
    case "object":
      return Code2;
    default:
      return Settings;
  }
};

export function SortableFieldItem({
  item,
  isActive,
  onSelect,
}: {
  item: Template;
  isActive: boolean;
  onSelect: () => void;
}) {
  const tCommon = useTranslations("common");
  const y = useMotionValue(0);
  const dragControls = useDragControls();
  const Icon = getTypeIcon(item.type);

  return (
    <Reorder.Item
      value={item}
      style={{ y }}
      dragListener={false}
      dragControls={dragControls}
      className="list-none"
    >
      <div
        className={cn(
          "group flex w-full items-center gap-2 px-3 py-2 text-left transition-all duration-200",
          isActive ? "bg-primary/10" : "hover:bg-muted/40",
          item.isIgnored && "opacity-50",
        )}
      >
        <span
          className="cursor-grab touch-none"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical className="text-muted-foreground/30 hover:text-muted-foreground/60 size-5 shrink-0 transition-colors" />
        </span>

        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 focus:outline-none"
        >
          <div className="bg-muted/40 border-border/40 flex size-8 shrink-0 items-center justify-center rounded-lg border">
            <Icon className="text-muted-foreground/80 size-4" />
          </div>

          <div className="ml-1 min-w-0 flex-1 text-start select-none">
            <p className="text-foreground/90 truncate text-[13px] font-semibold tracking-tight">
              {item.label || item.name}
            </p>
            <p className="text-muted-foreground/70 mt-0.5 truncate text-[11px] font-medium capitalize">
              {item.type}
            </p>
          </div>

          {item.isRequired && (
            <Badge
              variant="muted"
              size="sm"
              className="bg-muted/60 text-muted-foreground ml-auto border-none text-[10px] font-medium"
            >
              {tCommon("labels.required")}
            </Badge>
          )}
        </button>
      </div>
    </Reorder.Item>
  );
}

type Props = {
  onAdd: (field: Template) => void;
  onCancel: () => void;
};

function useProjectTrees() {
  const config = useAppSelector(selectConfig);
  const { data: ghData } = useGetGitHubTreesQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      tree_sha: config.branch,
      recursive: "1",
      config: config,
    },
    { skip: !config.token || !isGitHubProvider(config.provider) },
  );

  const { data: glData } = useGetGitLabTreesQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      ref: config.branch,
      recursive: true,
      config: config,
    },
    { skip: !config.token || !isGitLabProvider(config.provider) },
  );

  return (
    (isGitLabProvider(config.provider) ? glData?.files : ghData?.files) || []
  );
}

function PathSelector({
  value,
  onChange,
  placeholder,
  items,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
  items: string[];
}) {
  const tCommon = useTranslations("common");
  return (
    <Combobox
      value={value}
      onValueChange={(v) => onChange(v as string)}
      items={items}
    >
      <ComboboxInput placeholder={value || placeholder} />
      <ComboboxContent>
        <ComboboxEmpty>{tCommon("status.no_results")}</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item as string} value={item as string}>
              {item as string}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function useAvailableFields(
  trees: TTree[],
  referenceType: string,
  referencePath: string,
  referenceInclude: string,
  referenceExclude: string,
) {
  const config = useAppSelector(selectConfig);
  const [lazyGetGhContent] = useLazyGetGitHubContentQuery();
  const [lazyGetGlContent] = useLazyGetGitLabContentQuery();
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchFields() {
      // Trim patterns
      const includePattern = (referenceInclude || "").trim();
      const excludePattern = (referenceExclude || "").trim();

      if (!referencePath || referenceType === "static" || trees.length === 0) {
        if (isMounted) setAvailableFields([]);
        return;
      }

      setIsLoading(true);
      // Clear available fields at start to avoid showing stale data from previous file
      if (isMounted) setAvailableFields([]);

      try {
        let fileToFetch: TTree | undefined;

        if (referenceType === "folder") {
          fileToFetch = trees
            .filter(
              (t) =>
                t.type === "blob" && t.path?.startsWith(referencePath + "/"),
            )
            .filter((t) => {
              const filename = t.path!.replace(referencePath + "/", "");
              if (!filename) return false;
              if (excludePattern && matchPattern(filename, excludePattern))
                return false;
              if (includePattern && !matchPattern(filename, includePattern))
                return false;
              return true;
            })[0];
        } else if (referenceType === "file") {
          fileToFetch = trees.find((t) => t.path === referencePath);
        }

        if (fileToFetch && fileToFetch.path) {
          let contentStr = "";
          if (isGitHubProvider(config.provider)) {
            const res = await lazyGetGhContent({
              owner: config.owner,
              repo: config.repoName,
              path: fileToFetch.path,
              ref: config.branch,
              config: config,
            }).unwrap();
            // transformResponse already decodes content into res.data
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
              file_path: fileToFetch.path,
              ref: config.branch,
            }).unwrap();
            // transformResponse already decodes content into res.data
            if (typeof res?.data === "string") {
              contentStr = res.data;
            } else if (res?.content) {
              contentStr = decodeURIComponent(
                escape(atob((res.content as string).replace(/\n/g, ""))),
              );
            }
          }

          if (contentStr && isMounted) {
            const format = fmDetector(
              contentStr,
              fileToFetch.path.split(".").pop(),
            );
            const parsed = parseContentJson(contentStr, format);
            let fields: string[] = [];

            if (
              referenceType === "folder" &&
              parsed?.data &&
              typeof parsed.data === "object" &&
              !Array.isArray(parsed.data)
            ) {
              // Only show keys whose frontmatter value is a plain string
              fields = Object.entries(parsed.data)
                .filter(([, v]) => typeof v === "string")
                .map(([k]) => k);
            } else if (referenceType === "file" && parsed?.data) {
              if (Array.isArray(parsed.data)) {
                // Array of objects – not useful for a "pick a key" selector; skip
              } else if (typeof parsed.data === "object") {
                // Only show keys whose value is an array of strings
                fields = Object.entries(parsed.data)
                  .filter(
                    ([, v]) =>
                      Array.isArray(v) &&
                      (v as any[]).every((i) => typeof i === "string"),
                  )
                  .map(([k]) => k);
              }
            }
            if (isMounted) setAvailableFields(fields);
          }
        } else if (isMounted) {
          setAvailableFields([]);
        }
      } catch (e) {
        console.error("Failed to fetch fields for parsing", e);
        if (isMounted) setAvailableFields([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchFields();

    return () => {
      isMounted = false;
    };
  }, [
    referenceType,
    referencePath,
    referenceInclude,
    referenceExclude,
    trees,
    config,
    lazyGetGhContent,
    lazyGetGlContent,
  ]);

  return { availableFields, isLoading };
}

export function FieldForm({
  initialData,
  onSave,
  onCancel,
  submitLabel = "Add Field",
}: {
  initialData?: Partial<Template>;
  onSave: (field: Template) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [type, setType] = useState<string>(initialData?.type || "");
  const [name, setName] = useState<string>(initialData?.name || "");
  const [label, setLabel] = useState<string>(initialData?.label || "");
  const [subType, setSubType] = useState<string>(initialData?.subType || "");
  const [isDropdown, setIsDropdown] = useState<boolean>(
    initialData?.isDropdown || false,
  );
  const [options, setOptions] = useState<string[]>(initialData?.options || []);
  const [referenceType, setReferenceType] = useState<
    "static" | "folder" | "file"
  >(initialData?.referenceType || "static");
  const [referencePath, setReferencePath] = useState<string>(
    initialData?.referencePath || "",
  );
  const [referenceInclude, setReferenceInclude] = useState<string>(
    initialData?.referenceInclude || "",
  );
  const [referenceExclude, setReferenceExclude] = useState<string>(
    initialData?.referenceExclude || "",
  );
  const [referenceField, setReferenceField] = useState<string>(
    initialData?.referenceField || "",
  );
  const trees = useProjectTrees();
  const [newOption, setNewOption] = useState<string>("");
  const [nestedFields, setNestedFields] = useState<Template[]>(
    initialData?.fields || [],
  );
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState<boolean>(
    !!initialData?.name,
  );

  const { availableFields, isLoading: isFetchingFields } = useAvailableFields(
    trees,
    referenceType,
    referencePath,
    referenceInclude,
    referenceExclude,
  );

  // Clear nested drafts UI/state when nested fields are not applicable
  useEffect(() => {
    const needsNested =
      type === "object" || (type === "Array" && subType === "object");
    if (!needsNested) {
      setNestedFields([]);
    }
  }, [type, subType]);

  const handleAddOption = () => {
    if (!newOption.trim()) return;
    if (options.includes(newOption.trim())) return;
    setOptions([...options, newOption.trim()]);
    setNewOption("");
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!type || !name.trim()) return;

    const newField = libCreateNewField(type, name);
    if (label.trim()) newField.label = label.trim();

    if (type === "object" || (type === "Array" && subType === "object")) {
      if (nestedFields.length) newField.fields = nestedFields;
    }

    if (type === "Array" && subType) {
      newField.subType = subType;
    }

    if (
      (type === "string" || (type === "Array" && subType === "string")) &&
      isDropdown
    ) {
      newField.isDropdown = true;
      newField.referenceType = referenceType;
      if (referenceType === "static" && options.length > 0) {
        newField.options = options;
      } else if (referenceType !== "static") {
        newField.referencePath = referencePath;
        newField.referenceInclude = referenceInclude;
        newField.referenceExclude = referenceExclude;
        newField.referenceField = referenceField;
      }
    }

    onSave(newField);
  };

  const tSchema = useTranslations("schema");
  const tCommon = useTranslations("common");

  return (
    <div className="bg-muted/50 border-border space-y-6 rounded-lg border p-4">
      <div>
        <h4 className="text-foreground text-sm font-medium">
          {tSchema("configuration.title")}
        </h4>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs font-medium">
            {tSchema("fields.type")}
          </Label>
          <Select
            value={type}
            onValueChange={(val) => {
              setType(val);
              if (val === "Array" && !subType) {
                setSubType("string");
              }
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={tSchema("fields.placeholder.type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">{tSchema("types.string")}</SelectItem>
              <SelectItem value="number">{tSchema("types.number")}</SelectItem>
              <SelectItem value="boolean">
                {tSchema("types.boolean")}
              </SelectItem>
              <SelectItem value="media">{tSchema("types.media")}</SelectItem>
              <SelectItem value="gallery">
                {tSchema("types.gallery")}
              </SelectItem>
              <SelectItem value="Array">{tSchema("types.array")}</SelectItem>
              <SelectItem value="Date">{tSchema("types.date")}</SelectItem>
              <SelectItem value="object">{tSchema("types.object")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">
            {tSchema("fields.label")}
          </Label>
          <Input
            value={label}
            onChange={(e) => {
              const v = e.target.value;
              setLabel(v);
              if (!isNameManuallyEdited) {
                setName(toSnakeCase(v));
              }
            }}
            className="h-9"
            placeholder={tSchema("fields.placeholder.label")}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">
            {tSchema("fields.name")}
          </Label>
          <Input
            value={name}
            onChange={(e) => {
              setName(toSnakeCase(e.target.value));
              setIsNameManuallyEdited(true);
            }}
            className="h-9"
            placeholder={tSchema("fields.placeholder.name")}
          />
        </div>

        {(type === "string" || (type === "Array" && subType === "string")) && (
          <div className="space-y-6 sm:col-span-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                {tSchema("fields.input_style.label")}
              </Label>
              <Select
                value={isDropdown ? "dropdown" : "text"}
                onValueChange={(val) => setIsDropdown(val === "dropdown")}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue
                    placeholder={tSchema("fields.input_style.placeholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">
                    {type === "Array"
                      ? tSchema("fields.input_style.options.standard_table")
                      : tSchema("fields.input_style.options.standard_text")}
                  </SelectItem>
                  <SelectItem value="dropdown">
                    {type === "Array"
                      ? tSchema("fields.input_style.options.multi_dropdown")
                      : tSchema("fields.input_style.options.dropdown")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isDropdown && (
              <div className="bg-muted/50 border-border space-y-6 rounded-lg border p-4">
                <h4 className="text-sm font-medium">
                  {type === "Array"
                    ? tSchema("configuration.dropdown.multi_title")
                    : tSchema("configuration.dropdown.title")}
                </h4>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      {tSchema("configuration.dropdown.source")}
                    </Label>
                    <Select
                      value={referenceType}
                      onValueChange={(v: "static" | "folder" | "file") => {
                        setReferenceType(v);
                        setReferencePath("");
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue
                          placeholder={tSchema(
                            "configuration.dropdown.source_placeholder",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="static">
                          {tSchema("configuration.dropdown.sources.static")}
                        </SelectItem>
                        <SelectItem value="folder">
                          {tSchema("configuration.dropdown.sources.folder")}
                        </SelectItem>
                        <SelectItem value="file">
                          {tSchema("configuration.dropdown.sources.file")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {referenceType === "static" && (
                    <div className="space-y-2">
                      {options.length > 0 && (
                        <div className="space-y-2">
                          {options.map((option, index) => (
                            <div
                              key={index}
                              className="bg-background flex items-center justify-between gap-2 rounded p-2"
                            >
                              <span className="text-sm">{option}</span>
                              <Button
                                size="icon"
                                type="button"
                                variant="ghost"
                                className="size-6"
                                onClick={() => handleRemoveOption(index)}
                              >
                                <X className="text-destructive size-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={tSchema(
                            "configuration.dropdown.static.placeholder",
                          )}
                          value={newOption}
                          onChange={(e) => setNewOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddOption();
                            }
                          }}
                          className="h-8 flex-1"
                        />
                        <Button
                          type="button"
                          size="icon"
                          onClick={handleAddOption}
                          disabled={!newOption.trim()}
                          className="h-8 w-8"
                        >
                          <Check className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {referenceType === "folder" && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {tSchema("configuration.dropdown.folder.path")}
                        </Label>
                        <PathSelector
                          value={referencePath}
                          onChange={setReferencePath}
                          placeholder={tSchema(
                            "configuration.dropdown.folder.path_placeholder",
                          )}
                          items={trees
                            .filter(
                              (t) =>
                                t.type !== "blob" && !t.path?.startsWith("."),
                            )
                            .map((t) => t.path!)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {tSchema(
                            "configuration.dropdown.folder.display_field",
                          )}
                        </Label>
                        <Select
                          value={referenceField || "___default___"}
                          onValueChange={(v) =>
                            setReferenceField(v === "___default___" ? "" : v)
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue
                              placeholder={
                                isFetchingFields
                                  ? tSchema(
                                      "configuration.dropdown.folder.loading_fields",
                                    )
                                  : tSchema(
                                      "configuration.dropdown.folder.field_placeholder",
                                    )
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="___default___">
                              {tSchema(
                                "configuration.dropdown.folder.default_field",
                              )}
                            </SelectItem>
                            <SelectItem value="___slug___">slug</SelectItem>
                            {availableFields.map((f) => (
                              <SelectItem key={f} value={f}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {tSchema(
                            "configuration.dropdown.folder.include_pattern",
                          )}
                        </Label>
                        <Input
                          placeholder={tSchema(
                            "configuration.dropdown.folder.include_placeholder",
                          )}
                          value={referenceInclude}
                          onChange={(e) => setReferenceInclude(e.target.value)}
                          className="h-8 flex-1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {tSchema(
                            "configuration.dropdown.folder.exclude_pattern",
                          )}
                        </Label>
                        <Input
                          placeholder={tSchema(
                            "configuration.dropdown.folder.exclude_placeholder",
                          )}
                          value={referenceExclude}
                          onChange={(e) => setReferenceExclude(e.target.value)}
                          className="h-8 flex-1"
                        />
                      </div>
                    </div>
                  )}

                  {referenceType === "file" && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {tSchema("configuration.dropdown.file.path")}
                        </Label>
                        <PathSelector
                          value={referencePath}
                          onChange={setReferencePath}
                          placeholder={tSchema(
                            "configuration.dropdown.file.path_placeholder",
                          )}
                          items={trees
                            .filter(
                              (t) => t.type === "blob" && isConfigFile(t.path),
                            )
                            .map((t) => t.path!)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {tSchema("configuration.dropdown.file.data_key")}
                        </Label>
                        <Select
                          value={referenceField || "___default___"}
                          onValueChange={(v) =>
                            setReferenceField(v === "___default___" ? "" : v)
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue
                              placeholder={
                                isFetchingFields
                                  ? tSchema(
                                      "configuration.dropdown.folder.loading_fields",
                                    )
                                  : tSchema(
                                      "configuration.dropdown.file.key_placeholder",
                                    )
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="___default___">
                              {tSchema(
                                "configuration.dropdown.file.default_key",
                              )}
                            </SelectItem>
                            {availableFields.map((f) => (
                              <SelectItem key={f} value={f}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {(type === "Array" || type === "object") && (
          <div className="space-y-6 sm:col-span-3">
            {type === "Array" && (
              <div className="space-y-2">
                <Label>{tSchema("array.label")}</Label>
                <Select value={subType} onValueChange={setSubType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={tSchema("array.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">
                      {tSchema("types.string")}
                    </SelectItem>
                    <SelectItem value="number">
                      {tSchema("types.number")}
                    </SelectItem>
                    <SelectItem value="boolean">
                      {tSchema("types.boolean")}
                    </SelectItem>
                    <SelectItem value="object">
                      {tSchema("types.object")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(type === "object" ||
              (type === "Array" && subType === "object")) && (
              <div className="bg-background border-border space-y-6 rounded-lg border p-4">
                <h4 className="text-sm font-medium">
                  {tSchema("nested.title")}
                </h4>
                <CreateSchemaNestedEditor
                  parentName={name}
                  fields={nestedFields}
                  onUpdateField={(_, nested) => {
                    setNestedFields((prev) =>
                      updateFieldInTemplate(prev, nested),
                    );
                  }}
                  onDeleteField={(_, fieldName) => {
                    setNestedFields((prev) =>
                      removeFieldFromTemplate(prev, fieldName),
                    );
                  }}
                  onAddField={(_, newField) => {
                    setNestedFields((prev) => {
                      const res = appendFieldToTemplate(prev, newField);
                      if (res.error) {
                        toast.error(tSchema(`errors.${res.error}`));
                        return prev;
                      }
                      return res.template;
                    });
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 sm:col-span-3">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {tCommon("actions.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={
              !label.trim() ||
              !name.trim() ||
              !type ||
              (isDropdown &&
                referenceType === "static" &&
                options.length === 0) ||
              (isDropdown && referenceType !== "static" && !referencePath)
            }
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CreateSchemaAddField({ onAdd, onCancel }: Props) {
  const tSchema = useTranslations("schema");
  return (
    <FieldForm
      onSave={onAdd}
      onCancel={onCancel}
      submitLabel={tSchema("actions.add_option")}
    />
  );
}

type NestedEditorProps = {
  parentName: string;
  fields?: Template[];
  onUpdateField: (parentName: string, nested: Template) => void;
  onDeleteField: (parentName: string, fieldName: string) => void;
  onAddField: (parentName: string, newField: Template) => void;
};

export function FieldItem({
  item,
  onChange,
  onDelete,
  showAdvanced = true,
  panelMode = false,
}: {
  item: Template;
  onChange: (item: Template) => void;
  onDelete: () => void;
  showAdvanced?: boolean;
  /** When true, renders without a Card wrapper and hides the inline header buttons */
  panelMode?: boolean;
}) {
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [newOption, setNewOption] = useState("");
  const trees = useProjectTrees();
  const tSchema = useTranslations("schema");
  const tCommon = useTranslations("common");
  const { availableFields, isLoading: isFetchingFields } = useAvailableFields(
    trees,
    item.referenceType || "static",
    item.referencePath || "",
    item.referenceInclude || "",
    item.referenceExclude || "",
  );

  const handleUpdateNested = (_: string, nested: Template) => {
    const fields = (item.fields || []).map((f) =>
      f.name === nested.name ? { ...f, ...nested } : f,
    );
    onChange({ ...item, fields });
  };

  const handleDeleteNested = (_: string, fieldName: string) => {
    const fields = (item.fields || []).filter((f) => f.name !== fieldName);
    onChange({ ...item, fields });
  };

  const handleAddNested = (_: string, newField: Template) => {
    const fields = [...(item.fields || []), newField];
    onChange({ ...item, fields });
  };

  const innerContent = (
    <div
      className={cn(
        "relative space-y-6",
        item.isIgnored && "opacity-50",
        panelMode ? "" : "p-6",
      )}
    >
      {!panelMode && (
        <div className="flex items-center justify-between">
          <Label className="capitalize">{item.name}</Label>
          <div className="flex items-center gap-2">
            <Button
              size={"icon"}
              type="button"
              className="size-8"
              variant={"ghost"}
              onClick={() => onChange({ ...item, isIgnored: !item.isIgnored })}
              title={
                item.isIgnored
                  ? tSchema("actions.include")
                  : tSchema("actions.ignore")
              }
            >
              {item.isIgnored ? (
                <Check className="text-success size-4" />
              ) : (
                <EyeOff className="text-muted-foreground size-4" />
              )}
            </Button>
            <Button
              size={"icon"}
              type="button"
              className="size-8"
              variant={"ghost"}
              onClick={onDelete}
              title={tCommon("actions.delete")}
            >
              <Trash2 className="text-destructive size-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>{tSchema("fields.type")}</Label>
        <Select
          value={item.type}
          onValueChange={(value) => {
            const updates: any = { type: value };
            if (value === "Array" && !item.subType) {
              updates.subType = "string";
            }
            onChange({ ...item, ...updates });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={tSchema("fields.placeholder.type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="string">String</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="boolean">Boolean</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="gallery">Gallery</SelectItem>
            <SelectItem value="Array">Array</SelectItem>
            <SelectItem value="Date">Date</SelectItem>
            <SelectItem value="object">Object</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {item.type === "Array" && (
        <div className="space-y-2">
          <Label>{tSchema("array.label")}</Label>
          <Select
            value={item.subType}
            onValueChange={(val) => onChange({ ...item, subType: val })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose subtype" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">{tSchema("types.string")}</SelectItem>
              <SelectItem value="number">{tSchema("types.number")}</SelectItem>
              <SelectItem value="boolean">
                {tSchema("types.boolean")}
              </SelectItem>
              <SelectItem value="object">{tSchema("types.object")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`label-${item.name}`}>{tSchema("fields.label")}</Label>
        <Input
          id={`label-${item.name}`}
          type="text"
          className="w-full"
          placeholder={tSchema("fields.placeholder.label")}
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
        />
      </div>

      {showAdvanced && (
        <div className="space-y-2">
          <Label htmlFor={`desc-${item.name}`}>
            {tSchema("fields.description")}
          </Label>
          <Input
            id={`desc-${item.name}`}
            type="text"
            className="w-full"
            placeholder={tSchema("fields.description").toLowerCase()}
            value={item.description ?? ""}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
          />
        </div>
      )}

      {showAdvanced &&
        (item.type === "boolean" ||
          item.type === "number" ||
          item.type === "string" ||
          (item.type === "Array" && item.subType === "string")) && (
          <div>
            {item.type === "boolean" ? (
              <div className="space-y-2">
                <Label htmlFor={`default-${item.name}`}>
                  {tSchema("fields.default_value")}
                </Label>
                <Select
                  value={item.defaultValue ?? "false"}
                  onValueChange={(val) =>
                    onChange({ ...item, defaultValue: val })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select default value" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">
                      {tSchema("fields.boolean.true")}
                    </SelectItem>
                    <SelectItem value="false">
                      {tSchema("fields.boolean.false")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : item.type === "number" ? (
              <div className="space-y-2">
                <Label htmlFor={`default-${item.name}`}>
                  {tSchema("fields.default_value")}
                </Label>
                <Input
                  id={`default-${item.name}`}
                  type="number"
                  className="w-full"
                  placeholder="0"
                  value={item.defaultValue ?? ""}
                  onChange={(e) =>
                    onChange({ ...item, defaultValue: e.target.value })
                  }
                />
              </div>
            ) : (
              <div className="space-y-6">
                {item.type !== "Array" && (
                  <div className="space-y-2">
                    <Label htmlFor={`default-${item.name}`}>
                      {tSchema("fields.default_value")}
                    </Label>
                    <Input
                      id={`default-${item.name}`}
                      type="text"
                      className="w-full"
                      placeholder={tSchema(
                        "fields.default_value",
                      ).toLowerCase()}
                      value={item.defaultValue ?? ""}
                      onChange={(e) =>
                        onChange({ ...item, defaultValue: e.target.value })
                      }
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor={`inputStyle-${item.name}`}>
                    {tSchema("fields.input_style.label")}
                  </Label>
                  <Select
                    value={item.isDropdown ? "dropdown" : "text"}
                    onValueChange={(val) =>
                      onChange({
                        ...item,
                        isDropdown: val === "dropdown",
                        referenceType:
                          val === "dropdown"
                            ? item.referenceType || "static"
                            : undefined,
                        options:
                          val === "dropdown" ? item.options || [] : undefined,
                      })
                    }
                  >
                    <SelectTrigger
                      id={`inputStyle-${item.name}`}
                      className="w-full"
                    >
                      <SelectValue placeholder="Choose input style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">
                        {item.type === "Array"
                          ? tSchema("fields.input_style.options.standard_table")
                          : tSchema("fields.input_style.options.standard_text")}
                      </SelectItem>
                      <SelectItem value="dropdown">
                        {item.type === "Array"
                          ? tSchema("fields.input_style.options.multi_dropdown")
                          : tSchema("fields.input_style.options.dropdown")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {item.isDropdown && (
                  <div className="bg-background border-border space-y-6 rounded-lg border p-3">
                    <h5 className="text-xs font-medium">
                      {item.type === "Array"
                        ? tSchema("configuration.dropdown.multi_title")
                        : tSchema("configuration.dropdown.title")}
                    </h5>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">
                          {tSchema("configuration.dropdown.source")}
                        </Label>
                        <Select
                          value={item.referenceType || "static"}
                          onValueChange={(v: "static" | "folder" | "file") => {
                            onChange({
                              ...item,
                              referenceType: v,
                              referencePath: "",
                            });
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue
                              placeholder={tSchema(
                                "configuration.dropdown.source_placeholder",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="static">
                              Static Options
                            </SelectItem>
                            <SelectItem value="folder">
                              Files from Folder
                            </SelectItem>
                            <SelectItem value="file">Data from File</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(item.referenceType === "static" ||
                        !item.referenceType) && (
                        <div className="space-y-2">
                          {(item.options || []).map((option, optIndex) => (
                            <div
                              key={optIndex}
                              className="bg-background flex items-center justify-between gap-2 rounded p-2"
                            >
                              <span className="text-sm">{option}</span>
                              <Button
                                size="icon"
                                type="button"
                                variant="ghost"
                                className="size-6"
                                onClick={() =>
                                  onChange({
                                    ...item,
                                    options: (item.options || []).filter(
                                      (_, i) => i !== optIndex,
                                    ),
                                  })
                                }
                              >
                                <X className="text-destructive size-4" />
                              </Button>
                            </div>
                          ))}
                          {isAddingOption ? (
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder={tSchema("actions.enter_option")}
                                value={newOption}
                                onChange={(e) => setNewOption(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (newOption.trim()) {
                                      onChange({
                                        ...item,
                                        options: [
                                          ...(item.options || []),
                                          newOption.trim(),
                                        ],
                                      });
                                      setNewOption("");
                                      setIsAddingOption(false);
                                    }
                                  }
                                }}
                                className="h-8 flex-1"
                                autoFocus
                              />
                              <Button
                                type="button"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  if (newOption.trim()) {
                                    onChange({
                                      ...item,
                                      options: [
                                        ...(item.options || []),
                                        newOption.trim(),
                                      ],
                                    });
                                    setNewOption("");
                                    setIsAddingOption(false);
                                  }
                                }}
                              >
                                <Check className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  setNewOption("");
                                  setIsAddingOption(false);
                                }}
                              >
                                <X className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="text-muted-foreground hover:bg-muted/30 hover:text-text-dark w-full border-2 border-dashed py-2 text-xs"
                              onClick={() => {
                                setIsAddingOption(true);
                                setNewOption("");
                              }}
                            >
                              <Plus className="mr-2 size-4" />
                              {tSchema("actions.add_option")}
                            </Button>
                          )}
                        </div>
                      )}

                      {item.referenceType === "folder" && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">
                              {tSchema("configuration.dropdown.folder.path")}
                            </Label>
                            <PathSelector
                              value={item.referencePath}
                              onChange={(v) =>
                                onChange({ ...item, referencePath: v })
                              }
                              placeholder={tSchema(
                                "configuration.dropdown.folder.path_placeholder",
                              )}
                              items={trees
                                .filter(
                                  (t) =>
                                    t.type !== "blob" &&
                                    !t.path?.startsWith("."),
                                )
                                .map((t) => t.path!)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">
                              {tSchema(
                                "configuration.dropdown.folder.display_field",
                              )}
                            </Label>
                            <Select
                              value={item.referenceField || "___default___"}
                              onValueChange={(v) =>
                                onChange({
                                  ...item,
                                  referenceField:
                                    v === "___default___" ? "" : v,
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue
                                  placeholder={
                                    isFetchingFields
                                      ? tSchema(
                                          "configuration.dropdown.folder.loading_fields",
                                        )
                                      : tSchema(
                                          "configuration.dropdown.folder.field_placeholder",
                                        )
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="___default___">
                                  {tSchema(
                                    "configuration.dropdown.folder.default_field",
                                  )}
                                </SelectItem>
                                <SelectItem value="___slug___">slug</SelectItem>
                                {availableFields.map((f) => (
                                  <SelectItem key={f} value={f}>
                                    {f}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">
                              {tSchema(
                                "configuration.dropdown.folder.include_pattern",
                              )}
                            </Label>
                            <Input
                              placeholder={tSchema(
                                "configuration.dropdown.folder.include_placeholder",
                              )}
                              value={item.referenceInclude || ""}
                              onChange={(e) =>
                                onChange({
                                  ...item,
                                  referenceInclude: e.target.value,
                                })
                              }
                              className="h-8 flex-1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">
                              {tSchema(
                                "configuration.dropdown.folder.exclude_pattern",
                              )}
                            </Label>
                            <Input
                              placeholder={tSchema(
                                "configuration.dropdown.folder.exclude_placeholder",
                              )}
                              value={item.referenceExclude || ""}
                              onChange={(e) =>
                                onChange({
                                  ...item,
                                  referenceExclude: e.target.value,
                                })
                              }
                              className="h-8 flex-1"
                            />
                          </div>
                        </div>
                      )}

                      {item.referenceType === "file" && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">
                              {tSchema("configuration.dropdown.file.path")}
                            </Label>
                            <PathSelector
                              value={item.referencePath}
                              onChange={(v) =>
                                onChange({ ...item, referencePath: v })
                              }
                              placeholder={tSchema(
                                "configuration.dropdown.file.path_placeholder",
                              )}
                              items={trees
                                .filter(
                                  (t) =>
                                    t.type === "blob" && isConfigFile(t.path),
                                )
                                .map((t) => t.path!)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">
                              {tSchema("configuration.dropdown.file.data_key")}
                            </Label>
                            <Select
                              value={item.referenceField || "___default___"}
                              onValueChange={(v) =>
                                onChange({
                                  ...item,
                                  referenceField:
                                    v === "___default___" ? "" : v,
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue
                                  placeholder={
                                    isFetchingFields
                                      ? tSchema(
                                          "configuration.dropdown.folder.loading_fields",
                                        )
                                      : tSchema(
                                          "configuration.dropdown.file.key_placeholder",
                                        )
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="___default___">
                                  {tSchema(
                                    "configuration.dropdown.file.default_key",
                                  )}
                                </SelectItem>
                                {availableFields.map((f) => (
                                  <SelectItem key={f} value={f}>
                                    {f}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {showAdvanced && item.type === "Date" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor={`mode-${item.name}`}>
              {tSchema("date.default_value")}
            </Label>
            <Select
              value={
                item.alwaysUseCurrentDate
                  ? "dynamic"
                  : item.defaultValue === "" || !item.defaultValue
                    ? "empty"
                    : "static"
              }
              onValueChange={(val) => {
                if (val === "dynamic") {
                  onChange({
                    ...item,
                    alwaysUseCurrentDate: true,
                    defaultValue: "",
                  });
                } else if (val === "empty") {
                  onChange({
                    ...item,
                    alwaysUseCurrentDate: false,
                    defaultValue: "",
                  });
                } else {
                  onChange({
                    ...item,
                    alwaysUseCurrentDate: false,
                    defaultValue: item.defaultValue || new Date().toISOString(),
                  });
                }
              }}
            >
              <SelectTrigger id={`mode-${item.name}`} className="w-full">
                <SelectValue placeholder={tSchema("date.mode_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="static">{tSchema("date.static")}</SelectItem>
                <SelectItem value="dynamic">
                  {tSchema("date.dynamic")}
                </SelectItem>
                <SelectItem value="empty">{tSchema("date.empty")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!item.alwaysUseCurrentDate &&
            item.defaultValue !== "" &&
            item.defaultValue !== undefined && (
              <div className="space-y-2">
                <Label htmlFor={`default-${item.name}`}>
                  {tSchema("date.select_initial")}
                </Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="flex-1">
                    <DateTimePicker
                      date={
                        item.defaultValue
                          ? new Date(item.defaultValue)
                          : new Date()
                      }
                      setDate={(date) =>
                        onChange({
                          ...item,
                          defaultValue: date ? date.toISOString() : "",
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    id={`today-${item.name}`}
                    variant="outline"
                    onClick={() => {
                      const today = new Date().toISOString();
                      onChange({ ...item, defaultValue: today });
                    }}
                  >
                    {tSchema("date.today")}
                  </Button>
                </div>
              </div>
            )}
        </div>
      )}

      {item.fields && item.fields.length > 0 && (
        <CreateSchemaNestedEditor
          parentName={item.name}
          fields={item.fields}
          onUpdateField={handleUpdateNested}
          onDeleteField={handleDeleteNested}
          onAddField={handleAddNested}
        />
      )}
    </div>
  );

  return panelMode ? (
    innerContent
  ) : (
    <Card>
      <CardContent className="p-0">{innerContent}</CardContent>
    </Card>
  );
}

export function CreateSchemaNestedEditor({
  parentName,
  fields,
  onUpdateField,
  onDeleteField,
  onAddField,
}: NestedEditorProps) {
  const tSchema = useTranslations("schema");
  const tCommon = useTranslations("common");
  const [editingFieldName, setEditingFieldName] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="mt-4">
      <div className="bg-background border-border space-y-6 rounded-lg border p-4">
        <h4 className="text-sm font-medium">{tCommon("labels.fields")}</h4>
        <div className="space-y-6">
          {fields?.map((nf) => (
            <div key={nf.name} className="space-y-2">
              {editingFieldName === nf.name ? (
                <FieldForm
                  initialData={nf}
                  onSave={(updatedField) => {
                    onUpdateField(parentName, updatedField);
                    setEditingFieldName(null);
                  }}
                  onCancel={() => setEditingFieldName(null)}
                  submitLabel={tSchema("actions.update_field")}
                />
              ) : (
                <div
                  className="group relative"
                  onClick={() => setEditingFieldName(nf.name)}
                >
                  <FieldItem
                    item={nf}
                    onChange={(updated) => onUpdateField(parentName, updated)}
                    onDelete={() => onDeleteField(parentName, nf.name)}
                  />
                </div>
              )}
            </div>
          ))}
          {isAdding ? (
            <FieldForm
              onSave={(newField) => {
                onAddField(parentName, newField);
                setIsAdding(false);
              }}
              onCancel={() => setIsAdding(false)}
              submitLabel={tSchema("actions.add_field")}
            />
          ) : (
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="text-muted-foreground hover:bg-muted/30 hover:text-text-dark w-full border-2 border-dashed py-2 text-sm"
                onClick={() => setIsAdding(true)}
              >
                {tSchema("nested.add_button")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Template mutation helpers
export function updateFieldInTemplate(
  template: Template[] | undefined,
  value: Template,
): Template[] {
  return (
    template?.map((item) => {
      if (item.name === value.name) {
        const updatedItem = { ...item, ...value };

        // If type changed to a non-object/Array subtype, strip nested fields
        const isObjectOrArrayObject =
          updatedItem.type === "object" ||
          (updatedItem.type === "Array" && updatedItem.subType === "object");
        if (!isObjectOrArrayObject) {
          delete (updatedItem as any).fields;
        }
        if (updatedItem.type !== "Array") {
          delete (updatedItem as any).subType;
        }

        // Update the value field based on the new configuration (same logic as original)
        if (updatedItem.type === "Date") {
          if (updatedItem.alwaysUseCurrentDate === true) {
            updatedItem.value = new Date().toISOString().split("T")[0];
          } else if (
            updatedItem.defaultValue &&
            updatedItem.defaultValue !== ""
          ) {
            updatedItem.value = updatedItem.defaultValue;
          } else {
            updatedItem.value = "";
          }
        } else if (updatedItem.type === "boolean") {
          if (
            updatedItem.defaultValue !== undefined &&
            updatedItem.defaultValue !== ""
          ) {
            updatedItem.value = updatedItem.defaultValue === "true";
          } else {
            updatedItem.value = false;
          }
        } else if (updatedItem.type === "Array") {
          updatedItem.value = [];
        } else if (
          updatedItem.type === "string" &&
          updatedItem.defaultValue &&
          updatedItem.defaultValue !== ""
        ) {
          updatedItem.value = updatedItem.defaultValue;
        } else if (
          updatedItem.type === "number" &&
          updatedItem.defaultValue &&
          updatedItem.defaultValue !== ""
        ) {
          updatedItem.value = parseFloat(updatedItem.defaultValue) || 0;
        }

        return updatedItem;
      }
      return item;
    }) || []
  );
}

export function appendFieldToTemplate(
  template: Template[] | undefined,
  newField: Template,
): { template: Template[]; error?: string } {
  const trimmedName = (newField.name || "").trim();
  if (!trimmedName) {
    return { template: template || [], error: "name_required" };
  }
  if ((template || []).some((t) => t.name === trimmedName)) {
    return { template: template || [], error: "name_exists" };
  }

  return { template: [...(template || []), newField] };
}

export function removeFieldFromTemplate(
  template: Template[] | undefined,
  fieldName: string,
): Template[] {
  return (template || []).filter((item) => item.name !== fieldName);
}

export function updateNestedInTemplate(
  template: Template[] | undefined,
  parentName: string,
  nested: Template,
): Template[] {
  return (
    template?.map((item) => {
      if (item.name === parentName) {
        const fields = (item.fields || []).map((f) =>
          f.name === nested.name ? { ...f, ...nested } : f,
        );
        return { ...item, fields } as Template;
      }
      return item;
    }) || []
  );
}

export function deleteNestedFromTemplate(
  template: Template[] | undefined,
  parentName: string,
  fieldName: string,
): Template[] {
  return (
    template?.map((item) => {
      if (item.name === parentName) {
        const fields = (item.fields || []).filter((f) => f.name !== fieldName);
        return { ...item, fields } as Template;
      }
      return item;
    }) || []
  );
}

export function addNestedToTemplate(
  template: Template[] | undefined,
  parentName: string,
  newField: Template,
): Template[] {
  return (
    template?.map((item) => {
      if (item.name === parentName) {
        const fields = [...(item.fields || []), newField];
        return { ...item, fields } as Template;
      }
      return item;
    }) || []
  );
}

export function SchemaEditorLayout({
  template,
  setTemplate,
}: {
  template: Template[];
  setTemplate: React.Dispatch<React.SetStateAction<Template[]>>;
}) {
  const tCommon = useTranslations("common");
  const tSchema = useTranslations("schema");
  const [showAddFieldForm, setShowAddFieldForm] = useState(false);
  const [selectedFieldName, setSelectedFieldName] = useState<string | null>(
    null,
  );
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const onChangeHandler = (value: Template) => {
    setTemplate((prev) => updateFieldInTemplate(prev, value));
  };

  const deleteField = (fieldName: string): void => {
    setTemplate((prev) => removeFieldFromTemplate(prev, fieldName));
    if (selectedFieldName === fieldName) {
      setSelectedFieldName(null);
      setMobileShowDetail(false);
    }
  };

  const openAddFieldForm = (): void => {
    setShowAddFieldForm(true);
    setSelectedFieldName(null);
    setMobileShowDetail(true);
  };

  const cancelAddField = (): void => {
    setShowAddFieldForm(false);
    setMobileShowDetail(false);
  };

  const addField = (newField: Template): void => {
    setTemplate((prev) => {
      const result = appendFieldToTemplate(prev, newField);
      if (result.error) {
        toast.error(tSchema(`errors.${result.error}`));
        return prev;
      }
      return result.template;
    });
    setShowAddFieldForm(false);
    setSelectedFieldName(newField.name);
    setMobileShowDetail(true);
  };

  const handleSelectField = (fieldName: string) => {
    setSelectedFieldName(fieldName);
    setShowAddFieldForm(false);
    setMobileShowDetail(true);
  };

  const handleMobileBack = () => {
    setMobileShowDetail(false);
    setSelectedFieldName(null);
    setShowAddFieldForm(false);
  };

  const selectedField = template.find((t) => t.name === selectedFieldName);

  const rightPanelContent = showAddFieldForm ? (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 py-3">
        <p className="text-foreground text-sm font-semibold">
          {tCommon("actions.add")} {tCommon("labels.fields")}
        </p>
        <p className="text-muted-foreground text-xs">
          Configure the new field properties
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <CreateSchemaAddField onAdd={addField} onCancel={cancelAddField} />
      </div>
    </div>
  ) : selectedField ? (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center justify-between border-b px-3 py-2 md:px-4 md:py-3">
        <div className="min-w-0">
          <p className="text-foreground text-xs font-semibold md:text-sm">
            {tCommon("labels.fields")} {tCommon("settings")}
          </p>
          <p className="text-muted-foreground truncate font-mono text-[10px] md:text-xs">
            {selectedField.name}
          </p>
        </div>
        <div className="ml-2 flex items-center gap-3 md:gap-4">
          <Label className="mb-0 flex h-8 cursor-pointer items-center gap-1.5">
            <span className="text-muted-foreground text-[11px] font-medium md:text-xs">
              {tCommon("labels.required")}
            </span>
            <Switch
              size="sm"
              onCheckedChange={() =>
                onChangeHandler({
                  ...selectedField,
                  isRequired: !selectedField.isRequired,
                })
              }
              checked={!!selectedField.isRequired}
            />
          </Label>
          <div className="flex items-center gap-1 md:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-muted flex h-8 items-center gap-1.5 px-2 text-xs md:px-3"
              onClick={() =>
                onChangeHandler({
                  ...selectedField,
                  isIgnored: !selectedField.isIgnored,
                })
              }
              title={selectedField.isIgnored ? "Show" : "Hide"}
            >
              {selectedField.isIgnored ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
              <span className="hidden md:inline">
                {selectedField.isIgnored ? "Show" : "Hide"}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 flex h-8 items-center gap-1.5 px-2 text-xs md:px-3"
              onClick={() => deleteField(selectedField.name)}
            >
              <Trash2 className="size-3.5" />
              <span className="hidden md:inline">
                {tCommon("actions.delete")}
              </span>
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <FieldItem
          item={selectedField}
          onChange={onChangeHandler}
          onDelete={() => deleteField(selectedField.name)}
          panelMode
        />
      </div>
    </div>
  ) : (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="bg-muted rounded-full p-4">
        <svg
          className="size-8 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium">No field selected</p>
        <p className="text-xs opacity-70">
          Select a field from the list to edit its settings
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* LEFT SIDEBAR — field list */}
      <div
        className={cn(
          "border-border flex h-full flex-col border-r",
          "w-full md:w-72 md:shrink-0",
          mobileShowDetail ? "hidden md:flex" : "flex",
        )}
      >
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-foreground text-xs font-semibold tracking-widest uppercase">
              {tCommon("labels.fields")}
            </p>
          </div>
          <span className="text-muted-foreground text-xs">
            {template.length} field{template.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {template.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <p className="text-sm">No fields yet</p>
              <p className="text-xs opacity-70">Add your first field below</p>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={template}
              onReorder={setTemplate}
              className="py-1"
            >
              {template.map((item) => {
                const isActive =
                  selectedFieldName === item.name && !showAddFieldForm;
                return (
                  <SortableFieldItem
                    key={item.name}
                    item={item}
                    isActive={isActive}
                    onSelect={() => handleSelectField(item.name)}
                  />
                );
              })}
            </Reorder.Group>
          )}
        </div>

        <div className="border-border shrink-0 border-t p-3">
          <Button
            type="button"
            variant="outline"
            onClick={openAddFieldForm}
            className="text-muted-foreground hover:bg-muted/30 hover:text-foreground flex w-full items-center justify-center gap-2 border-dashed text-sm"
          >
            <Plus className="size-4" />
            {tCommon("actions.add")} {tCommon("labels.fields")}
          </Button>
        </div>
      </div>

      {/* RIGHT PANEL — field detail */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden",
          mobileShowDetail ? "flex flex-col" : "hidden md:flex md:flex-col",
        )}
      >
        <div className="border-border shrink-0 border-b px-3 py-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMobileBack}
            className="text-muted-foreground gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" />
            Back to fields
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rightPanelContent}
        </div>
      </div>
    </div>
  );
}
