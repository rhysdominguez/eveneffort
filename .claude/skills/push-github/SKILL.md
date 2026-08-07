---
name: push-github
description: Commit all pending changes and push the current branch to GitHub. Use when the user asks to "push to GitHub", "push my changes", "commit and push", or similar.
---

# push-github — commit everything and push

## Steps

1. **Check state first**, in parallel:
   - `git status` — see what's changed and untracked
   - `git diff` — review unstaged changes
   - `git log --oneline -5` — match this repo's commit message style

2. **Verify the codebase is in good shape** before committing:
   - `npm run test`
   - `npm run build`
   Both must pass. If either fails, stop and fix the underlying issue — don't push broken code, and don't use `--no-verify` to skip hooks.

3. **Review what's about to be staged.** Read through `git status` / `git diff` output for anything that looks like a secret or credential (`.env`, API keys, tokens) even in files with innocuous names. Exclude those from staging and flag it to the user rather than committing them.

4. **Stage and commit** the relevant files (avoid blanket `git add -A`/`git add .` if it would sweep in unrelated or sensitive files — prefer naming files explicitly when in doubt):
   ```bash
   git add <files>
   git commit -m "$(cat <<'EOF'
   <concise summary of the why, 1-2 sentences, matching repo's commit style>

   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   EOF
   )"
   ```

5. **Push**:
   ```bash
   git push origin <current-branch>
   ```
   Never force-push. If the push is rejected (remote has diverged), stop and tell the user rather than force-pushing or resetting.

6. **Report** the commit(s) pushed and the branch/remote they landed on.

## Notes

- Only create a commit if there are actually changes to commit — don't create empty commits.
- Always create a new commit rather than amending, unless the user explicitly asks to amend.
- If there's nothing staged or working-tree-dirty, just push any local commits that are ahead of the remote.
