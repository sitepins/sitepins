import brand from "@/config/brand";
import { getRegisteredAgentTools } from "@/lib/agentExtensions";
import { canWrite } from "./agent.tools";
import {
  AGENT_SCOPE_LABELS,
  EAgentScope,
  EAgentWriteMode,
  TAgentContext,
} from "./agent.type";

type TToolNeed = { scopes: EAgentScope[]; write?: boolean };

const READ: TToolNeed = { scopes: [EAgentScope.CONTENT_READ] };
const WRITE: TToolNeed = { scopes: [EAgentScope.CONTENT_READ], write: true };
const MEMBERS: TToolNeed = { scopes: [EAgentScope.MEMBERS_WRITE] };

/** Which scopes list each core tool; mcp.server.ts registers under the same rules (tested). */
export const CORE_TOOLS: Record<string, TToolNeed> = {
  list_projects: { scopes: [EAgentScope.PROJECTS_READ] },
  get_guide: { scopes: [] },
  get_project_context: READ,
  get_schema: READ,
  list_files: READ,
  read_files: READ,
  search_content: READ,
  list_entries: READ,
  list_history: READ,
  get_change: READ,
  get_deploy_status: READ,
  get_clone_command: READ,
  edit_file: WRITE,
  update_fields: WRITE,
  create_entry: WRITE,
  create_upload_url: WRITE,
  write_files: WRITE,
  move_file: WRITE,
  undo_change: WRITE,
  get_organization: { scopes: [EAgentScope.ORG_READ] },
  invite_member: MEMBERS,
  update_member_role: MEMBERS,
  remove_member: MEMBERS,
};

const missingScopes = (agent: TAgentContext, need: TToolNeed) => {
  const missing = need.scopes.filter((s) => !agent.scopes.has(s));
  if (need.write && !canWrite(agent)) missing.push(EAgentScope.CONTENT_WRITE);
  return missing;
};

/** Every tool this token is shown, core and extension. */
export const availableTools = (agent: TAgentContext) => {
  const names = new Set(
    Object.entries(CORE_TOOLS)
      .filter(([, need]) => !missingScopes(agent, need).length)
      .map(([name]) => name),
  );
  for (const tool of getRegisteredAgentTools()) {
    if (agent.scopes.has(tool.scope)) names.add(tool.name);
  }
  return names;
};

const scopesFor = (agent: TAgentContext, tool: string) => {
  const extension = getRegisteredAgentTools().find((t) => t.name === tool);
  if (extension) {
    return agent.scopes.has(extension.scope) ? [] : [extension.scope];
  }
  return CORE_TOOLS[tool] ? missingScopes(agent, CORE_TOOLS[tool]) : [];
};

const allToolNames = () => [
  ...Object.keys(CORE_TOOLS),
  ...getRegisteredAgentTools().map((t) => t.name),
];

/** Tool names a piece of guidance mentions, in order of appearance. */
export const mentionedTools = (text: string) =>
  allToolNames()
    .map((name) => ({ name, at: text.search(new RegExp(`\\b${name}\\b`)) }))
    .filter((m) => m.at !== -1)
    .sort((a, b) => a.at - b.at)
    .map((m) => m.name);

const usableBy = (tools: Set<string>) => (text: string) =>
  mentionedTools(text).every((t) => tools.has(t));

const settingsHint = (scopes: EAgentScope[]) =>
  `the user can turn on ${[...new Set(scopes)].map((s) => `"${AGENT_SCOPE_LABELS[s]}"`).join(" and ")} for it in ${brand.name} → Settings → MCP Connection`;

// Each entry lists alternatives; the first whose tools the token has is used.
const ROUTES: string[][] = [
  [
    "Visible text: search_content with the user's words → edit_file, old_string copied exactly from a match or from read_files.",
    "Find text: search_content with the user's words; whole files: read_files.",
  ],
  [
    "Frontmatter (title, date, draft, image) and site settings (name, menus, social links): read_files → update_fields. Never edit_file for these.",
  ],
  ["Colours and fonts: where_to_edit.styles → search_content → edit_file."],
  ["List or find posts and pages: list_entries."],
  ["New post or page: get_schema → create_entry."],
  [
    "Image: create_upload_url → run its curl → update_fields or edit_file with site_path.",
  ],
  [
    "Rename: move_file. Delete, or multi-file and code changes: read_files → write_files. Confirm deletes first.",
  ],
  [
    "Undo: undo_change (no commit_sha for your own last change; otherwise list_history first).",
  ],
  ['"What changed?": list_history → get_change.'],
  ['"Is it live?": get_deploy_status.'],
  ["Local clone: get_clone_command."],
  [
    "Team: get_organization, invite_member, update_member_role, remove_member.",
    "Team: get_organization.",
  ],
];

const RULES: string[][] = [
  [
    "Never use an id, path, sha, schema or field name that didn't come from a tool result in this session.",
  ],
  [
    '"Saved" isn\'t "live": only get_deploy_status state=live means live.',
    '"Saved" isn\'t "live"; don\'t say a change is live.',
  ],
  ["Never state prices, plans or limits from memory."],
  [
    "On a permission error, tell the user the exact setting it names; don't work around it with another tool.",
  ],
  ["Never git push or store tokens."],
  ["Unsure which tool fits: call get_guide."],
];

const WRITE_RULES: string[][] = [
  [
    "expected_sha is the sha from your latest read or write of that file; it changes after every write.",
  ],
  ["On a conflict, re-read, merge and retry once, then tell the user."],
];

const writeModeLine = (agent: TAgentContext) => {
  if (!canWrite(agent)) {
    return `This token is read-only: look things up and answer, but don't promise changes; for edits, ${settingsHint([EAgentScope.CONTENT_WRITE])}.`;
  }
  return agent.grant.write_mode === EAgentWriteMode.PULL_REQUEST
    ? "Write mode: pull_request. Every write opens a pull request; share pull_request.url. It goes live only after someone merges it."
    : "Write mode: direct. Every write is saved to the site at once; there is no separate save or push step.";
};

/** Sent once per session, so it only names tools this token is shown. */
export const buildInstructions = (agent: TAgentContext) => {
  const tools = availableTools(agent);
  const usable = usableBy(tools);
  const pick = (lines: string[][]) =>
    lines
      .map((alternatives) => alternatives.find(usable))
      .filter((line): line is string => Boolean(line))
      .map((line) => `- ${line}`);
  const extensionLines = [
    ...new Set(
      getRegisteredAgentTools()
        .filter((t) => t.guide && tools.has(t.name))
        .map((t) => t.guide!.trim())
        .filter(usable),
    ),
  ].map((line) => `- ${line}`);
  const start = [
    "Start: list_projects (ask which site if unclear), then get_project_context once per site; reuse its head_commit and where_to_edit.",
  ].filter(usable);
  return [
    `${brand.name} edits websites stored in Git. Users are usually not developers: map their plain words to these tools and reply in plain language, with no git jargon.`,
    ...start,
    writeModeLine(agent),
    "Routing (request → tools):",
    ...pick(ROUTES),
    ...extensionLines,
    "Rules:",
    ...pick(
      canWrite(agent)
        ? [...RULES.slice(0, 1), ...WRITE_RULES, ...RULES.slice(1)]
        : RULES,
    ),
  ].join("\n");
};

export enum EGuideTopic {
  EDITING_TEXT = "editing_text",
  FRONTMATTER_AND_SETTINGS = "frontmatter_and_settings",
  STYLES = "styles",
  NEW_ENTRY = "new_entry",
  IMAGES = "images",
  RENAME_DELETE = "rename_delete",
  UNDO_AND_HISTORY = "undo_and_history",
  DEPLOY_STATUS = "deploy_status",
  PULL_REQUEST_MODE = "pull_request_mode",
  LOCAL_CLONE = "local_clone",
  ERRORS = "errors",
  TEAM = "team",
  BILLING = "billing",
}

type TRecipe = {
  /** Without these tools the recipe is reported as unavailable. */
  requires: string[];
  /** Also required, unless the grant is already in pull_request write mode. */
  scope?: EAgentScope;
  steps: string[] | ((agent: TAgentContext) => string[]);
};

const RECIPES: Record<Exclude<EGuideTopic, EGuideTopic.BILLING>, TRecipe> = {
  [EGuideTopic.EDITING_TEXT]: {
    requires: ["search_content", "edit_file"],
    steps: [
      "search_content with the user's own words (path or glob narrows it). can_edit says whether this token may change the match.",
      "If the matched line isn't enough context, read_files the file.",
      "edit_file with old_string copied exactly from the match or the file (same spaces, quotes and line breaks) and new_string. Leave expected_sha out to use the current file.",
      "no_match: use the closest lines it returns, or read_files again; ambiguous: add surrounding text or set replace_all.",
      "Tell the user it's saved; get_deploy_status says when it's live.",
    ],
  },
  [EGuideTopic.FRONTMATTER_AND_SETTINGS]: {
    requires: ["read_files", "update_fields"],
    steps: [
      "Settings files are listed in get_project_context where_to_edit.settings.",
      "read_files the file to see its field names and current values.",
      'update_fields with set: [{field, value}] for text, value_json for numbers, true/false and lists; dots for nesting ("social.twitter"); unset removes a field.',
      "unknown_field: pick a name from valid_fields. Use allow_new_fields only when the user asks for a field the schema doesn't have.",
      "Never edit_file for frontmatter or settings values.",
    ],
  },
  [EGuideTopic.STYLES]: {
    requires: ["get_project_context", "search_content", "edit_file"],
    steps: [
      "get_project_context: where_to_edit.styles lists CSS, Tailwind and theme files.",
      "search_content for the colour, font or class name (path set to a styles folder).",
      "read_files the style file if you need context, then edit_file the exact value.",
      "Theme values in a JSON/YAML/TOML settings file: update_fields instead.",
    ],
  },
  [EGuideTopic.NEW_ENTRY]: {
    requires: ["get_schema", "create_entry"],
    steps: [
      "get_project_context lists the schemas and content folders.",
      "get_schema for the folder's schema to see its fields, types and options.",
      "list_entries on the folder to match existing posts and avoid a taken slug.",
      "create_entry with folder (or schema), title, fields and body; try dry_run first if the user wants a preview.",
      "invalid_fields or unknown_field: fix the named fields; exists: pick another slug.",
    ],
  },
  [EGuideTopic.IMAGES]: {
    requires: ["create_upload_url"],
    steps: [
      "create_upload_url with a destination under the media folder (get_project_context roots.media).",
      "Run its command once with the local file path; the server saves the file.",
      "Use site_path in content: update_fields for an image field, edit_file for an image inside text.",
    ],
  },
  [EGuideTopic.RENAME_DELETE]: {
    requires: ["move_file", "write_files"],
    steps: [
      "Rename or move: move_file with from and to (dry_run previews it). Links to the old path aren't updated; search_content for them.",
      "Delete: confirm with the user first, read_files for the sha, then write_files with deletes: [{path, expected_sha}].",
      "Several files or code in one change: read_files each, then one write_files call.",
    ],
  },
  [EGuideTopic.UNDO_AND_HISTORY]: {
    requires: ["list_history"],
    steps: [
      "list_history (optionally for one path) shows recent changes with their commit sha.",
      "get_change with a commit sha shows what that change did, file by file.",
      "undo_change without commit_sha undoes your own last change; for anything else pass the sha from list_history. dry_run previews it.",
      "Conflict on undo: those files changed again since; show the user and edit the current version instead.",
    ],
  },
  [EGuideTopic.DEPLOY_STATUS]: {
    requires: ["get_deploy_status"],
    steps: [
      "get_deploy_status with the commit from the write result (default: latest).",
      "state=live is the only proof a change is live; building: check again in a minute; failed: share the summary; unknown: the host doesn't report builds, so ask the user to check the site.",
    ],
  },
  [EGuideTopic.PULL_REQUEST_MODE]: {
    requires: ["edit_file"],
    scope: EAgentScope.GIT_BRANCH,
    steps: (agent) =>
      agent.grant.write_mode === EAgentWriteMode.PULL_REQUEST
        ? [
            "This token is in pull_request write mode: every write goes to a new branch and opens a pull request automatically.",
            "Share pull_request.url from the result; the change goes live only after someone merges it.",
            "get_deploy_status reports the site's main branch, so it won't show the pull request as live.",
          ]
        : [
            "Writes save to the site directly by default.",
            "To propose a change instead, pass open_pr: true (and optionally branch) to edit_file, update_fields, create_entry, write_files, move_file or undo_change.",
            "Share pull_request.url from the result; it goes live after merging.",
          ],
  },
  [EGuideTopic.LOCAL_CLONE]: {
    requires: ["get_clone_command"],
    steps: [
      "get_clone_command, then run its clone command exactly as given (needs a shell).",
      "For an existing clone pass local_head (git rev-parse HEAD) and follow next_step.",
      "Save edits with write_files and base_commit; git push is refused. Never store the token.",
    ],
  },
  [EGuideTopic.ERRORS]: {
    requires: [],
    steps: [
      "not_found: use a path from did_you_mean, or list_files / search_content; never guess.",
      "no_match: copy old_string from closest or from read_files; ambiguous: add surrounding text.",
      "conflict: someone changed the file. Re-read, merge, retry once with the new sha, then tell the user.",
      "permission: tell the user the exact setting named; don't work around it.",
      "invalid_input, invalid_fields, unknown_field: fix the named field and retry.",
      "exists: pick another name; rate_limited: wait retry_after_seconds; read_only or archived: tell the user.",
      "unavailable: the git host or server failed; try again shortly.",
    ],
  },
  [EGuideTopic.TEAM]: {
    requires: ["get_organization"],
    steps: [
      "get_organization lists members, roles and pending invites.",
      "invite_member by email with role editor or admin; confirm the address with the user first.",
      "update_member_role or remove_member with the user_id (or invite email) from get_organization.",
    ],
  },
};

const unavailable = (topic: EGuideTopic, scopes: EAgentScope[]) => ({
  topic,
  available: false,
  note: scopes.length
    ? `Not available with this token; ${settingsHint(scopes)}.`
    : "Not available on this server.",
});

export const getGuide = (agent: TAgentContext, topic: EGuideTopic) => {
  const tools = availableTools(agent);
  const usable = usableBy(tools);
  let steps: string[];
  if (topic === EGuideTopic.BILLING) {
    const guided = getRegisteredAgentTools().filter((t) => t.guide);
    if (!guided.length) return unavailable(topic, []);
    const missing = guided.flatMap((t) => scopesFor(agent, t.name));
    if (missing.length) return unavailable(topic, missing);
    steps = [...new Set(guided.map((t) => t.guide!.trim()))];
  } else {
    const recipe = RECIPES[topic];
    const missing = recipe.requires.flatMap((t) => scopesFor(agent, t));
    if (
      recipe.scope &&
      agent.grant.write_mode !== EAgentWriteMode.PULL_REQUEST &&
      !agent.scopes.has(recipe.scope)
    ) {
      missing.push(recipe.scope);
    }
    if (missing.length) return unavailable(topic, missing);
    steps =
      typeof recipe.steps === "function" ? recipe.steps(agent) : recipe.steps;
  }
  const kept = steps.filter(usable);
  return {
    topic,
    steps: kept,
    tools: [...new Set(kept.flatMap(mentionedTools))],
  };
};
