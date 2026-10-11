import ApiError from "@/errors/ApiError";

const SPECIAL = /[.+^$()|[\]\\]/;

/** Minimal glob: `**` (any depth), `*` (within a segment), `?` and `{a,b}`. */
export const globToRegExp = (glob: string): RegExp => {
  let out = "";
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "{") {
      braces++;
      out += "(?:";
    } else if (c === "}" && braces > 0) {
      braces--;
      out += ")";
    } else if (c === "," && braces > 0) {
      out += "|";
    } else {
      out += SPECIAL.test(c) || c === "}" ? `\\${c}` : c;
    }
  }
  if (braces) throw new ApiError(`Unclosed { in glob ${glob}`, 400, "");
  return new RegExp(`^${out}$`);
};
