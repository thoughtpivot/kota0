# build-ai documentation (canonical source)

Subject-based architecture, twelve-factor notes, env prefixes, and AI integration patterns live in the **build-ai** repo on this machine:

`/Users/ispyhumanfly/Projects/sp-10-inc/build-ai/docs`

Recommended local copies for offline work:

```bash
# Example: copy selected docs into this repo (do not commit secrets)
rsync -a --include='*.md' --exclude='temporary' \
  ~/Projects/sp-10-inc/build-ai/docs/ ./docs/build-ai/imported/
```

Key files referenced by the vibe app plan:

- `Subject-Based-Architecture.md` — subjects vs simple components
- `12-Factor-Principles.md`
- `Environment-Variable-Prefixes.md`
- `AI-Integration.md`
