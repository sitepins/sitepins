const generateUserId = (email: string) => {
  return (
    "@user_" +
    email
      .replace(/ /g, "_")
      .replace(/[@.!#$%&'*+-/=?^_`{|}~]/g, "_")
      .toLowerCase()
  );
};

export default generateUserId;
