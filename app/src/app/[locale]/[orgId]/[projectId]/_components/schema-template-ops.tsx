import { Template } from "@/lib/utils/schema-helpers";

/**
 * Pure template mutations used by the schema editor. Kept out of the editor
 * component so the field/nesting rules can be tested without rendering it.
 */

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
          delete (updatedItem as { fields?: unknown; subType?: unknown })
            .fields;
        }
        if (updatedItem.type !== "Array") {
          delete (updatedItem as { fields?: unknown; subType?: unknown })
            .subType;
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
