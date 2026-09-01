import { describe, expect, it } from "vitest";
import { humanize, slugify, slugifyFilename, titleify } from "./text-converter";

describe("slugify", () => {
  it("should return empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("should convert simple text to lowercase slug with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("should collapse multiple consecutive spaces into a single hyphen", () => {
    expect(slugify("Hello   World")).toBe("hello-world");
    expect(slugify("Hello      World   Again")).toBe("hello-world-again");
  });

  it("should collapse special characters and spaces into a single hyphen", () => {
    expect(slugify("Hello @#$ World")).toBe("hello-world");
    expect(slugify("Hello & World")).toBe("hello-world");
    expect(slugify("Hello / World")).toBe("hello-world");
    expect(slugify("Special !@#$%^&*()_+ Characters")).toBe(
      "special-characters",
    );
    expect(slugify("Hello --- World")).toBe("hello-world");
    expect(slugify("Hello - - World")).toBe("hello-world");
  });

  it("should trim leading and trailing hyphens/spaces", () => {
    expect(slugify("   Hello World   ")).toBe("hello-world");
    expect(slugify("---Hello World---")).toBe("hello-world");
    expect(slugify(" - Hello World - ")).toBe("hello-world");
  });

  it("should handle international and accented characters", () => {
    expect(slugify("Café & Restaurant")).toBe("café-restaurant");
    expect(slugify("Bonjour le monde! Ça va?")).toBe("bonjour-le-monde-ça-va");
  });

  it("should collapse underscores into single hyphens", () => {
    expect(slugify("file_name_with_underscores")).toBe(
      "file-name-with-underscores",
    );
    expect(slugify("Hello _ World")).toBe("hello-world");
  });
});

describe("humanize and titleify", () => {
  it("should humanize strings", () => {
    expect(humanize("hello_world")).toBe("Hello world");
  });

  it("should titleify strings", () => {
    expect(titleify("hello-world-test")).toBe("Hello World Test");
  });
});

describe("slugifyFilename", () => {
  it("should preserve file extension", () => {
    expect(slugifyFilename("My Image File.png")).toBe("my-image-file.png");
  });
});
