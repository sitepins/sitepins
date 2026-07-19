import { Model } from "mongoose";

export enum EProvider {
  Google = "Google",
  GitHub = "GitHub",
  Credentials = "Credentials",
}

export type UserType = {
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

export type UserFilterOptions = {
  search?: string | number;
  country?: string;
};

export type LoginResponse<T> = Partial<T> & {
  accessToken: string;
};

export type UserMethods = {
  isUserExist: (params: string) => Promise<Partial<UserType> | null>;
};

export type UserModel = Model<UserType, object, UserMethods>;
