"use client";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/utils/text-converter";
import { selectConfig } from "@/redux/features/config/slice";
import { TArrangement, TTree } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { z } from "zod/v4";

const fileFormSchema = z.object({
  file: z.string(),
  groupName: z
    .string()
    .min(2, { message: "name must be at least 2 characters." }),
});
const folderFormSchema = z.object({
  type: z.string(),
  targetPath: z.string(),
  groupName: z
    .string()
    .min(2, { message: "name must be at least 2 characters." }),
  include: z.string(),
  exclude: z.string(),
});
export const headingSchema = z.object({
  heading: z
    .string()
    .min(2, { message: "heading must be at least 2 characters." }),
});

export function FileForm(props: {
  trees: TTree[];
  handleArrangement: ({
    newArrangement,
  }: {
    newArrangement: TArrangement;
  }) => void;
  arrangements: TArrangement[];
  arrangement?: TArrangement;
  onClose?: () => void;
}) {
  const { arrangements, handleArrangement, trees, arrangement, onClose } =
    props;
  const config = useSelector(selectConfig);
  const tProjectSettingsArrangement = useTranslations(
    "project-settings.arrangement",
  );
  const tCommon = useTranslations("common");
  const fileForm = useForm<z.infer<typeof fileFormSchema>>({
    resolver: zodResolver(fileFormSchema),
    defaultValues: {
      file: arrangement?.targetPath ?? "",
      groupName: arrangement?.groupName ?? "",
    },
  });

  const contentRoot = config.content;
  const options = useMemo(
    () =>
      trees.reduce<{ value: string }[]>((acc, tree) => {
        if (tree.type === "blob" && tree.path?.startsWith(contentRoot))
          return [...acc, { value: tree.path! }];
        return acc;
      }, []),
    [trees, contentRoot],
  );

  const targetFile = fileForm.watch("file");
  const groupName = fileForm.watch("groupName");

  useEffect(() => {
    if (!groupName) return;
    const groupNameSlug = slugify(groupName);
    const hasDuplicate = arrangements.some(
      (a) => a.id !== arrangement?.id && slugify(a.groupName) === groupNameSlug,
    );

    if (hasDuplicate) {
      fileForm.setError("groupName", {
        message: tProjectSettingsArrangement("errors.name_exists"),
      });
    } else {
      fileForm.clearErrors("groupName");
    }
  }, [
    groupName,
    arrangements,
    arrangement,
    fileForm,
    tProjectSettingsArrangement,
  ]);

  return (
    <form
      className="space-y-4"
      onSubmit={fileForm.handleSubmit((data) => {
        const newArrangement: TArrangement = {
          type: "file",
          id: arrangement?.id || crypto.randomUUID(),
          targetPath: data.file,
          groupName: data.groupName,
        };
        handleArrangement({ newArrangement });
        onClose?.();
      })}
    >
      <FieldGroup>
        <Controller
          name="file"
          control={fileForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="input-select-file">
                {tProjectSettingsArrangement("file_form.select_file")}
              </FieldLabel>
              <Combobox
                value={field.value}
                // defaultValue={field.value}
                onValueChange={(value) => field.onChange(value)}
                items={options.map((option) => option.value)}
              >
                <ComboboxInput
                  placeholder={
                    field.value ||
                    tProjectSettingsArrangement("file_form.placeholder")
                  }
                />
                <ComboboxContent disablePortal>
                  <ComboboxEmpty>
                    {tProjectSettingsArrangement("file_form.no_items")}
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(item) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="groupName"
          control={fileForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="index-input">
                {tProjectSettingsArrangement("file_form.name_label")}
              </FieldLabel>
              <Input
                {...field}
                id="index-input"
                aria-invalid={fieldState.invalid}
                placeholder={tProjectSettingsArrangement(
                  "file_form.name_placeholder",
                )}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <div>
        <Button
          disabled={!fileForm.formState.isValid}
          size={"lg"}
          type="submit"
          className="w-full"
        >
          {!!arrangement ? tCommon("actions.update") : tCommon("actions.add")}
        </Button>
      </div>
    </form>
  );
}

export function FolderForm(props: {
  trees: TTree[];
  handleArrangement: ({
    newArrangement,
  }: {
    newArrangement: TArrangement;
  }) => void;
  arrangements: TArrangement[];
  arrangement?: TArrangement;
  onClose?: () => void;
}) {
  const { arrangement, arrangements, trees, handleArrangement, onClose } =
    props;
  const config = useSelector(selectConfig);
  const tProjectSettingsArrangement = useTranslations(
    "project-settings.arrangement",
  );
  const tCommon = useTranslations("common");
  const folderForm = useForm<z.infer<typeof folderFormSchema>>({
    resolver: zodResolver(folderFormSchema),
    defaultValues: {
      type: "folder",
      targetPath: arrangement?.targetPath || "",
      include: arrangement?.type === "folder" ? arrangement?.include || "" : "",
      exclude: arrangement?.type === "folder" ? arrangement?.exclude || "" : "",
      groupName: arrangement?.groupName || "",
    },
  });

  const targetFolder = folderForm.watch("targetPath");
  const groupName = folderForm.watch("groupName");

  const contentRoot = config.content;
  const options = useMemo(
    () =>
      trees.reduce<{ value: string }[]>((acc, tree) => {
        if (tree.type === "tree" && tree.path?.startsWith(contentRoot))
          return [...acc, { value: tree.path! }];
        return acc;
      }, []),
    [trees, contentRoot],
  );

  useEffect(() => {
    if (!groupName) return;
    const groupNameSlug = slugify(groupName);
    const hasDuplicate = arrangements.some(
      (a) => a.id !== arrangement?.id && slugify(a.groupName) === groupNameSlug,
    );

    if (hasDuplicate) {
      folderForm.setError("groupName", {
        message: tProjectSettingsArrangement("errors.name_exists"),
      });
    } else {
      folderForm.clearErrors("groupName");
    }
  }, [
    groupName,
    arrangements,
    arrangement,
    folderForm,
    tProjectSettingsArrangement,
  ]);

  return (
    <form
      className="space-y-4"
      onSubmit={folderForm.handleSubmit((data) => {
        const newArrangement: TArrangement = {
          id: arrangement?.id || crypto.randomUUID(),
          type: "folder",
          targetPath: data.targetPath,
          groupName: data.groupName,
          include: data.include,
          exclude: data.exclude,
        };
        handleArrangement({ newArrangement });
        onClose?.();
      })}
    >
      <FieldGroup>
        <Controller
          name="targetPath"
          control={folderForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="targetPath">
                {tProjectSettingsArrangement("folder_form.select_folder")}
              </FieldLabel>
              <Combobox
                value={field.value}
                // defaultValue={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                }}
                items={options.map((option) => option.value)}
              >
                <ComboboxInput
                  placeholder={
                    field.value ||
                    tProjectSettingsArrangement("folder_form.placeholder")
                  }
                />
                <ComboboxContent disablePortal>
                  <ComboboxEmpty>
                    {tProjectSettingsArrangement("folder_form.no_items")}
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(item) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          shouldUnregister
          name="groupName"
          control={folderForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="groupName">
                {tProjectSettingsArrangement("folder_form.group_name_label")}
              </FieldLabel>
              <Input
                {...field}
                id="groupName"
                aria-invalid={fieldState.invalid}
                placeholder={tProjectSettingsArrangement(
                  "folder_form.group_name_placeholder",
                )}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="include"
          control={folderForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="include">
                {tProjectSettingsArrangement("folder_form.include_label")}
              </FieldLabel>
              <Input
                {...field}
                id="include"
                aria-invalid={fieldState.invalid}
                placeholder={tProjectSettingsArrangement(
                  "folder_form.include_placeholder",
                )}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="exclude"
          control={folderForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="exclude">
                {tProjectSettingsArrangement("folder_form.exclude_label")}
              </FieldLabel>
              <Input
                {...field}
                id="exclude"
                aria-invalid={fieldState.invalid}
                placeholder={tProjectSettingsArrangement(
                  "folder_form.exclude_placeholder",
                )}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <div>
        <Button
          disabled={!folderForm.formState.isValid}
          size={"lg"}
          type="submit"
          className="w-full"
        >
          {!!arrangement ? tCommon("actions.update") : tCommon("actions.add")}
        </Button>
      </div>
    </form>
  );
}

export function HeadingForm(props: {
  trees: TTree[];
  handleArrangement: ({
    newArrangement,
  }: {
    newArrangement: TArrangement;
  }) => void;
  arrangements: TArrangement[];
  arrangement?: TArrangement;
  onClose?: () => void;
}) {
  const { handleArrangement, arrangements, arrangement, onClose } = props;
  const tProjectSettingsArrangement = useTranslations(
    "project-settings.arrangement",
  );
  const tCommon = useTranslations("common");
  const headingForm = useForm<z.infer<typeof headingSchema>>({
    resolver: zodResolver(headingSchema),
    defaultValues: { heading: arrangement?.groupName ?? "" },
  });

  const heading = headingForm.watch("heading");

  useEffect(() => {
    if (!heading) return;
    const headingSlug = slugify(heading);
    const hasDuplicate = arrangements.some(
      (a) => a.id !== arrangement?.id && slugify(a.groupName) === headingSlug,
    );

    if (hasDuplicate) {
      headingForm.setError("heading", {
        message: tProjectSettingsArrangement("errors.heading_exists"),
      });
    } else {
      headingForm.clearErrors("heading");
    }
  }, [
    heading,
    arrangements,
    arrangement,
    headingForm,
    tProjectSettingsArrangement,
  ]);

  return (
    <form
      onSubmit={headingForm.handleSubmit((data) => {
        const newArrangement: TArrangement = {
          id: arrangement?.id || crypto.randomUUID(),
          type: "heading",
          groupName: data.heading,
          targetPath: "",
        };
        handleArrangement({ newArrangement });
        onClose?.();
      })}
      className="space-y-4"
    >
      <FieldGroup>
        <Controller
          name="heading"
          control={headingForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="heading-input">
                {tProjectSettingsArrangement("heading_form.name_label")}
              </FieldLabel>
              <Input
                {...field}
                id="heading-input"
                aria-invalid={fieldState.invalid}
                placeholder={tProjectSettingsArrangement(
                  "heading_form.placeholder",
                )}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <div>
        <Button
          disabled={!headingForm.formState.isValid}
          size={"lg"}
          type="submit"
          className="w-full"
        >
          {!!arrangement ? tCommon("actions.update") : tCommon("actions.add")}
        </Button>
      </div>
    </form>
  );
}
