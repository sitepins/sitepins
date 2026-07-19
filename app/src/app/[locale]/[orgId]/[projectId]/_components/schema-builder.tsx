"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils/cn";
import { Template } from "@/lib/utils/schema-helpers";
import { ArrowLeft, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Reorder } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  CreateSchemaAddField,
  FieldItem,
  SortableFieldItem,
  appendFieldToTemplate,
  removeFieldFromTemplate,
  updateFieldInTemplate,
} from "./create-schema-helper";

type SchemaBuilderProps = {
  value: Template[];
  onChange: (value: Template[]) => void;
};

export function SchemaBuilder({ value, onChange }: SchemaBuilderProps) {
  const tCommon = useTranslations("common");
  const tSchema = useTranslations("schema");
  const [showAddFieldForm, setShowAddFieldForm] = useState(false);
  const [selectedFieldName, setSelectedFieldName] = useState<string | null>(
    null,
  );
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const onChangeHandler = (fieldValue: Template) => {
    onChange(updateFieldInTemplate(value, fieldValue));
  };

  const deleteField = (fieldName: string): void => {
    onChange(removeFieldFromTemplate(value, fieldName));
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
    const result = appendFieldToTemplate(value, newField);
    if (result.error) {
      toast.error(tSchema(`errors.${result.error}`));
      return;
    }
    onChange(result.template);
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

  const selectedField = value.find((t) => t.name === selectedFieldName);

  const rightPanelContent = showAddFieldForm ? (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 py-3">
        <p className="text-foreground text-sm font-semibold">
          {tSchema("builder.add_new_field")}
        </p>
        <p className="text-muted-foreground text-xs">
          {tSchema("builder.configure_properties")}
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
            {tSchema("builder.field_settings")}
          </p>
          <p className="text-muted-foreground truncate font-mono text-[10px] md:text-xs">
            {selectedField.name}
          </p>
        </div>
        <div className="ml-2 flex items-center gap-3 md:gap-4">
          <Label className="mb-0 flex h-8 cursor-pointer items-center gap-1.5">
            <span className="text-muted-foreground text-[11px] font-medium md:text-xs">
              {tSchema("builder.required")}
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
              title={
                selectedField.isIgnored
                  ? tSchema("builder.show")
                  : tSchema("builder.hide")
              }
            >
              {selectedField.isIgnored ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
              <span className="hidden md:inline">
                {selectedField.isIgnored
                  ? tSchema("builder.show")
                  : tSchema("builder.hide")}
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
        <p className="text-sm font-medium">
          {tSchema("builder.no_field_selected")}
        </p>
        <p className="text-xs opacity-70">
          {tSchema("builder.select_to_edit")}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-1">
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
            {tSchema("builder.field_count", { count: value.length })}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {value.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <p className="text-sm">{tSchema("builder.no_fields")}</p>
              <p className="text-xs opacity-70">
                {tSchema("builder.add_first_field")}
              </p>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={value}
              onReorder={onChange}
              className="py-1"
            >
              {value.map((item) => {
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
            {tSchema("builder.back_to_fields")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rightPanelContent}
        </div>
      </div>
    </div>
  );
}
