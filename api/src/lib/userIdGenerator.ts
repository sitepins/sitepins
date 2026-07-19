export const generateUserId = (email: string) => {
  const userId =
    "@user_" +
    email
      .replace(/ /g, "_")
      .replace(/[@.!#$%&'*+-/=?^_`{|}~]/g, "_")
      .toLowerCase();

  return userId;
};
