import { API_URL } from "@/lib/constant";

export function getServerBackendUrl() {
  return (
    process.env.INTERNAL_BACKEND_URL?.trim().replace(/\/+$/, "") || API_URL
  );
}
