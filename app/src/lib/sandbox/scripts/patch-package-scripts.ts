/**
 * Adds the flags a dev server needs to be reachable from the preview tab:
 * bind to 0.0.0.0, serve drafts and future-dated content, and (Hugo) point
 * livereload at the proxied port.
 *
 * Pure and self-contained on purpose — it is serialized with `toString()` and
 * executed inside the sandbox by {@link buildPatchPackageScriptsSource}, so it
 * must not reference anything outside its own body.
 */
export function applyDevScriptFlags(scripts: Record<string, string>): {
  scripts: Record<string, string>;
  changed: boolean;
} {
  const out: Record<string, string> = { ...scripts };
  let changed = false;

  for (const k of Object.keys(out)) {
    const s = out[k];

    if (/hugo\s+(server|serve)/.test(s)) {
      if (!/--bind/.test(s)) {
        out[k] = out[k].replace(
          /hugo(\s+(?:server|serve))/g,
          "hugo$1 --bind 0.0.0.0",
        );
        changed = true;
      }
      if (!/--liveReloadPort/.test(out[k])) {
        out[k] = out[k].replace(
          /hugo(\s+(?:server|serve))/g,
          "hugo$1 --liveReloadPort 443",
        );
        changed = true;
      }
      if (!/--buildDrafts/.test(out[k])) {
        out[k] = out[k].replace(
          /hugo(\s+(?:server|serve))/g,
          "hugo$1 --buildDrafts",
        );
        changed = true;
      }
      if (!/--buildFuture/.test(out[k])) {
        out[k] = out[k].replace(
          /hugo(\s+(?:server|serve))/g,
          "hugo$1 --buildFuture",
        );
        changed = true;
      }
      if (!/--baseURL/.test(out[k])) {
        out[k] = out[k].replace(
          /hugo(\s+(?:server|serve))/g,
          "hugo$1 --appendPort=false --baseURL $SITEPINS_BASE_URL",
        );
        changed = true;
      }
    }

    if (/jekyll\s+serve/.test(s) || /jekyll\s+s(\s|$)/.test(s)) {
      if (!/--host/.test(s) && !/-h(\s|$)/.test(s)) {
        out[k] = out[k].replace(
          /jekyll(\s+serve|\s+s)/g,
          "jekyll$1 --host 0.0.0.0",
        );
        changed = true;
      }
      if (!/--drafts/.test(s)) {
        out[k] = out[k].replace(/jekyll(\s+serve|\s+s)/g, "jekyll$1 --drafts");
        changed = true;
      }
      if (!/--future/.test(s)) {
        out[k] = out[k].replace(/jekyll(\s+serve|\s+s)/g, "jekyll$1 --future");
        changed = true;
      }
    }

    if (/hexo\s+server/.test(s) || /hexo\s+s(\s|$)/.test(s)) {
      if (!/--drafts/.test(s) && !/-d(\s|$)/.test(s)) {
        out[k] = out[k].replace(/hexo(\s+server|\s+s)/g, "hexo$1 --drafts");
        changed = true;
      }
    }

    if (/\bastro\s+dev/.test(s)) {
      if (!/--buildDrafts/.test(s)) {
        out[k] = out[k].replace(/\bastro\s+dev/g, "astro dev --buildDrafts");
        changed = true;
      }
      if (!/--buildFuture/.test(out[k])) {
        out[k] = out[k].replace(/\bastro\s+dev/g, "astro dev --buildFuture");
        changed = true;
      }
    }

    if (/\bnext\s+dev/.test(s)) {
      if (!/-H\b|--hostname\b/.test(out[k])) {
        out[k] = out[k].replace(/\bnext\s+dev/g, "next dev -H 0.0.0.0");
        changed = true;
      }
      if (!/BUILD_DRAFTS/.test(out[k])) {
        out[k] = out[k].replace(/\bnext\s+dev/g, "BUILD_DRAFTS=true next dev");
        changed = true;
      }
      if (!/BUILD_FUTURE/.test(out[k])) {
        out[k] = out[k].replace(/\bnext\s+dev/g, "BUILD_FUTURE=true next dev");
        changed = true;
      }
    }
  }

  return { scripts: out, changed };
}

/** Node source that applies {@link applyDevScriptFlags} to package.json. */
export function buildPatchPackageScriptsSource(): string {
  return [
    "const fs=require('fs');",
    "try{",
    "const p=JSON.parse(fs.readFileSync('package.json','utf8'));",
    "if(p.scripts){",
    `const apply=${applyDevScriptFlags.toString()};`,
    "const r=apply(p.scripts);",
    "if(r.changed){",
    "p.scripts=r.scripts;",
    "fs.writeFileSync('package.json',JSON.stringify(p,null,2));",
    "console.log('PATCHED');",
    "}",
    "}",
    "}catch(e){}",
  ].join("");
}
