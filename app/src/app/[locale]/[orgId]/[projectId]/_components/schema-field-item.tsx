"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils/cn";
import isConfigFile from "@/lib/utils/is-config-file";
import { Template } from "@/lib/utils/schema-helpers";
import { Check, EyeOff, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  CreateSchemaNestedEditor,
  PathSelector,
  useAvailableFields,
  useProjectTrees,
} from "./create-schema-helper";

export type NestedEditorProps = {
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
            const updates: Partial<Template> = { type: value };
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
