import { checkMedia } from "@/lib/utils/check-media-file";

interface FieldSchema {
  label: string;
  name: string;
  type: string;
  description?: string;
  fields?: FieldSchema[];
  defaultValue?: string;
  alwaysUseCurrentDate?: boolean;
}

const mapToInitialValue = {
  Array: [] as any[],
  object: {} as Record<string, any>,
  string: "" as string,
  boolean: false as boolean,
  Date: "",
  media: "",
  gallery: [] as any[],
};

export const convertToFormData = (
  data: FieldSchema[],
  val?: string,
): Record<string, any> => {
  return data?.reduce((obj, currentObj) => {
    // Handle nested fields (objects and arrays)
    if (currentObj.fields && currentObj.fields?.length > 0) {
      if (currentObj.type === "object") {
        return {
          ...obj,
          [currentObj.name]: { ...convertToFormData(currentObj.fields) },
        };
      } else {
        return {
          ...obj,
          [currentObj.name]: [convertToFormData(currentObj.fields)],
        };
      }
    }

    // Handle title field with provided value
    if (currentObj.name === "title") {
      return {
        ...obj,
        [currentObj.name]: val,
      };
    }

    // Determine the default value based on field type and schema configuration
    let defaultValue;

    switch (currentObj.type) {
      case "Date":
      case "date":
        // Check if we should always use current date
        if (currentObj.alwaysUseCurrentDate === true) {
          defaultValue = new Date().toISOString().split("T")[0];
        } else if (currentObj.defaultValue && currentObj.defaultValue !== "") {
          // Use the fixed default date from schema
          defaultValue = currentObj.defaultValue;
        } else {
          // Leave empty if no default specified and not always current
          defaultValue = "";
        }
        break;

      case "boolean":
        if (
          currentObj.defaultValue !== undefined &&
          currentObj.defaultValue !== ""
        ) {
          defaultValue = currentObj.defaultValue === "true";
        } else {
          defaultValue = false;
        }
        break;

      case "Array":
        defaultValue = [];
        break;

      case "object":
        defaultValue = {};
        break;

      case "number":
        if (
          currentObj.defaultValue !== undefined &&
          currentObj.defaultValue !== ""
        ) {
          defaultValue = parseFloat(currentObj.defaultValue) || 0;
        } else {
          defaultValue = 0;
        }
        break;

      case "string":
        if (
          currentObj.defaultValue !== undefined &&
          currentObj.defaultValue !== ""
        ) {
          defaultValue = currentObj.defaultValue;
        } else {
          defaultValue = "";
        }
        break;

      case "media":
      case "gallery":
        if (
          currentObj.defaultValue !== undefined &&
          currentObj.defaultValue !== ""
        ) {
          defaultValue = currentObj.defaultValue;
        } else {
          defaultValue = "";
        }
        break;

      default:
        // Fallback to type-based defaults
        defaultValue = (mapToInitialValue as any)[currentObj.type] || "";
    }

    return {
      ...obj,
      [currentObj.name]: defaultValue,
    };
  }, {});
};

function typeofValue(value: any) {
  return typeof value === "object"
    ? Array.isArray(value)
      ? "Array"
      : "object"
    : typeof value;
}

function generateFieldSchema({
  label,
  value,
}: {
  label: string;
  value: any;
}): FieldSchema {
  const type = typeofValue(value);

  if (type === "Array" && value) {
    const val = value[0];
    const next = typeof val === "object";
    return {
      label,
      name: label,
      type,
      defaultValue: "",
      ...(next && { fields: convertSchema(val) }),
    };
  } else if (type === "object" && value) {
    const hasNext = Object.keys(value).length > 0;
    return {
      label,
      name: label,
      type: !value ? "string" : type,
      defaultValue: "",
      ...(hasNext && { fields: convertSchema(value) }),
    };
  } else {
    return {
      label,
      name: label,
      type: checkMedia(value) ? "media" : type,
      defaultValue: value || "",
    };
  }
}

//generating schema
function convertSchema(docs: Record<string, any>): FieldSchema[] {
  return Object.entries(docs).map(([key, value]) => {
    return generateFieldSchema({ label: key, value });
  });
}
