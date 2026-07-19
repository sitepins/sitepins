export const getDateTimeRFC3339 = (currentTime: string, minutes: number) => {
  const currentDate = new Date(currentTime);
  const futureDate = new Date(currentDate.getTime() + minutes * 60000);
  return futureDate.toISOString();
};

export const isGreaterThanMinutes = (
  date1: Date,
  date2: Date,
  minutes: number
): boolean => {
  const diffInMs = Math.abs(
    new Date(date2).getTime() - new Date(date1).getTime()
  );
  const diffInMinutes = Math.floor(diffInMs / 1000 / 60);
  return diffInMinutes > minutes;
};

export function getExpiryDate(currentDate: any, timeStr: any) {
  const days = parseInt(timeStr, 10);
  const now = new Date(currentDate);
  now.setDate(now.getDate() + days);

  return now.toISOString();
}
