/**
 * Deep equality comparison for objects
 */
export const deepEqual = (obj1: any, obj2: any): boolean => {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== typeof obj2) return false;

  if (obj1 instanceof Date && obj2 instanceof Date) {
    return obj1.getTime() === obj2.getTime();
  }

  if (typeof obj1 !== "object") return obj1 === obj2;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
};

/**
 * Fast, tolerant string comparison with normalization
 */
export const quickStringCompare = (str1: string, str2: string): boolean => {
  // quick checks
  if (str1 === str2) return true;
  if (!str1 && !str2) return true;
  if (!str1 || !str2) return false;

  // length-based early bailout - if very different lengths, definitely different
  const lengthDiff = Math.abs(str1.length - str2.length);
  if (lengthDiff > 20) return false;

  // for typing scenarios, check if one string starts with the other (common case)
  if (lengthDiff < 5) {
    if (str1.length > str2.length && str1.startsWith(str2)) return false;
    if (str2.length > str1.length && str2.startsWith(str1)) return false;
  }

  // quick character sampling - check a few positions to catch obvious differences
  const minLen = Math.min(str1.length, str2.length);
  if (minLen > 50) {
    const positions = [
      0,
      Math.floor(minLen / 4),
      Math.floor(minLen / 2),
      Math.floor((3 * minLen) / 4),
      minLen - 1,
    ];
    for (const pos of positions) {
      if (str1[pos] !== str2[pos]) {
        // only normalize if we suspect they might still be equal (whitespace differences)
        const normalize = (str: string) => {
          return str
            .trim()
            .normalize("NFC")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\s+$/gm, "");
        };
        return normalize(str1) === normalize(str2);
      }
    }
  }

  // if we get here, they're likely very similar, do a light normalization
  const lightNormalize = (str: string) => str.trim().replace(/\s+/g, " ");
  return lightNormalize(str1) === lightNormalize(str2);
};

/**
 * Strip ephemeral fields that differ between parses
 */
export const stripEphemeral = (obj: any): any => {
  if (obj == null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map((v) => stripEphemeral(v));
  const res: any = {};
  for (const k of Object.keys(obj)) {
    if (k === "id" || k === "key" || k === "__meta") continue;
    res[k] = stripEphemeral(obj[k]);
  }
  return res;
};

/**
 * Deep equality comparison for arrays, optionally ignoring specific fields
 */
export const deepEqualArray = <T extends Record<string, any>>(
  arr1: T[],
  arr2: T[],
  ignoreFields: string[] = [],
): boolean => {
  if (arr1.length !== arr2.length) return false;

  const stripFields = (obj: T): Partial<T> => {
    const result = { ...obj };
    ignoreFields.forEach((field) => delete result[field]);
    return result;
  };

  for (let i = 0; i < arr1.length; i++) {
    if (!deepEqual(stripFields(arr1[i]), stripFields(arr2[i]))) {
      return false;
    }
  }

  return true;
};
