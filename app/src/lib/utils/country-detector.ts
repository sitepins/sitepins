import timezones from "@/config/timezones.json";
import { getName } from "country-list";

const replaceName = [
  { name: "United States of America", replace: "United States" },
  {
    name: "United Kingdom of Great Britain and Northern Ireland",
    replace: "United Kingdom",
  },
  { name: "Congo, Democratic Republic of the", replace: "Congo" },
  { name: "Russian Federation", replace: "Russia" },
  { name: "Central African Republic", replace: "Africa" },
  { name: "Dominican Republic", replace: "Dominican" },
  { name: "Syrian Arab Republic", replace: "Syria" },
];

const countryDetector = () => {
  const timezoneToISO = (timeZone: string) => {
    const tz = timezones?.find((zone) => zone.timeZone === timeZone);
    return tz?.regionCode || "";
  };

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let country = getName(timezoneToISO(timeZone));

  if (country) {
    country = country.split(",")[0].trim();
  }

  const replace = replaceName.find((item) => item.name === country);
  if (replace) {
    return replace.replace;
  }

  return country;
};

export default countryDetector;
