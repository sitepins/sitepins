export type Template = {
  label: string;
  name: string;
  type: string;
  value: string | boolean | number | any[];
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

export const processTemplateForSave = (tpl?: Template[]): any[] | undefined => {
  return tpl?.map((item) => {
    let value: any = (item as any).value;

    if ((item as any).type === "Date") {
      if ((item as any).alwaysUseCurrentDate === true) {
        value = new Date().toISOString().split("T")[0];
      } else if (
        (item as any).defaultValue &&
        (item as any).defaultValue !== ""
      ) {
        value = (item as any).defaultValue;
      } else {
        value = "";
      }
    }

    if ((item as any).type === "boolean") {
      if (
        (item as any).defaultValue !== undefined &&
        (item as any).defaultValue !== ""
      ) {
        value = (item as any).defaultValue === "true";
      } else {
        value = false;
      }
    }

    if ((item as any).type === "Array") {
      value = [];
    }

    if (
      (item as any).type === "string" &&
      (item as any).defaultValue &&
      (item as any).defaultValue !== ""
    ) {
      value = (item as any).defaultValue;
    }

    if (
      (item as any).type === "number" &&
      (item as any).defaultValue &&
      (item as any).defaultValue !== ""
    ) {
      value = parseFloat((item as any).defaultValue) || 0;
    }

    const out: any = {
      name: (item as any).name,
      label: (item as any).label,
      type: (item as any).type,
      value,
      description: (item as any).description,
      isIgnored: (item as any).isIgnored,
      isRequired: (item as any).isRequired,
      defaultValue: (item as any).defaultValue,
    };

    if ((item as any).type === "Date") {
      out.alwaysUseCurrentDate = (item as any).alwaysUseCurrentDate;
    }

    if (
      (item as any).fields &&
      Array.isArray((item as any).fields) &&
      (item as any).fields.length > 0
    ) {
      out.fields = processTemplateForSave((item as any).fields as Template[]);
    }

    if ((item as any).subType) {
      out.subType = (item as any).subType;
    }

    if ((item as any).isDropdown) {
      out.isDropdown = (item as any).isDropdown;
      if ((item as any).referenceType) {
        out.referenceType = (item as any).referenceType;
      }
      if ((item as any).referencePath) {
        out.referencePath = (item as any).referencePath;
      }
      if ((item as any).referenceInclude) {
        out.referenceInclude = (item as any).referenceInclude;
      }
      if ((item as any).referenceExclude) {
        out.referenceExclude = (item as any).referenceExclude;
      }
      if ((item as any).referenceField) {
        out.referenceField = (item as any).referenceField;
      }
    }

    if (
      (item as any).options &&
      Array.isArray((item as any).options) &&
      (item as any).options.length > 0
    ) {
      out.options = (item as any).options;
    }

    return out;
  });
};

export const cleanTemplateData = (templateData: Template[]) => {
  const cleanItem = (item: Template): any => {
    const base: any = {
      name: (item as any).name,
      label: (item as any).label,
      type: (item as any).type,
      value: (item as any).value,
      description: (item as any).description,
      isRequired: (item as any).isRequired,
      defaultValue: (item as any).defaultValue,
      isIgnored: (item as any).isIgnored || false,
    };

    if ((item as any).type === "Date") {
      base.alwaysUseCurrentDate = (item as any).alwaysUseCurrentDate || false;
    }

    if (
      (item as any).fields &&
      Array.isArray((item as any).fields) &&
      (item as any).fields.length > 0
    ) {
      base.fields = (item as any).fields.map(cleanItem);
    }

    if ((item as any).subType) {
      base.subType = (item as any).subType;
    }

    if ((item as any).isDropdown) {
      base.isDropdown = (item as any).isDropdown;
      if ((item as any).referenceType) {
        base.referenceType = (item as any).referenceType;
      }
      if ((item as any).referencePath) {
        base.referencePath = (item as any).referencePath;
      }
      if ((item as any).referenceInclude) {
        base.referenceInclude = (item as any).referenceInclude;
      }
      if ((item as any).referenceExclude) {
        base.referenceExclude = (item as any).referenceExclude;
      }
      if ((item as any).referenceField) {
        base.referenceField = (item as any).referenceField;
      }
    }

    if (
      (item as any).options &&
      Array.isArray((item as any).options) &&
      (item as any).options.length > 0
    ) {
      base.options = (item as any).options;
    }

    return base;
  };

  return templateData.map(cleanItem);
};
