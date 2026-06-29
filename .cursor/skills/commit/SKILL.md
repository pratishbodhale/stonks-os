---
name: commit
description: >-
  Review all uncommitted changes, scan for secrets, commit safe files, and push
  to remote. Use when the user asks to commit, save changes to git, push commits,
  or says "commit and push".
---

# Commit and Push

When the user asks to commit (with or without "push"), follow this workflow end-to-end. Do not stop after committing — **always push** unless the user explicitly says not to push.

## 1. Gather state (parallel)

```bash
git status
git diff
git diff --cached
git log -5 --oneline
```

Read every changed and untracked file that might be staged.

## 2. Secret scan (mandatory before `git add`)

**Never stage or commit:**

| Pattern | Examples |
|---------|----------|
| Env / credentials | `.env`, `.env.*`, `firebase-credentials.json`, `*.pem`, `credentials.json` |
| Generated at build | `app/public/firebase-messaging-sw.js` — contains `NEXT_PUBLIC_FIREBASE_*` baked in by `scripts/generate-firebase-sw.mjs`; never commit |
| Tokens / keys | `.access_token`, `*_SECRET=*`, `*_API_KEY=*` (server keys in env files), service-account JSON |
| Local/runtime | `.DS_Store`, `node_modules/`, `*.db-wal`, `*.db-shm`, IDE dirs (`.idea/`) unless user requests |
| Archives / dumps | `downloads/`, `*.zip` with data, screenshots unless explicitly requested |

**Scan each file** for hardcoded secrets before staging:

```bash
# Run on candidate paths; review hits manually
rg -i '(api[_-]?secret|password\s*=|private[_-]?key|BEGIN (RSA |OPENSSH )?PRIVATE|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]+)' --glob '!node_modules' .
```

**Public client config in source is OK** only for env-driven modules (e.g. `firebase-client.ts` reading `process.env`). **Never commit** generated `firebase-messaging-sw.js` — flag if it appears in `git status` or diff with non-empty Firebase values.

If a file might contain secrets: **warn the user, omit it**, and list what was excluded.

## 3. Stage only safe files

```bash
git add <explicit paths>   # prefer explicit paths over git add -A
```

Do not use `git add -A` or `git add .` without reviewing untracked files first.

## 4. Commit

- Message: 1–2 sentences, focus on **why**, match repo style (`git log`)
- Use HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Your message here.

EOF
)"
```

- **Never** `--no-verify`, amend, or change git config unless user explicitly requests
- If pre-commit hook fails: fix and create a **new** commit (do not amend a failed commit)

## 5. Push (always)

```bash
git push
```

If no upstream: `git push -u origin HEAD`

If push fails, diagnose and retry. Do not leave commits unpushed unless the user said not to push.

## 6. Report to user

Summarize:

1. What was committed (brief)
2. What was **excluded** and why (secrets scan)
3. Push result (branch, remote)

## Safety rules

- NEVER commit files that likely contain secrets — warn even if user asked to "commit everything"
- NEVER update git config
- NEVER force-push to main/master without explicit user request and warning
- Only create commits when the user asks to commit
