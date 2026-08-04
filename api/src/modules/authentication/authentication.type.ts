export type TAuthenticationType = {
  user_id: string;
  token: string;
  expires: string;
  /** Failed OTP guesses against this token. */
  attempts?: number;
};
