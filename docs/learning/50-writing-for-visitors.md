# Learning note 50: Writing for visitors (README, contribution guide, licence)

_This note goes with Phase 6 chunk 6. Open the repository's page on GitHub: what GitHub shows under the file list is the README._

## 1. The README is the front door

Most people who find a project read the first screen of its README and decide whether to go on. They want answers to four questions, in this order: **what is it**, **what can it do**, **how do I run it**, and **where do I read more**.

The old README had grown into a log: every phase added a sentence to one long "Status" paragraph. True, but no help to a visitor. The new one answers the four questions, keeps the details (server settings, every test command and how long it takes) in tables further down, and points to the documentation index for the rest. A project's history belongs in its plans and reviews, which the index lists.

## 2. A contribution guide

`CONTRIBUTING.md` is where GitHub sends someone about to open a pull request. It says what "done" means here, so a newcomer doesn't have to guess:

- the **checks** to run for each kind of change (and the exact commands);
- the **commit message** format the git hook enforces;
- the **rules** the code follows, with the reason for each, and which ones lint or tests enforce. Writing these down made one thing clear: most of them were already enforced by a tool, which is the best kind of rule, because nobody has to remember it.

## 3. An index

50 learning notes, 19 decision records, five design documents and ten plans, reviews and reports are hard to find by browsing folders. `docs/README.md` lists them all, grouped so a reader can find what they need: the design documents first, then how it was built, then the learning notes by topic.

## 4. A licence

Without a licence, code on GitHub is visible but not legally usable: copyright law gives the author all rights by default. The **MIT licence** is short and permissive: anyone may use, copy, change and share the code, even commercially, as long as they keep the copyright notice; and it comes with no warranty. The file is the standard text with the year and your name. It's also stated in `package.json` (`"license": "MIT"`), where tools look for it.

## 5. Checking documents like code

Links break silently. Before committing, every relative link in the new documents was checked with a small script: each must point to a file that exists. One command example was also run for real: `npm run e2e -- -- -g "…"` needs **two** `--`, because the root script calls npm again, and with only one, npm would read `-g` as its own "global" option.

## 6. Exercises

1. Read only the first screen of the README on GitHub. Could someone who's never heard of PdM say what it does?
2. Pick a rule in CONTRIBUTING.md and find what enforces it: the lint configuration, a test, or a hook.
3. Try `npm run e2e -- -g "lands on" --list` with one `--`. What does npm do with `-g`?
4. Choose a licence for a project of your own at choosealicense.com. What does MIT allow that the GPL doesn't?
