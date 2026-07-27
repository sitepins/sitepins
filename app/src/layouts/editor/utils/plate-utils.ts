import { ISODate } from "@/lib/utils/date-format";
import { NodeKey } from "platejs";
import type { PlateEditor } from "platejs/react";
import React from "react";

export function isActiveNode(editor: PlateEditor, type: NodeKey): boolean {
  return !!editor.selection && editor.api.some({ match: { type } });
}

export function assignUniqueId(input: any): any {
  // Handle null or undefined
  if (input === null || input === undefined) {
    return input;
  }

  // Work on a deep-cloned copy so we never try to mutate frozen / non-extensible
  const source = deepClone(input);

  // Handle arrays
  if (Array.isArray(source)) {
    return source.map((item) => {
      if (typeof item === "object") {
        return {
          id: crypto.randomUUID(),
          value: assignUniqueId(item),
        };
      }
      return assignUniqueId(item);
    });
  }

  // Handle objects
  if (typeof source === "object") {
    return Object.keys(source).reduce(
      (acc, key) => {
        const value = (source as any)[key];

        if (value instanceof Date) {
          return {
            ...acc,
            [key]: {
              id: crypto.randomUUID(),
              value: new ISODate(value.toISOString()),
            },
          };
        }

        // If the value is an array, recursively process it
        if (Array.isArray(value)) {
          return {
            ...acc,
            [key]: assignUniqueId(value),
          };
        }

        if (typeof value === "object" && value !== null) {
          return {
            ...acc,
            [key]: {
              id: crypto.randomUUID(),
              value: assignUniqueId(value),
            },
          };
        }

        // For primitive values, wrap them in an object with an ID
        return {
          ...acc,
          [key]: {
            value,
            id: crypto.randomUUID(),
          },
        };
      },
      {} as Record<string, any>,
    );
  }

  // Handle primitive values
  return {
    value: source,
    id: crypto.randomUUID(),
  };
}

export function revertToOriginal(input: any): any {
  if (input === null || input === undefined) {
    return input;
  }

  if (input instanceof ISODate) {
    return new Date(input.getTime());
  }

  if (input instanceof Date) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => revertToOriginal(item));
  }

  if (typeof input === "object") {
    // Robust check for the wrapper structure: { id, value } where id is a UUID
    const keys = Object.keys(input);
    const isWrapped =
      keys.length === 2 &&
      "id" in input &&
      "value" in input &&
      typeof input.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.id,
      );

    if (isWrapped) {
      return revertToOriginal(input.value);
    }

    // Process as a regular object
    return Object.entries(input).reduce(
      (acc, [key, value]) => {
        acc[key] = revertToOriginal(value);
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  // Handle primitive values
  return input;
}

export function deepClone<T>(obj: T): T {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitive types
  if (typeof obj !== "object") {
    return obj;
  }

  // Handle ISODate objects BEFORE generic Date check (since ISODate extends Date)
  if (obj instanceof ISODate) {
    return new ISODate(obj.getTime()) as T;
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // Handle RegExp objects
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags) as T;
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }

  // Handle Objects
  if (typeof obj === "object") {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        (cloned as any)[key] = deepClone((obj as any)[key]);
      }
    }
    return cloned;
  }

  return obj;
}

export const unsupportedItemsInTable = new Set([
  "Code Block",
  "Unordered List",
  "Ordered List",
  "Quote",
  "Mermaid",
  "Heading 1",
  "Heading 2",
  "Heading 3",
  "Heading 4",
  "Heading 5",
  "Heading 6",
]);

//--don't modify---//
type PossibleRef<T> = React.Ref<T> | undefined;

const setRef = <T>(ref: PossibleRef<T>, value: T) => {
  if (typeof ref === "function") {
    return ref(value);
  }
  if (ref !== null && ref !== undefined) {
    (ref as React.RefObject<T>).current = value;
  }
};

const composeRefs =
  <T>(...refs: PossibleRef<T>[]) =>
  (node: T) => {
    const cleanups: ((() => void) | undefined)[] = [];
    refs.forEach((ref) => {
      const cleanup = setRef(ref, node);
      if (typeof cleanup === "function") {
        cleanups.push(cleanup);
      }
    });
    if (cleanups.length > 0) {
      return () => {
        for (const cleanup of cleanups) {
          cleanup?.();
        }
      };
    }
  };

export const useComposedRef = <T>(...refs: PossibleRef<T>[]) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useCallback(composeRefs(...refs), refs);
};
//--don't modify---//
