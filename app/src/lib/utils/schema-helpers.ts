export type Template = {
  label: string;
  name: string;
  type: string;
  value: string | boolean | number | unknown[];
  description?: string;
  isIgnored?: boolean;
  isRequired?: boolean;
  defaultValue?: string;
  alwaysUseCurrentDate?: boolean;
  fields?: Template[];
  subType?: string;
  isDropdown?: boolean;
  options?: string[];
  referenceType?: "static" | "folder" | "file";
  referencePath?: string;
  referenceInclude?: string;
  referenceExclude?: string;
  referenceField?: string;
};

/** What the schema editor persists: a Template with editor-only keys dropped. */
export type SavedField = {
  name: string;
  label: string;
  type: string;
  value: Template["value"];
  description?: string;
  isIgnored?: boolean;
  isRequired?: boolean;
  defaultValue?: string;
  alwaysUseCurrentDate?: boolean;
  fields?: SavedField[];
  subType?: string;
  isDropdown?: boolean;
  options?: string[];
  referenceType?: Template["referenceType"];
  referencePath?: string;
  referenceInclude?: string;
  referenceExclude?: string;
  referenceField?: string;
};

/** A schema JSON file as it sits in `.sitepins/schema`, per `createSchema`. */
export type SavedSchema = {
  file?: string;
  name: string;
  fileType: "json" | "md" | "mdx" | "toml" | "yaml";
  fmType: "toml" | "yaml" | "json";
  template: SavedField[];
};

export const createNewField = (type: string, name: string): Template => {
  return {
    name: name.trim(),
    label: name.trim(),
    type,
    value:
      type === "boolean"
        ? false
        : type === "Array"
          ? []
          : type === "Date"
            ? new Date().toISOString().split("T")[0]
            : "",
    description: "",
    isIgnored: false,
    isRequired: false,
    defaultValue:
      type === "boolean"
        ? "false"
        : type === "Date"
          ? new Date().toISOString().split("T")[0]
          : "",
    alwaysUseCurrentDate: type === "Date" ? false : undefined,
    subType: undefined,
    isDropdown: false,
    options: [],
    referenceType: "static",
  };
};

export const processTemplateForSave = (
  tpl?: Template[],
): SavedField[] | undefined => {
  return tpl?.map((item) => {
    let value: Template["value"] = item.value;

    if (item.type === "Date") {
      if (item.alwaysUseCurrentDate === true) {
        value = new Date().toISOString().split("T")[0];
      } else if (item.defaultValue && item.defaultValue !== "") {
        value = item.defaultValue;
      } else {
        value = "";
      }
    }

    if (item.type === "boolean") {
      if (item.defaultValue !== undefined && item.defaultValue !== "") {
        value = item.defaultValue === "true";
      } else {
        value = false;
      }
    }

    if (item.type === "Array") {
      value = [];
    }

    if (
      item.type === "string" &&
      item.defaultValue &&
      item.defaultValue !== ""
    ) {
      value = item.defaultValue;
    }

    if (
      item.type === "number" &&
      item.defaultValue &&
      item.defaultValue !== ""
    ) {
      value = parseFloat(item.defaultValue) || 0;
    }

    const out: SavedField = {
      name: item.name,
      label: item.label,
      type: item.type,
      value,
      description: item.description,
      isIgnored: item.isIgnored,
      isRequired: item.isRequired,
      defaultValue: item.defaultValue,
    };

    if (item.type === "Date") {
      out.alwaysUseCurrentDate = item.alwaysUseCurrentDate;
    }

    if (item.fields && Array.isArray(item.fields) && item.fields.length > 0) {
      out.fields = processTemplateForSave(item.fields);
    }

    if (item.subType) {
      out.subType = item.subType;
    }

    if (item.isDropdown) {
      out.isDropdown = item.isDropdown;
      if (item.referenceType) {
        out.referenceType = item.referenceType;
      }
      if (item.referencePath) {
        out.referencePath = item.referencePath;
      }
      if (item.referenceInclude) {
        out.referenceInclude = item.referenceInclude;
      }
      if (item.referenceExclude) {
        out.referenceExclude = item.referenceExclude;
      }
      if (item.referenceField) {
        out.referenceField = item.referenceField;
      }
    }

    if (
      item.options &&
      Array.isArray(item.options) &&
      item.options.length > 0
    ) {
      out.options = item.options;
    }

    return out;
  });
};

export const cleanTemplateData = (templateData: Template[]) => {
  const cleanItem = (item: Template): SavedField => {
    const base: SavedField = {
      name: item.name,
      label: item.label,
      type: item.type,
      value: item.value,
      description: item.description,
      isRequired: item.isRequired,
      defaultValue: item.defaultValue,
      isIgnored: item.isIgnored || false,
    };

    if (item.type === "Date") {
      base.alwaysUseCurrentDate = item.alwaysUseCurrentDate || false;
    }

    if (item.fields && Array.isArray(item.fields) && item.fields.length > 0) {
      base.fields = item.fields.map(cleanItem);
    }

    if (item.subType) {
      base.subType = item.subType;
    }

    if (item.isDropdown) {
      base.isDropdown = item.isDropdown;
      if (item.referenceType) {
        base.referenceType = item.referenceType;
      }
      if (item.referencePath) {
        base.referencePath = item.referencePath;
      }
      if (item.referenceInclude) {
        base.referenceInclude = item.referenceInclude;
      }
      if (item.referenceExclude) {
        base.referenceExclude = item.referenceExclude;
      }
      if (item.referenceField) {
        base.referenceField = item.referenceField;
      }
    }

    if (
      item.options &&
      Array.isArray(item.options) &&
      item.options.length > 0
    ) {
      base.options = item.options;
    }

    return base;
  };

  return templateData.map(cleanItem);
};
