/**
 * Patches Hugo configuration files (security.toml, hugo.toml, config.toml)
 * to ensure `tailwindcss` is whitelisted in `security.exec.allow` and the
 * Node permission sandbox is disabled (`security.node.disable = true`).
 *
 * This resolves Hugo v0.161+ / v0.165+ security policy violations where Hugo
 * attempts to invoke the Tailwind CLI or PostCSS during `css.TailwindCSS`
 * compilation and fails with:
 * "access denied: tailwindcss is not whitelisted in policy security.exec.allow"
 * or Node.js permission model write errors.
 */

export function patchHugoSecurityContent(
  content: string,
  filename: string,
): { content: string; changed: boolean } {
  let changed = false;
  let out = content;

  const isSecurityToml = /security\.toml$/i.test(filename);

  if (isSecurityToml) {
    // In security.toml, sections are top-level under security (e.g. [exec], [node])
    if (/\[exec\]/.test(out)) {
      if (!/tailwindcss/.test(out)) {
        if (/\[exec\][^\[]*allow\s*=\s*\[/.test(out)) {
          out = out.replace(
            /(\[exec\][^\[]*?allow\s*=\s*\[)([^\]]*)(\])/,
            (m, prefix, inner, suffix) => {
              const items = inner.trim();
              return `${prefix}${items ? items + ", " : ""}'^tailwindcss$'${suffix}`;
            },
          );
        } else {
          out = out.replace(
            /(\[exec\])/,
            "$1\n  allow = ['^(dart-)?sass$', '^go$', '^git$', '^node$', '^postcss$', '^tailwindcss$']",
          );
        }
        changed = true;
      }
    } else {
      out +=
        "\n[exec]\n  allow = ['^(dart-)?sass$', '^go$', '^git$', '^node$', '^postcss$', '^tailwindcss$']\n";
      changed = true;
    }

    if (/\[node\]/.test(out)) {
      if (!/disable\s*=\s*true/.test(out)) {
        out = out.replace(/\[node\]/, "[node]\n  disable = true");
        changed = true;
      }
    } else {
      out += "\n[node]\n  disable = true\n";
      changed = true;
    }
  } else {
    // In hugo.toml / config.toml, sections are nested under [security]
    if (!/\[security\]/.test(out)) {
      out +=
        "\n[security]\n  [security.exec]\n    allow = ['^(dart-)?sass$', '^go$', '^git$', '^node$', '^postcss$', '^tailwindcss$']\n  [security.node]\n    disable = true\n";
      changed = true;
    } else {
      if (!/\[security\.exec\]/.test(out)) {
        out +=
          "\n  [security.exec]\n    allow = ['^(dart-)?sass$', '^go$', '^git$', '^node$', '^postcss$', '^tailwindcss$']\n";
        changed = true;
      } else if (!/tailwindcss/.test(out)) {
        if (/\[security\.exec\][^\[]*allow\s*=\s*\[/.test(out)) {
          out = out.replace(
            /(\[security\.exec\][^\[]*?allow\s*=\s*\[)([^\]]*)(\])/,
            (m, prefix, inner, suffix) => {
              const items = inner.trim();
              return `${prefix}${items ? items + ", " : ""}'^tailwindcss$'${suffix}`;
            },
          );
        } else {
          out = out.replace(
            /(\[security\.exec\])/,
            "$1\n    allow = ['^(dart-)?sass$', '^go$', '^git$', '^node$', '^postcss$', '^tailwindcss$']",
          );
        }
        changed = true;
      }

      if (!/\[security\.node\]/.test(out)) {
        out += "\n  [security.node]\n    disable = true\n";
        changed = true;
      } else if (!/disable\s*=\s*true/.test(out)) {
        out = out.replace(
          /\[security\.node\]/,
          "[security.node]\n    disable = true",
        );
        changed = true;
      }
    }
  }

  return { content: out, changed };
}

/** Node source that scans and patches all Hugo security config files in the workspace. */
export function buildPatchHugoSecuritySource(): string {
  return [
    "const fs = require('fs');",
    "const path = require('path');",
    `const patchContent = ${patchHugoSecurityContent.toString()};`,
    "const targets = [",
    "  'exampleSite/config/_default/security.toml',",
    "  'config/_default/security.toml',",
    "  'exampleSite/hugo.toml',",
    "  'exampleSite/config.toml',",
    "  'hugo.toml',",
    "  'config.toml',",
    "];",
    "let patchedCount = 0;",
    "for (const t of targets) {",
    "  if (fs.existsSync(t)) {",
    "    try {",
    "      const orig = fs.readFileSync(t, 'utf8');",
    "      const res = patchContent(orig, t);",
    "      if (res.changed) {",
    "        fs.writeFileSync(t, res.content, 'utf8');",
    "        patchedCount++;",
    "      }",
    "    } catch {}",
    "  }",
    "}",
    "for (const dir of ['exampleSite/config/_default', 'config/_default']) {",
    "  if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'security.toml'))) {",
    "    try {",
    "      const defaultSec = \"[exec]\\n  allow = ['^(dart-)?sass$', '^go$', '^git$', '^node$', '^postcss$', '^tailwindcss$']\\n\\n[node]\\n  disable = true\\n\";",
    "      fs.writeFileSync(path.join(dir, 'security.toml'), defaultSec, 'utf8');",
    "      patchedCount++;",
    "    } catch {}",
    "  }",
    "}",
    "console.log('PATCHED_HUGO_SECURITY:' + patchedCount);",
  ].join("\n");
}
