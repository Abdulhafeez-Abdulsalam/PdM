/**
 * Commit messages follow Conventional Commits: "type(scope): summary", e.g.
 *   feat(web): add alarm list
 *   fix(mock-data): stop solar output at night
 * Types: feat, fix, docs, style, refactor, test, chore, perf, build, ci, revert.
 */
export default { extends: ["@commitlint/config-conventional"] };
