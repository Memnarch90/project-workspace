# Excel exports: scope and customisation

The export layout was originally built for the maintainer's own workflow. It is a limited, fixed reporting format, not a general-purpose Excel report designer.

## What the project export contains

- A project-plan sheet with Action, Task/Milestone, Department, Owner, Status, Notes, Start date and End date.
- A Risk log sheet with risk details, scoring and mitigation.
- A Lists sheet supporting workbook dropdowns.
- Workstream exports reuse this layout in separate workbooks inside a ZIP.

The exporter maps application statuses into its smaller report vocabulary. For example, Waiting becomes In progress and Blocked becomes At risk; the original action status is added to Notes. The workbook is a reporting snapshot, not a complete workspace backup or a two-way Excel synchronisation format. Use Backup / Restore for the app's supported backup flow.

## Make it your own

You can edit the downloaded workbook in Excel: change headings, rearrange columns, add formulas, change colours or add your own branding. Those edits affect that file; the app does not learn the changes or use it as a new export template.

Changing future exports requires adapting [export.js](../export.js) and [export-template.js](../export-template.js). The separate Internal Knowledge export is implemented in [knowledge-export.js](../knowledge-export.js). There is no export-layout editor in the app. Ask a developer to change the mapping and template, then check a generated workbook before relying on it.

## Branding and private information

The public edition does not supply company logos or proprietary company fonts in its exports. Its generated workbook packages are checked for excluded branding, embedded media and font files by [the export branding regression test](../tests/export-branding.test.mjs).

Exports do include the records you choose to export, including owners and notes. If you enter company names or other private information into your own records, that content can appear in the exported cells. The exporter does not censor user-entered content or guarantee that a workbook is safe to share. Review each file before sending it to someone else.
