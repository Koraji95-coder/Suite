# AutoCad Electrical 2026 AutoLisp Reference API Documentation

## Scope

- Display documentation context for Autocad Electricals API with autoLisp

## Introduction

The AutoCAD Electrical 2026 API entry point list consists of a series of entry points into the AutoCAD Electrical software executable. This API allows a user to create custom applications such as automatic schematic generation or custom drafting/design utilities based upon the AutoCAD Electrical "engine".

The AutoCAD Electrical 2026 API is AutoLISP based but it isn't limited to this development environment. It can be invoked from VB.NET, C#, C++/ARX, VBA, AutoCAD script files, or embedded into custom AutoCAD menus.

Development Environments, Illustrative Examples
The following example illustrates the same custom command created in AutoLISP, C++/ObjectARX, VB.NET, and C#. This example makes calls to two of AutoCAD Electrical's API routines:

ace_get_wnum - find and return the wire number associated with a given wire line entity.
wd_putwn - write a new wire number value back out to a wire "network".
This program is to map a color suffix to each wire number based upon the name of the wire's LINE layer name. For example, if wire number "101" is on a LINE wire drawn on layer name 14AWG-RED-THHN then this utility applies a "red" suffix to the wire.

AutoLISP version

C++ ObjectARX version

Visual Basic version

C # version

Spreadsheet --> PLC I/O Generator
AutoCAD Electrical's spreadsheet to PLC I/O utility can generate a set of PLC I/O drawings from data pulled from a Microsoft Excel spreadsheet. This command is supplied in uncompiled source code form (and also executed from this uncompiled form) to serve as an example of a large, intricate application that makes heavy use of the API.

The program file is wdio.lsp (and companion dialog definition file wdio.dcl). The default install location for these two files is "c:\Documents and Settings\All Users\Documents\Autodesk\acade {version}\support\". You might use a copy of this program file as a model for creating your own custom drawing generation application.

The following AutoLISP utility can be referenced by the title block mapping file (the ".wdt" file) or encoded into your title block's "WD_TB" invisible attribute value (if that's the method you use to link your title block to AutoCAD Electrical).

When this utility runs, it returns the last wire number it finds on the drawing. If no wire numbers found then it returns blank. It excludes wire numbers that are associated with wire networks having "Destination" wire signal arrows on them (meaning that the actual wire number assignment was made on some other drawing).

## Section A - Schematic Components

## Topics
  
## c:ace_iec_tag_freshen

- Trigger reformat of TAG1/TAG2/TAGSTRIP/P_TAG1 attribute text.  
## c:ace_ins_parametric_connector  Insert parametrically generated multi-pin schematic connector symbol.  
## c:ace_lastent_list_from  Get list of recent entities inserted into the active drawing. Return list of entities inserted into the active drawing database after "from_ent" was inserted.  
## c:ace_lastent_mark  Find the last entity or subentity in the active drawing. Use with (c:ace_lastent_list_from...)  
## c:ace_multipole  Insert multipole symbol. The spacing between poles is determined by intersection with underlying wires or, if none found, by the drawing's default ladder rung spacing (carried on attribute RUNGDIST of the drawing's WD_M block insert which then becomes accessible as the 11th element (index 0 based) of the drawing's GBL_wd_m configuration global variable).  
## c:ace_pnl2sch_lookup  Find schematic component symbol name. For a given panel footprint symbol, attempt to find the equivalent schematic component symbol name. This data is returned by a query on the schematic_lookup.mdb file.  
## c:ace_projwide_util_dbx  Project-wide update/retag function.  
## c:ace_retag_project  Re-tag schematic components on all drawings in "dlst" or in entire active project (if "dlst" is nil). This is done in a non-scripting mode.  
## c:wd_calc_comptag  Calculate tag-ID for parent schematic component.  
## c:wd_delsym_main  Erase connected component "ben" and try to reconnect all broken wires and reconcile duplicate wire numbers.  
## c:wd_get_pinlist  Query pin list database and return pin list info.  
## c:wd_ins_circ2  User hook into the "INSERT CIRC" command to insert a collection of prewired components. AcadE automatically retags the inserted components based upon circuit line references or next available sequentials.  
## c:wd_insert_elect_block  Generic INSERT BLOCK command. Wires do NOT break under the block.  
## c:wd_insym  User hook into the INS COMPONENT command, command-line prompted. Same as c:wd_insym2 but command prompts for symbol name typed in at command line and an insertion point. All data is supplied on the command line with optional EDIT dialog box popping up after symbol inserts. Component automatically breaks any underlying wire(s), new wire number generates on new wire segment (if required), component tag automatically generates based on inserted line ref or next available sequential.  
## c:wd_insym_dlg  User hook into the INS COMPONENT command, icon menu driven. Same as wd_insym but command triggers icon menu display for component selection, user selects insertion point. The icon menu that pops up is the schematic icon menu that is in memory or is the default schematic icon menu (if the menu isn't already in memory. Component automatically breaks any underlying wire(s), new wire number generates on new wire segment (if required), component tag automatically generates based on inserted line ref or next available sequential.  
## c:wd_insym_f  User hook into the INS COMPONENT command, prompt to select "insert fence" component. User prompted to select "insert fence" component from icon menu. Then user prompted to draw fence. AcadE inserts selected component at intersections between fence and underlying wires.  
## c:wd_insym_f_same  User hook into the INS COMPONENT command, user prompted to pick on a "just like" component. Same as wd_insym_f but user prompted to pick on a "just like" component. Then user prompted to draw fence. AcadE inserts selected component at intersections between fence and underlying wires.  
## c:wd_insym_go2menu  Display a submenu page in the current icon menu. Jump to and display the "mnum" submenu page in the current icon menu file. A pick on this menu will feed the selected button's value to the INS COMPONENT command.  
## c:wd_insym_gomenu  Jump to and display the "mnum" submenu page in the current icon menu file. A pick on this menu will feed the selected button's value to the INS COMPONENT command.  
## c:wd_insym_same  User hook into the INS COMPONENT command, just-like component, insert prompted. Same as wd_insym but user prompted to select a "just like" component (schematic or panel footprint). Then user is prompted for insertion point. INS/EDIT dialog box appears after insert. The icon menu that pops up is the schematic icon menu that is in memory or is the default schematic icon menu (if the menu isn't already in memory. Component automatically breaks any underlying wire(s), new wire number generates on new wire segment (if required), component tag automatically generates based on inserted line ref or next available sequential.  
## c:wd_insym2  User hook into the INS COMPONENT command. All data is supplied on the command line with optional EDIT dialog box popping up after symbol inserts. Component automatically breaks any underlying wire(s), new wire number generates on new wire segment (if required), component tag automatically generates based on inserted line ref or next available sequential.  
## c:wd_insymn  User hook into the INS COMPONENT command, name via command-line, insert prompted. Same as wd_insym but component name supplied on command line, user prompted to select insertion point. INS/EDIT dialog box displays after insert.The icon menu that pops up is the schematic icon menu that is in memory or is the default schematic icon menu (if the menu isn't already in memory. Component automatically breaks any underlying wire(s), new wire number generates on new wire segment (if required), component tag automatically generates based on inserted line ref or next available sequential.  
## c:wd_insymn_repeat  User hook into the INS COMPONENT command, name via command-line, insert prompted, insertion of sym repeated. Keeps repeating the insert of selected "sym". Component name supplied on command line, user prompted to select insertion point and will attempt to auto-align with any underlying wire. The Insert/Edit dialog box appears after each insert. The icon menu that pops up is the schematic icon menu that is in memory or is the default schematic icon menu (if the menu isn't already in memory. Component automatically breaks any underlying wire(s), new wire number generates on new wire segment (if required), component tag automatically... more  
## c:wd_insymn_rot  User hook into the INS COMPONENT command, name via command-line, insert prompted, rotation prompted. Component name supplied on command line, user prompted to select insertion point, but if the device cannot find a wire/line connection to tie to, it then prompts the user for an insertion ROTATION value. The INS/EDIT dialog box opens after insert. The icon menu that pops up is the schematic icon menu that is in memory or is the default schematic icon menu (if the menu isn't already in memory. Component automatically breaks any underlying wire(s), new wire number generates on new wire segment (if required),... more  
## c:wd_loadmenu  Activate AcadE icon menu. Make AcadE icon menu file "fnam" the active icon menu (for INSERT COMPONENT using c:wd_insym_dlg, c:wd_insym_f, and others).  
## c:wd_menu_load_schem  

- Loads the default schematic icon menu .dat file is loaded and "in memory" so that it will display for a subsequent call related to INS COMPONENT. The menu that is loaded is determined in this order: 1st - an override menu name is defined in global GBL_wd_sch_menu_override. 2nd - defined for the active project (right -click on project's "Symbol Libraries"). 3rd - defaults to menu file "ace_jic_menu.dat". This routine can be used in ".cui" file calls to "wd_insym_gomenu mnum" so that AcadE will display schematic icon menu pages and not menu pages from the last icon menu file used (if... more  

## c:wd_movesym2

- User hook into the MOVE COMPONENT command, all data supplied on the command line. Moved component automatically aligns with and breaks underlying wire(s), new wire number generates on new wire segment (if required), component tag can automatically generate based on inserted line ref or next available sequential. Wire "heals" where component moved from.

## c:wd_pinlist_attach

- Populate parent component with PINLIST info based upon its mfg/cat combo carried on the symbol. If a match is found in the PINLIST table of the catalog lookup file then that data is written to the symbol's PINLIST attrib (or xdata).  

## c:wd_retag_update_noprompts

- Re-tag schematic component(s) on current dwg only and optionally updates related child components across active    project.  

## c:wd_xref_doit

- Run project-wide parent/child cross-reference text update. Note: the drawing or drawings to be processed must be part of the active project.  

## AutoLISP

(c:wd_xref_doit dlst child_update no_report_dlg)

## Parameters

Parameters  Description  

- dlst  List of dwgs to process (full file names, double back slashes) nil = process all dwgs in current project set.

- child_update  1's bit set to do DESC update.
2's bit set to do just blank child DESC update.
4's bit set to do child LOC update.  

- no_report_dlg  1 to suppress cross-ref exception report dlg. nil = show report  

## Example

- Run cross-ref on current project, no options, suppress report:

(setq dlst (nth 5 (c:wd_proj_wdp_data)))
(command "_.QSAVE") ; to suppress any prompt for "save changes"
(c:wd_xref_doit dlst 2 1) ; update blank child DESC
