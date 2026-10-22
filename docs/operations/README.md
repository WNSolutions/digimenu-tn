# Operations

How we change, check, release and run DigiMenu TN. Written for the trained youth who will
maintain it: no prior DevOps experience needed.

| Guide                                                    | Read it when you want to…                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Branching and releases](branching-and-releases.md)      | make a change, open a pull request, release a version or roll a café back |
| [Continuous integration (CI)](ci.md)                     | understand the automatic checks, or fix a red ❌ on a pull request         |
| [Environments](environments.md)                          | know where the code runs: your laptop, preview, production                 |
| [Secrets](secrets.md)                                    | handle a password, token or key, or react to a leak                        |
| [Security policy](../../SECURITY.md)                     | report a vulnerability                                                     |

## The rules in one minute

1. **`main` is always working.** Every change goes through a short branch and a pull request,
   and is merged only when CI is green.
2. **Ahmed approves every new version before it reaches a café** (D-021). Trained youth may
   roll a café back to its previous release or switch a module off, but never publish.
3. **Secrets never go in Git**: not in code, not in issues, not in screenshots.
4. **Real café data and all customer data stay in the private deploy repo** (D-022). This public
   repository holds only the fictional demo café.
5. **Everything runs on free plans** (Cloudflare Free, GitHub Free). A change that needs a paid
   service needs Ahmed's written approval first.

## Two repositories

| Repository                         | Visibility | Holds                                                                                           |
| ---------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `WNSolutions/digimenu-tn`          | public     | the toolkit: code, demo café, tests, docs; CI on every pull request; release tags `vX.Y.Z`     |
| `WNSolutions/digimenu-deploy-monastir` | private | the Monastir deployment: release window, café onboarding content, media, encrypted backups, printed links, deploy workflows |

Tools you need on your laptop: Git, Node.js 22 (`nvm use` reads `.nvmrc`), and a code editor
(VS Code recommended). Then:

```sh
npm ci          # install the exact tool versions from package-lock.json
npm run check   # lint + formatting + type check + tests: the same checks as CI
npm run format  # fix formatting automatically
```
