Root cause: Mason completed GitHub branch and commit work, but the production runtime summary only exposed pull request and preview fields. Commit-only work has no PR or preview, so the UI showed not returned even when GitHub succeeded.

Fix target: surface branch name, committed file path, commit SHA, and commit URL in the Mason runtime summary for commit-only operations.
