// Split full name into first and last name
export default function splitName(name: string) {
  const nameParts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return { first_name: "", last_name: "" };
  if (nameParts.length === 1)
    return { first_name: nameParts[0], last_name: "" };
  return {
    first_name: nameParts.slice(0, -1).join(" "),
    last_name: nameParts.slice(-1).join(" "),
  };
}
