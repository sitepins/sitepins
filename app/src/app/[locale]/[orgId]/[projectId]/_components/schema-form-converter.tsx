import { checkMedia } from "@/lib/utils/check-media-file";

type FieldSchema = {
  label: string;
  name: string;
  type: string;
  description?: string;
  fields?: FieldSchema[];
  defaultValue?: string;
  alwaysUseCurrentDate?: boolean;
};

/** Frontmatter values, which are whatever the file's YAML/TOML held. */
type FormValue = unknown;

const mapToInitialValue: Record<string, FormValue> = {
  Array: [],
  object: {},
  string: "",
  boolean: false,
  Date: "",
  media: "",
  gallery: [],
};

export const convertToFormData = (
  data: FieldSchema[],
  val?: string,
): Record<string, FormValue> => {
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
        defaultValue = mapToInitialValue[currentObj.type] ?? "";
    }

    return {
      ...obj,
      [currentObj.name]: defaultValue,
    };
  }, {});
};

function typeofValue(value: FormValue) {
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
  value: FormValue;
}): FieldSchema {
  const type = typeofValue(value);

  if (Array.isArray(value)) {
    const first = value[0];
    const isObjectItem = typeof first === "object" && first !== null;
    return {
      label,
      name: label,
      type,
      defaultValue: "",
      ...(isObjectItem && {
        fields: convertSchema(first as Record<string, FormValue>),
      }),
    };
  }

  if (type === "object" && value) {
    const nested = value as Record<string, FormValue>;
    return {
      label,
      name: label,
      type,
      defaultValue: "",
      ...(Object.keys(nested).length > 0 && { fields: convertSchema(nested) }),
    };
  }

  const text = typeof value === "string" ? value : "";
  return {
    label,
    name: label,
    type: checkMedia(text) ? "media" : type,
    defaultValue: text,
  };
}

//generating schema
function convertSchema(docs: Record<string, FormValue>): FieldSchema[] {
  return Object.entries(docs).map(([key, value]) => {
    return generateFieldSchema({ label: key, value });
  });
}
