export const nanoId = async (number: number): Promise<string> => {
  const nano = await import("nanoid");
  return nano.nanoid(number);
};
