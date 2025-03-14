module.exports = {
  'prepare-commit-msg': `grep -qE '^[^#]' .git/COMMIT_EDITMSG || (exec < /dev/tty && pnpm cz --hook || true)`,
  'commit-msg': 'pnpm commitlint --edit $1',
}
