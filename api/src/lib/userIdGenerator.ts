import { User } from "@/modules/user/user.model";
import { nanoId } from "./nanoId";

export const USER_ID_LENGTH = 16;

const MAX_ATTEMPTS = 5;

// opaque and random — never derived from the email, so it survives email changes
export const createUserId = async (): Promise<string> => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = await nanoId(USER_ID_LENGTH);
    const taken = await User.exists({ user_id: candidate });
    if (!taken) return candidate;
  }
  throw new Error("Could not generate a unique user_id");
};
