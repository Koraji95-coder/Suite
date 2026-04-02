# AutoCAD Electrical 2026 Project Flow Reference

Generated from allowlisted wrapped Autodesk Offline Help payloads under `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English`. This focused reference is the authoritative Suite-side doc for ACADE project creation/opening research, not the broader AutoLISP archive.

## AEPROJECT / Project Manager entrypoints

- Primary command entry in the Autodesk help: `AEPROJECT` (Command entry: AEPROJECT).
- To launch Project Manager, click Project tabProject Tools panelManager.
- The Projects tab exposes the core controls for opening, creating, and managing AutoCAD Electrical projects and drawings.
- The Project Selection menu is the primary ACADE path for creating a new project, opening an existing project, or reopening a recent one.
- You cannot keep two open projects in the palette with the same project name.
- Source pages: `To Work with Projects`, `Projects Tab (Project Manager Dialog Box)`.

## Bare project creation and activation flow

1. Use one of the following: On Project Manager, click New Project. Right-click at the bottom of the tree inside the Project Manager and select New Project. Click the arrow on the Project drop-down list and select New Project.
2. Enter the name for the new project. The .wdp extension is not required.
3. Select or create the directory for the project. If you leave this field blank, the project WDP file is created at the location defined in the WD.ENV file.
4. (Optional) Copy the project settings from an existing project file (WDP). If you leave this field blank, the software copies properties from the active project.
5. (Optional) Click Descriptions to enter an unlimited number of descriptions for the project. Select the check boxes to include description lines in reports.
6. (Optional) Click OK-Properties to modify your default project settings for libraries, icon menus, components, wire numbering, cross-references, styles, and drawing formats.
7. Click OK.
- To open a project and make it active, select Open Project and browse to the project .wdp file.
- A list of recently opened projects displays with the last project you worked on at the top. You can select another project to open without browsing for it. The list of recent projects is saved in a text file called lastproj.fil in the user subdirectory.
- The Autodesk help states that a newly created project becomes the active project.

## .wdp, .aepx, and project-related sidecar files

- Is a text file with any path and any name followed by the .WDP extension.
- Lists the complete path to each drawing included in the project.
- Includes the folder structure defined in Project Manager. The folder structure organizes drawings for use in AutoCAD Electrical toolset.
- Includes the description, section, and sub-section values assigned to each drawing.
- Includes default settings that can be referenced when new drawings are created and added to the project.
- AutoCAD Electrical manages a secondary `.aepx` file automatically and recreates it if it is deleted.
- Key project-level sidecars called out by Autodesk include `.WDT` for title block mapping, `.WDL` for project label/LINEx customization, `*_CAT.MDB` or `DEFAULT_CAT.MDB` for catalog lookup, `.INST` and `.LOC` defaults, and `.WDW` wire color/gauge label mappings.
- These files are ACADE-managed project context files that live beside, or are resolved relative to, the active `.wdp` rather than Suite-owned scaffold files.

## WD.ENV, WD_PROJ, and default path behavior

- If the create-project directory field is blank, the new `.wdp` file is created at the location defined in `WD.ENV`.
- When you create a project file you can save it to any folder. Project files default to the folder pointed to by the WD_PROJ setting in your environment file.
- Autodesk documents `WD_PICKPRJDLG` as the setting that pre-seeds the default project-picker directory.
- Autodesk search sequence "A" prioritizes explicit paths, the Autodesk user support folder, and the active project's `.wdp` folder before broader support search paths.
- Autodesk search sequence "B" is used for footprint and schematic lookup resources and also checks catalog/panel support paths before general AutoCAD support paths.
- Autodesk search sequence "C" is used for catalog-style defaults and can optionally move AutoCAD support paths earlier when `WD_ACADPATHFIRST=1` is enabled.

## Generic AutoCAD ActiveX project-path APIs and why they are not the ACADE creation mechanism

- GetProjectFilePath / SetProjectFilePath are not ACADE project-creation APIs.
- Gets the directory in which AutoCAD looks for external reference files.
- Sets the directory in which AutoCAD looks for external reference files.
- The name of the project. This name is also controlled by the PROJECTNAME system variable.
- The documented setter signature is `object.SetProjectFilePath ProjectName, ProjectFilePath`.
- Supported platforms: AutoCAD for Windows only; not supported in AutoCAD LT for Windows
- Both APIs belong to AutoCAD's `PreferencesFiles` object and manage the generic AutoCAD project/xref search directory, not the AutoCAD Electrical Project Manager flow that creates or activates `.wdp` projects.

## Practical implications for Suite automation

- Suite should trigger `AEPROJECT`/Project Manager or an AutoCAD-hosted plugin bridge and let ACADE create or open the project from inside AutoCAD Electrical.
- Suite should not create starter `.wdp`, `.wdt`, `.wdl`, or related project files itself just to mimic an ACADE project.
- If Suite captures an intended project root or `.wdp` target path, that path should be passed into the ACADE-side flow as an operator intent or plugin argument, not written directly by Suite as a fake project artifact.
- When Suite inspects an existing ACADE project, it should look for the active `.wdp`, the auto-managed `.aepx`, and sidecar discovery behavior rooted in the project folder and Autodesk search sequences.

## Source appendix with local Autodesk paths and GUIDs

- Offline help root: `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English`.
- `GUID-25D4B513-8E04-42C2-BA86-23B709FFC3D3` | To Work with Projects | `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English\Help\wrapped-filesACAD_E\GUID-25D4B513-8E04-42C2-BA86-23B709FFC3D3.htm.js`
- `GUID-79E83296-12EF-43D9-87A8-E127519FF784` | Projects Tab (Project Manager Dialog Box) | `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English\Help\wrapped-filesACAD_E\GUID-79E83296-12EF-43D9-87A8-E127519FF784.htm.js`
- `GUID-AF1F81F8-07B3-4CA0-A576-5FDA3ED3F68A` | About Projects | `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English\Help\wrapped-filesACAD_E\GUID-AF1F81F8-07B3-4CA0-A576-5FDA3ED3F68A.htm.js`
- `GUID-0B936B2C-085D-4A1C-AB6A-C76072C27C07` | About Project Related Files | `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English\Help\wrapped-filesACAD_E\GUID-0B936B2C-085D-4A1C-AB6A-C76072C27C07.htm.js`
- `GUID-C9DDFE09-35F5-4328-9359-30F0EED70CF8` | GetProjectFilePath Method (ActiveX) | `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English\Help\wrapped-filesACD\GUID-C9DDFE09-35F5-4328-9359-30F0EED70CF8.htm.js`
- `GUID-66AD1415-B1FD-4E24-AA41-68A93220C3A4` | SetProjectFilePath Method (ActiveX) | `C:\Program Files\Autodesk\Offline Help for AutoCAD Electrical 2026 - English\Help\wrapped-filesACD\GUID-66AD1415-B1FD-4E24-AA41-68A93220C3A4.htm.js`
