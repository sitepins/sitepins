import { Model } from "mongoose";

export enum EProvider {
  Google = "Google",
  GitHub = "GitHub",
  Credentials = "Credentials",
}

export type TUserType = {
  user_id: string;
  email: string;
  full_name: string;
  password: string;
  country: string;
  verified: boolean;
  role: "user";
  image?: string;
  provider: EProvider;
  subscribed?: boolean;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TUserFilterOptions = {
  search?: string | number;
  country?: string;
};

export type TLoginResponse<T> = Partial<T> & {
  accessToken: string;
};

export type TUserMethods = {
  isUserExist: (params: string) => Promise<Partial<TUserType> | null>;
};

export type TUserModel = Model<TUserType, object, TUserMethods>;
