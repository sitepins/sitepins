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
  verified: boolean;
  role: "user";
  image?: string;
  provider: EProvider;
  subscribed?: boolean;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TLoginResponse<T> = Partial<T> & {
  accessToken: string;
};

export type TUserModel = Model<TUserType>;
