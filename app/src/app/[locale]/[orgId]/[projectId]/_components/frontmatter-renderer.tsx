import { logger } from "@/lib/logger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {} from "@/components/ui/combobox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import {} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deepClone } from "@/editor/utils/plate-utils";
import { cn } from "@/lib/utils/cn";
import { ISODate } from "@/lib/utils/date-format";
import {} from "@/lib/utils/provider-checker";
import { Template } from "@/lib/utils/schema-helpers";
import { plainify } from "@/lib/utils/text-converter";
import { TField, TState } from "@/types";
import { Description, PreviewLabel } from "./frontmatter-field-label";
import {
  ReferenceDropdown,
  ReferenceMultiSelect,
} from "./frontmatter-reference-field";
import { Copy, PenLine, Plus, Trash2, Undo2 } from "lucide-react";
import { AnimatePresence, Reorder, Variants, motion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  Dispatch,
  Fragment,
  KeyboardEvent,
  SetStateAction,
  useRef,
  useState,
} from "react";
import ListItem from "./list-item";
import MediaPreview from "./media-preview";

type Breadcrumb = {
  name: string;
  label: string;
  show?: boolean;
  index?: boolean;
  parent?: string;
};

const itemVariants: Variants = {
  exit: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto" },
  hidden: { opacity: 0, height: 0 },
};

const AnimatedListItem = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.li
    variants={itemVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
    layout="position"
    layoutScroll
    className={cn("space-y-2 overflow-hidden", className)}
    transition={{
      duration: 0.3,
      staggerChildren: 0.05,
    }}
  >
    {children}
  </motion.li>
);

function generateName({
  parent,
  name,
  breadcrumb,
  index,
}: {
  parent?: string;
  name: string;
  breadcrumb: Breadcrumb[];
  index?: number;
}) {
  if (breadcrumb.length > 1 && breadcrumb[1]?.name === parent) {
    const parentIndexValue = breadcrumb.slice(1);
    const result = parentIndexValue
      .map((crumb, i) => {
        if (crumb.index) {
          return `[${crumb.name}]`;
        }
        return i === 0 ? crumb.name : `[${crumb.name}]`;
      })
      .join("")
      .concat(`[${name}]`);

    // Add index if provided
    if (index !== undefined) {
      return result + `[${index}]`;
    }
    return result;
  }

  if (parent) {
    const result = `${parent}[${name}]`;
    // Add index if provided
    if (index !== undefined) {
      return result + `[${index}]`;
    }
    return result;
  }

  const result = `${name}`;
  // Add index if provided
  if (index !== undefined) {
    return result + `[${index}]`;
  }

  return result;
}

const createNewItem = (fields: TField[]) => {
  if (!fields) {
    return "";
  }

  return fields.reduce(
    (acc, field) => {
      switch (field.type) {
        case "string":
          acc[field.name] = { value: "", id: crypto.randomUUID() }; // Initialize as an object with a default `value`
          break;
        case "number":
          acc[field.name] = {
            value: 0, // Default to 0
            id: crypto.randomUUID(),
          };
          break;
        case "Date":
          acc[field.name] = {
            value: new ISODate(new Date()),
            id: crypto.randomUUID(),
          };
          break;
        case "media":
          acc[field.name] = {
            value: "",
            id: crypto.randomUUID(),
          }; // Default to empty string
          break;
        case "gallery":
          break;
        case "Array":
          acc[field.name] = field.fields ? [createNewItem(field.fields)] : [];
          break;
        case "object":
          // If the field is an object with nested fields, call createNewItem recursively
          acc[field.name] = field.fields ? createNewItem(field.fields) : {};
          break;
      }
      return acc;
    },
    {} as Record<string, unknown>,
  );
};

/**
 * A node inside the `{ id, value }`-wrapped frontmatter blob. The element type
 * bottoms out at `TState["data"]`'s index signature, so tightening this means
 * typing the form-state model rather than these traversal helpers.
 */
type FormNode = TState["data"][string];

export default function FrontmatterRenderer({
  schema,
  data,
  setData,
  showDuplicate,
  strictMode = false,
}: {
  schema: TField[];
  data: TState["data"];
  setData: Dispatch<SetStateAction<TState | undefined>>;
  showDuplicate?: boolean;
  strictMode?: boolean;
}) {
  const tCommon = useTranslations("common");
  const tEditor = useTranslations("editor");
  // Breadcrumb state stores names for internal navigation and labels for display
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([
    {
      name: "Root",
      label: tEditor("renderer.root"),
    },
  ]);
  // Ref-based counter to avoid module-level side-effects during render
  const duplicateIdCounterRef = useRef(0);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSourceKey, setDuplicateSourceKey] = useState<string | null>(
    null,
  );
  const [duplicateInput, setDuplicateInput] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  function handleUpdateData(name: string, newValue: unknown) {
    // Create a deep copy of the data to avoid modifying the original
    const result = deepClone(data);

    // Parse the path - handle both dot notation and array indices
    const segments = name.split(/[\.\[\]]+/).filter(Boolean);

    if (segments.length === 0) {
      logger.error("Invalid path: empty segments");
      return;
    }

    // Helper function to create default value based on field type
    const createDefaultValue = (fieldType: string) => {
      switch (fieldType) {
        case "string":
          return { value: "", id: crypto.randomUUID() };
        case "number":
          return { value: 0, id: crypto.randomUUID() };
        case "Date":
          return {
            value: new ISODate(new Date()),
            id: crypto.randomUUID(),
          };
        case "media":
          return { value: "", id: crypto.randomUUID() };
        case "boolean":
          return { value: false, id: crypto.randomUUID() };
        case "gallery":
          return [];
        case "Array":
          return [];
        case "object":
          return { value: {}, id: crypto.randomUUID() };
        default:
          return { value: "", id: crypto.randomUUID() };
      }
    };

    // Helper function to find field definition in schema recursively
    const findFieldInSchema = (
      fieldName: string,
      currentSchema: TField[],
    ): TField | null => {
      for (const field of currentSchema) {
        if (field.name === fieldName) {
          return field;
        }
        // Check in nested fields if it's an object or array with fields
        if (field.fields && Array.isArray(field.fields)) {
          const found = findFieldInSchema(fieldName, field.fields);
          if (found) return found;
        }
      }
      return null;
    };

    let current = result;
    let currentSchemaFields = schema;

    // Navigate through the path
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLastSegment = i === segments.length - 1;
      const isArrayIndex = !isNaN(Number(segment));

      if (isArrayIndex) {
        // Handle array index
        const index = Number(segment);

        if (!Array.isArray(current)) {
          logger.error(
            `Expected array but got ${typeof current} at segment ${segment}`,
          );
          return;
        }

        // Extend array if necessary
        while (current.length <= index) {
          current.push({
            id: crypto.randomUUID(),
            value: {},
          });
        }

        if (isLastSegment) {
          // Update the array item directly
          if (
            typeof newValue === "object" &&
            newValue !== null &&
            "value" in newValue
          ) {
            current[index] = newValue;
          } else {
            current[index] = {
              value: newValue,
              id: current[index]?.id || crypto.randomUUID(),
            };
          }
        } else {
          // Navigate into the array item's value
          current = current[index].value;
          // For arrays, we need to find the schema for the array items
          // This is a bit tricky - we need to look at the parent field's schema
        }
      } else {
        // Handle regular property
        const fieldSchema = findFieldInSchema(segment, currentSchemaFields);

        if (isLastSegment) {
          // Final property - update the value
          if (fieldSchema?.type === "Array" || Array.isArray(newValue)) {
            // Handle array updates - ensure proper structure
            if (Array.isArray(newValue)) {
              current[segment] = newValue.map((item) => {
                // If item already has the correct structure, keep it
                if (
                  typeof item === "object" &&
                  item !== null &&
                  "value" in item &&
                  "id" in item
                ) {
                  return item;
                }
                // If item has value but no id, add id
                if (
                  typeof item === "object" &&
                  item !== null &&
                  "value" in item
                ) {
                  return { ...item, id: item.id || crypto.randomUUID() };
                }
                // If item is primitive, wrap it
                return {
                  value: item,
                  id: crypto.randomUUID(),
                };
              });
            } else {
              // Single item being added to array
              if (!Array.isArray(current[segment])) {
                current[segment] = [];
              }
              current[segment].push({
                value: newValue,
                id: crypto.randomUUID(),
              });
            }
          } else {
            // Handle non-array fields
            if (!current[segment]) {
              current[segment] = createDefaultValue(
                fieldSchema?.type || "string",
              );
            }

            if (
              current[segment] &&
              typeof current[segment] === "object" &&
              "value" in current[segment]
            ) {
              current[segment].value = newValue;
            } else {
              current[segment] = {
                value: newValue,
                id: current[segment]?.id || crypto.randomUUID(),
              };
            }
          }
        } else {
          // Navigate deeper
          if (!current[segment]) {
            current[segment] = createDefaultValue(
              fieldSchema?.type || "object",
            );
          }

          // Move to the next level
          if (current[segment] && "value" in current[segment]) {
            current = current[segment].value;
          } else {
            current = current[segment];
          }

          // Update current schema fields for next iteration
          if (fieldSchema && fieldSchema.fields) {
            currentSchemaFields = fieldSchema.fields;
          }
        }
      }
    }

    // Update state with the modified data
    setData((prev) => (prev ? { ...prev, data: result } : prev));
  }

  // Helper function to access nested data based on breadcrumb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see FormNode
  const getNestedValue = (breadcrumb: Breadcrumb[], data: FormNode): any => {
    return breadcrumb.slice(1).reduce((acc, curr) => {
      if (!acc) return undefined;

      // If we have a parent reference and this is an indexed item
      if (curr.index) {
        if (Array.isArray(acc)) {
          const arrayItem = acc[parseInt(curr.name)];
          return arrayItem?.value?.[curr.name] ?? arrayItem?.value;
        }
        return acc?.[curr.name]?.value ?? acc?.[curr.name];
      }

      const nextValue = acc[curr.name];
      // Handle the value.id structure
      if (nextValue && typeof nextValue === "object" && "value" in nextValue) {
        return nextValue.value;
      }
      return nextValue;
    }, data);
  };

  // Helper function to find fields based on breadcrumb names
  const getCurrentField = (breadcrumb: Breadcrumb[], schema: TField[]) => {
    // If we're at root level with only one item after "Root", return the field directly from schema
    if (breadcrumb.length === 2) {
      return schema.find((f) => f.name === breadcrumb[1].name);
    }

    // For nested fields, traverse the breadcrumb path
    return breadcrumb
      .slice(1)
      .reduce<TField | undefined>((currentField, { name, index }) => {
        if (index) {
          return currentField;
        }
        const fields = currentField?.fields || schema;
        return fields.find((f) => f.name === name);
      }, undefined);
  };

  const handleKeyDown = (
    event:
      | React.KeyboardEvent<HTMLInputElement>
      | KeyboardEvent<SVGSVGElement>
      | KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault(); // Prevent form submission
    }
  };

  // Navigate to a specific breadcrumb level
  const handleBreadcrumbClick = (index: number) => {
    // Check if the next item in breadcrumb has a 'parent' reference
    // If so, clicking on this breadcrumb item means we want to go back to the array list view
    const nextCrumb = breadcrumb[index + 1];
    if (nextCrumb && nextCrumb.parent) {
      // Reset to root to show the array in list view
      setBreadcrumb([{ name: "Root", label: tEditor("renderer.root") }]);
      return;
    }

    // Update the breadcrumb by slicing to the selected index
    const updatedBreadcrumb = breadcrumb.slice(0, index + 1);
    // Get the data relevant to the selected breadcrumb level
    // Update both breadcrumb and current data states
    setBreadcrumb(updatedBreadcrumb);
  };

  // Navigate forward by adding the field name and label to the breadcrumb
  const handleNavigate = ({
    item,
    isNested,
    parent,
    index,
    label,
  }: {
    item: TField;
    isNested: boolean;
    parent?: TField;
    index?: number;
    label?: string;
  }) => {
    // Handle Array type differently by adding an index to the breadcrumb
    if (parent && (index ?? -1) > -1) {
      if (!isNested) {
        setBreadcrumb((_prevBreadcrumb) => [
          { name: "Root", label: tEditor("renderer.root") },
          { name: item.name, label: parent.label },
          {
            name: index?.toString() ?? "",
            label: label ?? index?.toString() ?? "",
            index: true,
            parent: parent.name,
          },
        ]);
      } else {
        setBreadcrumb((prevBreadcrumb) => [
          ...prevBreadcrumb,
          { name: item.name, label: item.label, show: false },
          { name: index?.toString() ?? "", label: label!, index: true },
        ]);
      }
    } else if (!isNested) {
      // Non-nested navigation (
      // resetting to root + selected item)

      setBreadcrumb((_prevBreadcrumb) => [
        { name: "Root", label: tEditor("renderer.root") },
        { name: item.name, label: label ?? item.label },
      ]);
    } else if (item.fields) {
      // Nested navigation into object fields
      setBreadcrumb((prevBreadcrumb) => [
        ...prevBreadcrumb,
        { name: item.name, label: item.label },
      ]);
    }
  };

  function addItemToArray(item: TField, path: string) {
    // Deep clone the root object
    const result =
      typeof structuredClone === "function"
        ? structuredClone(data)
        : deepClone(data);

    // Helper to unwrap {id, value} objects
    const unwrap = (obj: FormNode): FormNode => {
      if (
        obj &&
        typeof obj === "object" &&
        "id" in obj &&
        "value" in obj &&
        Object.keys(obj).length === 2
      ) {
        return obj.value;
      }
      return obj;
    };

    // Parse path into segments
    const segments = path
      .replace(/\[([^\]]+)\]/g, ".$1")
      .split(".")
      .filter(Boolean);

    // Create new array element
    const newElement = {
      id: crypto.randomUUID(),
      value: createNewItem(item.fields!),
    };

    // Navigate to target location
    let current = unwrap(result);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const isIndex = /^\d+$/.test(seg);
      const key = isIndex ? +seg : seg;

      current = unwrap(current);

      if (isLast) {
        if (!Array.isArray(current[key])) {
          current[key] = [];
        }
        current[key].push(newElement);
      } else {
        if (current[key] === undefined) {
          const nextIsIndex = /^\d+$/.test(segments[i + 1]);
          current[key] = nextIsIndex ? [] : {};
        }
        current = current[key];
      }
    }

    setData((prev) => {
      if (!prev) return;
      return { ...prev, data: result };
    });
  }

  function removeItemFromArray(name: string, index: number) {
    // Create a deep copy of the data to avoid modifying the original
    const result = deepClone(data);

    // Handle array notation in the path and normalize
    const normalizedPath = name.replace(/\[(\w+)\]/g, ".$1");
    const segments = normalizedPath.split(".");

    let current = result;

    // Helper function to unwrap {id, value} objects
    const unwrap = (obj: FormNode): FormNode => {
      if (obj && typeof obj === "object" && "id" in obj && "value" in obj) {
        return obj.value;
      }
      return obj;
    };

    // Navigate through the nested structure
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentIndex = !isNaN(Number(segment)) ? Number(segment) : segment;

      // Unwrap the current level if it has id/value structure
      current = unwrap(current);

      if (i === segments.length - 1) {
        if (Array.isArray(current[segmentIndex])) {
          // Remove the item at the specified index
          current[segmentIndex].splice(index, 1);

          // If the array is empty after removal, set it to an empty array
          if (current[segmentIndex].length === 0) {
            current[segmentIndex] = [];
          }
        }
      } else {
        current = current[segmentIndex];
      }
    }

    // Update the state with the modified data
    setData((prev) => {
      if (!prev) return;
      return { ...prev, data: result };
    });
  }

  function regenerateIds(obj: FormNode) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) regenerateIds(item);
      return;
    }
    if ("id" in obj) {
      try {
        obj.id = crypto.randomUUID();
      } catch {
        duplicateIdCounterRef.current += 1;
        obj.id = `dup-${duplicateIdCounterRef.current}`;
      }
    }
    for (const k of Object.keys(obj)) {
      regenerateIds(obj[k]);
    }
  }

  function duplicateRootObject(rootKey: string, providedName?: string) {
    const result =
      typeof structuredClone === "function"
        ? structuredClone(data)
        : deepClone(data);

    if (!result || !(rootKey in result)) return;

    // Suggest a default new key
    let suggested = `${rootKey}_copy`;
    let counter = 1;
    while (suggested in result) {
      suggested = `${rootKey}_copy${counter}`;
      counter += 1;
    }

    // Use provided name if passed (from dialog), otherwise prompt for legacy fallback
    const newKey = (
      providedName ??
      (typeof window !== "undefined"
        ? window.prompt(tEditor("renderer.duplicate_key_name"), suggested)
        : suggested) ??
      ""
    ).trim();
    if (!newKey) return;
    if (newKey in result) {
      // avoid overwriting
      // find a fallback
      let fb = `${newKey}_1`;
      let i = 1;
      while (fb in result) {
        i += 1;
        fb = `${newKey}_${i}`;
      }
      // use fb
      suggested = fb;
    }

    // Deep clone the object and regenerate ids for nested content
    const clone =
      typeof structuredClone === "function"
        ? structuredClone(result[rootKey])
        : deepClone(result[rootKey]);
    regenerateIds(clone);

    // Assign under the chosen key
    const chosenKey = newKey in result ? suggested : newKey;
    result[chosenKey] = clone;

    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, data: result };
    });

    // Navigate into the newly created root key so inner fields display immediately
    setBreadcrumb([
      { name: "Root", label: tEditor("renderer.root") },
      { name: chosenKey, label: chosenKey },
    ]);
    // Close dialog if open
    setDuplicateDialogOpen(false);
  }

  // Render fields recursively based on the schema
  function renderItem({
    schema = [],
    isNested = false,
    parent,
    currentData,
  }: {
    schema: TField[];
    isNested?: boolean;
    parent?: TField;
    currentData: TState["data"];
  }) {
    // If we're rendering root level, also include any keys present in `data` that
    // are not described in `schema` (dynamic TOML table keys). We infer a simple
    // field shape so they can be duplicated and navigated into immediately.
    const inferFieldsFromObject = (obj: FormNode): TField[] => {
      if (!obj || typeof obj !== "object") return [];

      // If this object is a wrapper like { id: string, value: { ... } },
      // unwrap it and infer fields from the inner `value` object so the UI
      // renders the real nested fields rather than `id` and `value`.
      if (
        obj &&
        typeof obj === "object" &&
        Object.prototype.hasOwnProperty.call(obj, "id") &&
        Object.prototype.hasOwnProperty.call(obj, "value") &&
        obj.value &&
        typeof obj.value === "object"
      ) {
        obj = obj.value;
      }

      // If this object appears to be a map of { value, id } entries (the
      // internal stored shape where each child is { value, id }), expose
      // those inner keys as primitive fields so the UI can render inputs
      // directly for them.
      const looksLikeValueMap = Object.values(obj).every(
        (v) => v && typeof v === "object" && "value" in v,
      );

      if (looksLikeValueMap) {
        return Object.keys(obj).map((childKey) => {
          const childVal = obj[childKey];
          const inner = childVal?.value;
          let type: TField["type"] = "string";
          if (typeof inner === "number") type = "number";
          else if (typeof inner === "boolean") type = "boolean";
          else if (Array.isArray(inner)) type = "Array";
          else if (inner && typeof inner === "object") type = "object";

          return {
            name: childKey,
            label: childKey,
            type,
          } as TField;
        });
      }

      // Fallback: infer at top level based on raw value types
      return Object.keys(obj).map((k) => {
        const val = obj[k];
        let type: TField["type"] = "string";
        if (typeof val === "number") type = "number";
        else if (typeof val === "boolean") type = "boolean";
        else if (Array.isArray(val)) type = "Array";
        else if (val && typeof val === "object") type = "object";
        return {
          name: k,
          label: k,
          type,
        } as TField;
      });
    };

    const virtualItems: TField[] = [];
    if (!isNested && !strictMode) {
      const rootData = data ?? {};
      Object.keys(rootData).forEach((key) => {
        if (!schema.some((s) => s.name === key)) {
          virtualItems.push({
            name: key,
            label: key,
            type: "object",
            fields: inferFieldsFromObject(rootData[key]),
          } as TField);
        }
      });
    }

    const fieldsToRender = isNested ? schema : [...schema, ...virtualItems];

    return (
      <ul className="flex w-full flex-col space-y-4 pl-0">
        <AnimatePresence mode="popLayout" initial={false}>
          {fieldsToRender?.map((item) => {
            if (item.isIgnored) {
              return null;
            } else if (
              breadcrumb.length > 1 &&
              item.name === breadcrumb[1].name &&
              !isNested
            ) {
              const field = getCurrentField(breadcrumb, schema);
              const isArrayType =
                (field?.type === "Array" || field?.type === "gallery") &&
                !breadcrumb[breadcrumb.length - 1]?.index;
              const targetSchema =
                isArrayType && field ? [field] : (field?.fields ?? item.fields);
              const currentData = getNestedValue(
                isArrayType ? breadcrumb.slice(0, -1) : breadcrumb,
                data,
              );

              return (
                <motion.li
                  key={item.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-border relative overflow-hidden rounded-lg border ps-0"
                >
                  <div className="bg-light relative mb-4 flex items-center justify-between px-4 py-2">
                    <Breadcrumb>
                      <BreadcrumbList className="m-0 p-0">
                        {breadcrumb.map((crumb, index) => {
                          if (crumb.show === false || index === 0) {
                            return null;
                          }
                          return (
                            <Fragment key={index}>
                              <BreadcrumbItem className="m-0">
                                <BreadcrumbLink asChild>
                                  <Button
                                    onClick={() => handleBreadcrumbClick(index)}
                                    variant={"link"}
                                    type="button"
                                    className="line-clamp-1 max-w-sm overflow-hidden p-0 text-wrap whitespace-normal capitalize"
                                  >
                                    <span className="line-clamp-1 text-left text-wrap break-all whitespace-normal">
                                      {plainify(crumb.label)}
                                    </span>
                                  </Button>
                                </BreadcrumbLink>
                              </BreadcrumbItem>
                              {index < breadcrumb.length - 1 && (
                                <BreadcrumbSeparator />
                              )}
                            </Fragment>
                          );
                        })}
                      </BreadcrumbList>
                    </Breadcrumb>

                    <Button
                      variant={"outline"}
                      size={"icon"}
                      className="size-7! rounded-full"
                      onClick={() => {
                        const filterLength = breadcrumb.filter(
                          (crumb) => crumb.show !== false,
                        ).length;
                        handleBreadcrumbClick(filterLength - 2);
                      }}
                    >
                      <Undo2 className="size-4" />
                    </Button>
                  </div>

                  <div className="px-4 pt-2 pb-4">
                    {renderItem({
                      schema: targetSchema!,
                      isNested: true,
                      parent: item,
                      currentData: currentData,
                    })}
                  </div>
                </motion.li>
              );
            } else if (item.type === "boolean" && item.name === "draft") {
              return null;
            } else if (item.type === "Date") {
              const value = currentData?.[item.name]?.value;
              return (
                <div key={item.name}>
                  <PreviewLabel
                    {...item}
                    className="border-none bg-transparent p-0 text-sm"
                  >
                    {item.label}
                  </PreviewLabel>

                  <DateTimePicker
                    date={
                      value
                        ? value instanceof Date
                          ? value
                          : new Date(value)
                        : undefined
                    }
                    setDate={(date: Date | undefined) => {
                      handleUpdateData(
                        generateName({
                          name: item.name,
                          breadcrumb,
                          parent: parent?.name,
                        }),
                        date ? new ISODate(date) : "",
                      );
                    }}
                  />
                </div>
              );
            } else if (item.type === "color") {
              // Handle color fields from schema generator
              const value = currentData?.[item.name]?.value;
              return (
                <div key={item.name} className="space-y-2">
                  <PreviewLabel {...item} className="text-sm">
                    {item.label}:
                  </PreviewLabel>
                  <ColorPicker
                    color={value || "#000000"}
                    onChange={(newColor) => {
                      handleUpdateData(
                        generateName({
                          name: item.name,
                          breadcrumb,
                          parent: parent?.name,
                        }),
                        newColor,
                      );
                    }}
                  />
                </div>
              );
            } else if (item.type === "string") {
              const value = currentData?.[item.name]?.value;

              // Check if the actual value is a hex color
              const isHexColor =
                typeof value === "string" &&
                value.startsWith("#") &&
                /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);

              if (isHexColor) {
                return (
                  <div key={item.name} className="space-y-2">
                    <PreviewLabel {...item} className="text-sm">
                      {item.label}:
                    </PreviewLabel>
                    <ColorPicker
                      color={value || "#000000"}
                      onChange={(newColor) => {
                        handleUpdateData(
                          generateName({
                            name: item.name,
                            breadcrumb,
                            parent: parent?.name,
                          }),
                          newColor,
                        );
                      }}
                    />
                  </div>
                );
              }

              const isDropdown = item.isDropdown;

              if (isDropdown) {
                // Render as dropdown
                return (
                  <AnimatedListItem key={item.name}>
                    <PreviewLabel {...item} value={value}>
                      {item.label}
                    </PreviewLabel>
                    <ReferenceDropdown
                      item={item as Template}
                      value={value}
                      onChange={(selectedValue) => {
                        const name = generateName({
                          name: item.name,
                          breadcrumb,
                          parent: parent?.name,
                        });
                        handleUpdateData(name, selectedValue);
                      }}
                    />
                    <Description {...item} />
                  </AnimatedListItem>
                );
              }

              // Render as textarea
              return (
                <AnimatedListItem key={item.name}>
                  <PreviewLabel {...item} value={value}>
                    {item.label}
                  </PreviewLabel>
                  <Textarea
                    className="text-text-dark h-auto min-h-10"
                    rows={value?.length > 100 ? 3 : 1}
                    required={item.isRequired}
                    value={value || ""}
                    name={generateName({
                      name: item.name,
                      breadcrumb,
                      parent: parent?.name,
                    })}
                    onChange={(e) => {
                      handleUpdateData(e.target.name, e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                  />
                  <Description {...item} />
                </AnimatedListItem>
              );
            } else if (item.type === "number") {
              const value = currentData?.[item.name]?.value;

              return (
                <AnimatedListItem key={item.name}>
                  <PreviewLabel>{item.label}</PreviewLabel>
                  <Input
                    onKeyDown={handleKeyDown}
                    required={item.isRequired}
                    type="number"
                    value={value || ""}
                    name={generateName({
                      name: item.name,
                      breadcrumb,
                      parent: parent?.name,
                    })}
                    onChange={(e) => {
                      handleUpdateData(e.target.name, e.target.value);
                    }}
                    className="appearance-none"
                  />
                  <Description {...item} />
                </AnimatedListItem>
              );
            } else if (item.type === "boolean") {
              const checked = currentData?.[item.name]?.value;
              const fieldName = generateName({
                name: item.name,
                breadcrumb,
                parent: parent?.name,
              });
              return (
                <AnimatedListItem key={item.name}>
                  <PreviewLabel
                    {...item}
                    htmlFor={item.name}
                    className="border-border dark:bg-input/30 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border bg-transparent px-3 py-2"
                  >
                    {item.label}
                    <Switch
                      required={item.isRequired}
                      id={item.name}
                      checked={typeof checked === "boolean" ? checked : false}
                      className="m-0 shrink-0 cursor-pointer"
                      name={fieldName}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onCheckedChange={(value) => {
                        handleUpdateData(fieldName, value);
                      }}
                    />
                  </PreviewLabel>
                  <Description {...item} />
                </AnimatedListItem>
              );
            } else if (item.type === "media") {
              const media = currentData?.[item.name]?.value;
              return (
                <AnimatedListItem key={item.name}>
                  <PreviewLabel {...item}>{item.label}</PreviewLabel>
                  <MediaPreview
                    value={media}
                    name={generateName({
                      name: item.name,
                      breadcrumb,
                      parent: parent?.name,
                    })}
                    handleChange={(e) => {
                      const val = e.target.value;
                      const name = e.target.name;
                      handleUpdateData(name, val);
                    }}
                    handleDelete={() => {
                      const name = generateName({
                        breadcrumb,
                        parent: parent?.name,
                        name: item.name,
                      });
                      handleUpdateData(name, "");
                    }}
                  />
                </AnimatedListItem>
              );
            } else if (item.type === "gallery") {
              const values = (
                currentData?.value?.[item.name]
                  ? currentData.value[item.name]
                  : currentData?.[item.name]
              ) as {
                id: string;
                value: string;
              }[];

              return (
                <AnimatedListItem key={item.name}>
                  <div className="flex items-center">
                    <PreviewLabel
                      {...item}
                      className="mb-0 flex items-center justify-center"
                    >
                      {item.label}
                    </PreviewLabel>
                    <Button
                      variant={"outline"}
                      type="button"
                      size={"icon"}
                      onClick={(_e) => {
                        addItemToArray(
                          item,
                          generateName({
                            breadcrumb,
                            name: item.name,
                            parent: parent?.name,
                          }),
                        );
                      }}
                      className="ml-2 size-6"
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                  <div className="[&>ul]:space-y-4">
                    {values?.length > 0 ? (
                      <Reorder.Group
                        axis="y"
                        onReorder={(v) => {
                          const name = generateName({
                            breadcrumb,
                            name: item.name,
                            parent: parent?.name,
                          });
                          handleUpdateData(name, v);
                        }}
                        values={values || []}
                      >
                        {values?.map((image, i) => {
                          return (
                            <ListItem
                              value={image}
                              key={image.id}
                              listKey={image.id}
                              className="border-border max-w-100 rounded border p-2.5 last:border md:border-0 md:last:border-0"
                            >
                              <MediaPreview
                                value={image.value}
                                name={generateName({
                                  name: `${item.name}[${i}]`,
                                  breadcrumb,
                                  parent: parent?.name,
                                })}
                                handleChange={(e) => {
                                  const val = e.target.value;
                                  const name = e.target.name;
                                  handleUpdateData(name, val);
                                }}
                                handleDelete={() => {
                                  const name = generateName({
                                    name: item.name,
                                    parent: parent?.name,
                                    breadcrumb,
                                  });
                                  removeItemFromArray(name, i);
                                }}
                              />
                            </ListItem>
                          );
                        })}
                      </Reorder.Group>
                    ) : (
                      <div className="bg-light text-text-dark">
                        <p className="rounded-lg py-3 text-center font-semibold">
                          {tEditor("renderer.no_items")}
                        </p>
                      </div>
                    )}
                  </div>
                </AnimatedListItem>
              );
            } else if (item.type === "Array") {
              const values = currentData?.[item.name] ?? [];
              const isDropdown = item.isDropdown;
              const subType = item.subType;

              if (isDropdown && subType === "string") {
                return (
                  <AnimatedListItem key={item.name}>
                    <PreviewLabel {...item}>{item.label}</PreviewLabel>
                    <ReferenceMultiSelect
                      item={item as Template}
                      value={values}
                      onChange={(newValues) => {
                        const name = generateName({
                          name: item.name,
                          breadcrumb,
                          parent: parent?.name,
                        });
                        handleUpdateData(name, newValues);
                      }}
                    />
                    <Description {...item} />
                  </AnimatedListItem>
                );
              }

              return (
                <div key={item.name}>
                  <AnimatedListItem key={item.name}>
                    <div className="flex items-center">
                      <PreviewLabel
                        {...item}
                        className="mb-0 flex items-center justify-center"
                      >
                        {item.label}
                      </PreviewLabel>
                      <Button
                        variant={"outline"}
                        type="button"
                        size={"icon"}
                        onClick={(_e) => {
                          addItemToArray(
                            item,
                            generateName({
                              breadcrumb,
                              name: item.name,
                              parent: parent?.name,
                            }),
                          );
                        }}
                        className="ml-2 size-6 whitespace-normal"
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                    <div className="border-border space-y-4 rounded-lg border p-4">
                      {values?.length <= 0 ? (
                        <div className="bg-light text-text-dark">
                          <p className="rounded-lg py-3 text-center font-semibold">
                            {tEditor("renderer.no_items")}
                          </p>
                        </div>
                      ) : (
                        <Reorder.Group
                          axis="y"
                          onReorder={(v) => {
                            const name = generateName({
                              breadcrumb,
                              name: item.name,
                              parent: parent?.name,
                            });
                            handleUpdateData(name, v);
                          }}
                          values={values || []}
                        >
                          {values?.map((v: FormNode, index: number) => {
                            const key = v.id;
                            const currentVal = v;
                            v = item.fields ? v.value : v;
                            const label = item.fields
                              ? v?.title?.value ||
                                v?.name?.value ||
                                v?.label?.value ||
                                item.name + " Item " + (index + 1)
                              : tEditor("renderer.item_at", {
                                  name: item.name,
                                  index: index + 1,
                                });

                            return (
                              <ListItem
                                value={currentVal}
                                listKey={key}
                                key={key}
                              >
                                <div className="flex-1">
                                  {item.fields ? (
                                    <div
                                      className={buttonVariants({
                                        className:
                                          "border-border! bg-light relative flex w-full cursor-pointer justify-between border pr-0 pl-2.5 whitespace-normal *:z-20",
                                        size: "lg",
                                        variant: "outline",
                                      })}
                                      onClick={() => {
                                        handleNavigate({
                                          item,
                                          isNested,
                                          parent: item,
                                          index,
                                          label: label,
                                        });
                                      }}
                                    >
                                      <span className="line-clamp-1 flex-1 text-left text-wrap whitespace-normal capitalize">
                                        {label}
                                      </span>
                                      <PenLine className="mr-2 ml-auto size-4 flex-none" />

                                      <Button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const name = generateName({
                                            name: item.name,
                                            parent: parent?.name,
                                            breadcrumb,
                                          });
                                          removeItemFromArray(name, index);
                                        }}
                                        type="button"
                                        variant={"ghost"}
                                        size={"icon"}
                                        className="hover:text-destructive/75"
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="relative">
                                      <Button
                                        type="button"
                                        variant={"ghost"}
                                        className="hover:text-destructive/75 absolute top-1/2 right-1 h-[calc(100%-5px)] -translate-y-1/2 whitespace-normal"
                                        onClick={() => {
                                          const name = generateName({
                                            parent: parent?.name,
                                            breadcrumb,
                                            name: item.name,
                                          });
                                          removeItemFromArray(name, index);
                                        }}
                                      >
                                        <Trash2 className="absolute top-0 left-auto size-4 h-full w-full max-w-5" />
                                      </Button>

                                      <Input
                                        name={generateName({
                                          name: `${item.name}`,
                                          breadcrumb,
                                          parent: parent?.name,
                                          index: index,
                                        })}
                                        className="pr-10"
                                        value={values?.[index].value || ""}
                                        onChange={(e) => {
                                          handleUpdateData(
                                            e.target.name,
                                            e.target.value,
                                          );
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </ListItem>
                            );
                          })}
                        </Reorder.Group>
                      )}
                    </div>
                  </AnimatedListItem>
                </div>
              );
            } else {
              return (
                <AnimatedListItem key={item.name}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      handleNavigate({ item, isNested, parent: parent });
                    }}
                    className={buttonVariants({
                      variant: "outline",
                      size: "lg",
                      className:
                        "border-border! bg-light group flex w-full cursor-pointer border px-2.5!",
                    })}
                  >
                    <span className="mr-2 line-clamp-1 text-wrap break-all capitalize">
                      {item.label}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {showDuplicate && !isNested && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Prepare and open dialog
                            const rootKey = item.name;
                            // suggest a non-colliding default
                            const existing = data ?? {};
                            let suggested = `${rootKey}_copy`;
                            let counter = 1;
                            while (suggested in existing) {
                              suggested = `${rootKey}_copy${counter}`;
                              counter += 1;
                            }
                            setDuplicateSourceKey(rootKey);
                            setDuplicateInput(suggested);
                            setDuplicateError(null);
                            setDuplicateDialogOpen(true);
                          }}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "icon",
                            className:
                              "group-hover:text-foreground h-full rounded border-none bg-transparent py-1 text-inherit hover:bg-transparent",
                          })}
                        >
                          <Copy className="size-4" />
                        </button>
                      )}
                      <PenLine className="size-4 justify-end" />
                    </div>
                    {/* DotMenu removed */}
                  </div>
                </AnimatedListItem>
              );
            }
          })}
        </AnimatePresence>
      </ul>
    );
  }

  return (
    <div>
      {/* Breadcrumb Navigation */}
      <div>
        {renderItem({
          schema: schema,
          currentData: data,
        })}
      </div>
      {/* Duplicate Object Dialog */}
      <AlertDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon("actions.duplicate")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tEditor("renderer.duplicate_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-4">
            <Input
              value={duplicateInput}
              onChange={(e) => setDuplicateInput(e.target.value)}
              placeholder={tEditor("renderer.new_key_name")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!duplicateSourceKey) return;
                  const name = duplicateInput.trim();
                  if (!name) return;
                  duplicateRootObject(duplicateSourceKey, name);
                }
              }}
            />
            {duplicateError && (
              <p className="text-destructive mt-2 text-sm">
                {tEditor("renderer.name_not_empty")}
              </p>
            )}

            <AlertDialogFooter className="mt-4 flex justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button variant="outline">{tCommon("actions.cancel")}</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  onClick={() => {
                    if (!duplicateSourceKey) return;
                    const name = duplicateInput.trim();
                    if (!name) {
                      setDuplicateError("Name cannot be empty");
                      return;
                    }
                    duplicateRootObject(duplicateSourceKey, name);
                  }}
                >
                  {tCommon("actions.duplicate")}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
