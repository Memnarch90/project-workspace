# Shareable source only

This repository is the neutral, empty edition of Project Workspace. Preserve the previous system font, the visible logo placeholder, and the generic application icon. Never include the FedEx logo, FedEx Sans files or references in runtime/export assets, actual workspace records, credentials, production resource identifiers, or private handovers.

The separate project-workspace directory and its existing deployed site are the personal edition. They must retain the FedEx logo and FedEx Sans. Do not deploy this neutral repository to that site. This is a project-specific rule.

Before publishing, run npm run check:publish, npm run build, and npm run check. Stage only task-related files. Preserve unrelated local changes and never add the entire private source tree.
