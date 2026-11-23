# How Floor Plan Import Works (plain-language, customer-facing)

This explains what happens when you upload a floor plan PDF to Ultra-Calc, in plain language, for answering user questions about the import feature. It intentionally omits internal implementation detail and engineering notes that aren't relevant to using the app.

## Starting an Import

From a project, choose to upload a PDF floor plan and Ultra-Calc will scan it to find rooms and dimensions automatically. Only PDF files are accepted - other formats (images, CAD files, etc.) aren't supported for automatic scanning. Plans can be up to 60 pages; most real-world plans are a small fraction of that.

If you'd rather not use automatic scanning, a manual PDF-assisted entry mode is also available: it shows the PDF beside the existing room editor so you can enter rooms one at a time yourself, without AI.

You need to be signed in to use either the automatic scan or the manual PDF-assisted mode.

## What Happens During a Scan

Ultra-Calc reads the PDF page by page, looking for floor-plan views and the room labels and dimensions drawn on them. Progress is shown as it works through the document (for example, which page it's currently on and how many rooms have been found so far). A short plan can finish in well under a minute; a long, multi-page, or especially detailed plan can take several minutes, since more pages and more rooms mean more work.

While scanning a page, Ultra-Calc also looks for project-level details on title or mechanical sheets - things like the project address, region, and design temperatures - and fills those in automatically when they're found, saving you from re-entering them by hand. If you upload a different PDF for the same project, those fields reset so nothing from the previous plan carries over by mistake.

## Reviewing Detected Rooms

Automatic detection isn't asked to be perfect - it's a starting point. Every detected room, along with its dimensions and other details, is presented for you to review and correct before it's added to the project. Nothing from a scan is used in the project's calculations until you've confirmed it in the review step.

## If Something Looks Wrong

If a room's shape, dimensions, or labels look incorrect after a scan, correct them in the review step the same way you'd edit any other room - the import feature is meant to save typing, not replace your judgment about what's actually on the plan.
