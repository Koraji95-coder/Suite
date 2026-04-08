# Transmittal-Builder — Deprecated

> **Status:** Deprecated. This standalone desktop application is scheduled for extraction to its own repository.

## Notice

This directory contains a standalone PyQt6 desktop application (~4,300 lines, 15+ files) that duplicates the web-based transmittal feature available in the Suite web platform. The standalone app is no longer actively maintained and will not receive new features.

**Use the web-based transmittal workflow in the Suite frontend instead.**

## Functionality to Port Before Removal

The following capabilities exist in this standalone app but are not yet fully replicated in the web platform:

| Feature | Description |
|---------|-------------|
| **SMTP email integration** | Direct SMTP sending with configurable sender, recipients, and attachments via `backend/Transmittal-Builder/emails/sender.py` |
| **Word document generation** | Generates `.docx` transmittal cover sheets from templates via `backend/Transmittal-Builder/core/transmittal_render.py` |
| **PDF analysis** | Parses PDF metadata (page count, revision info) from deliverable PDFs |

These should be ported to the web backend before this directory is deleted.

## Future Standalone Repo

Once extracted, this app will live at:

```
https://github.com/Koraji95-coder/transmittal-builder  <!-- placeholder — repo not yet created -->
```

## Do Not Delete

Do not delete this directory until:
1. All unique functionality listed above has been ported to the web platform, OR
2. The directory has been extracted to its own standalone repository.
