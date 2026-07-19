import { format } from "date-fns";

const dateFormat = (
  date: Date | string,
  pattern: string = "dd MMM, yyyy",
): string => {
  if (!date) return "";
  const dateObj = new Date(date);
  const output = format(dateObj, pattern);
  return output;
};

export class ISODate extends Date {
  toString() {
    return this.toISOString();
  }

  valueOf() {
    return super.valueOf(); // Keeps numeric operations working
  }

  // Optional: Override other string conversion methods for consistency
  toJSON() {
    return this.toISOString();
  }

  [Symbol.toPrimitive](hint: "default"): string;
  [Symbol.toPrimitive](hint: "string"): string;
  [Symbol.toPrimitive](hint: "number"): number;
  [Symbol.toPrimitive](hint: string): string | number;
  [Symbol.toPrimitive](hint: string) {
    if (hint === "string" || hint === "default") {
      return this.toISOString();
    }
    if (hint === "number") {
      return super.valueOf();
    }
    return this.toISOString();
  }
}

export default dateFormat;
