import { describe, expect, it } from "vitest";
import { isExplanationQuery } from "./ai-intent";

describe("isExplanationQuery", () => {
  it("classifies direct explanation questions correctly", () => {
    expect(isExplanationQuery("what it does")).toBe(true);
    expect(isExplanationQuery("what does this do")).toBe(true);
    expect(isExplanationQuery("what does this hook do?")).toBe(true);
    expect(isExplanationQuery("what is useTheme")).toBe(true);
    expect(isExplanationQuery("how does this work?")).toBe(true);
    expect(isExplanationQuery("why is useEffect needed here?")).toBe(true);
    expect(isExplanationQuery("tell me what this does")).toBe(true);
    expect(isExplanationQuery("help me understand this")).toBe(true);
    expect(isExplanationQuery("walk me through the component lifecycle")).toBe(
      true,
    );
  });

  it("classifies explanation verbs as explanation queries", () => {
    expect(isExplanationQuery("explain code")).toBe(true);
    expect(isExplanationQuery("can you explain this hook?")).toBe(true);
    expect(isExplanationQuery("please describe how this functions")).toBe(true);
    expect(isExplanationQuery("summarize this file")).toBe(true);
    expect(isExplanationQuery("break down the state management")).toBe(true);
    expect(isExplanationQuery("audit this for security")).toBe(true);
  });

  it("classifies general questions without edit action verbs as explanation queries", () => {
    expect(isExplanationQuery("is this thread safe?")).toBe(true);
    expect(isExplanationQuery("are there any memory leaks in this code?")).toBe(
      true,
    );
    expect(isExplanationQuery("does this support SSR?")).toBe(true);
    expect(isExplanationQuery("can this throw an error?")).toBe(true);
  });

  it("classifies code modification and refactoring instructions as code edits", () => {
    expect(isExplanationQuery("refactor code")).toBe(false);
    expect(isExplanationQuery("find and fix bugs")).toBe(false);
    expect(isExplanationQuery("add comments")).toBe(false);
    expect(isExplanationQuery("convert to typescript")).toBe(false);
    expect(isExplanationQuery("make it responsive")).toBe(false);
    expect(isExplanationQuery("fix this error")).toBe(false);
    expect(isExplanationQuery("remove unused imports")).toBe(false);
    expect(isExplanationQuery("rewrite using arrow functions")).toBe(false);
    expect(isExplanationQuery("can you add comments to this code?")).toBe(
      false,
    );
    expect(isExplanationQuery("could you fix the syntax error?")).toBe(false);
    expect(isExplanationQuery("change theme to boolean")).toBe(false);
    expect(isExplanationQuery("implement dark mode toggle")).toBe(false);
  });

  it("classifies combined explain and fix as code edit", () => {
    expect(isExplanationQuery("explain and fix the bug")).toBe(false);
    expect(isExplanationQuery("review and refactor this")).toBe(false);
  });
});
