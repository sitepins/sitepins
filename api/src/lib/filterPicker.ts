/* eslint-disable no-console */
const pick = <T extends Record<string, unknown>, k extends keyof T>(
  obj: T,
  keys: k[]
): Partial<T> => {
  const findObject: Partial<T> = {};
  for (const key of keys) {
    if (obj && Object.hasOwnProperty.call(obj, key)) {
      findObject[key] = obj[key];
    }
  }

  return findObject;
};

export default pick;
