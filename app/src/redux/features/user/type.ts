export type TRole = "admin" | "user";
export type TUser = {
  id: string;
  email: string;
  full_name: string;
  country: string;
  verified: boolean;
  role: TRole;
  image?: string;
  accessToken: string | null;
  active_package?: string;
};
