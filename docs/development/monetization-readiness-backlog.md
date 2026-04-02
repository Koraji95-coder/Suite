# Monetization Readiness Backlog

Date: March 23, 2026

This is the "for later" backlog for turning Suite into something customers can pay for.

## Simple Rule

Do not try to sell the whole platform first.

Sell one clear job first:

**Drawing production control for electrical AutoCAD teams.**

That means the first commercial package should be built around:

- Drawing List Manager
- title block sync
- Standards Checker
- Transmittal Builder
- Watchdog project and drawing telemetry

AutoDraft can be the premium automation layer later.
Agents can be the premium orchestration layer even later.

## Before The First Paid Pilot

### 1. Make setup feel like a product

- One guided install/bootstrap path for runtime, backend, gateway, frontend, collectors, and AutoCAD plugin.
- Visible version/build info for every moving piece.
- One clear health screen that matches reality.
- One support bundle export for logs, runtime state, and diagnostics.

### 2. Make the first workflow boringly reliable

- Scan drawing list.
- Review title block mismatches.
- Run standards checker.
- Build the issue package/transmittal.
- Link work back to project and drawing activity.

The first paid customer should be able to complete that whole path without repo knowledge.

### 3. Make outputs trustworthy

- Title block sync needs preview, apply, and receipts.
- Standards Checker needs clear findings and exports.
- Transmittal Builder needs package receipts and project linkage.
- Watchdog needs clean human-readable events, not noisy internal command spam.
- AutoDraft must stay review-first before any paid rollout.

### 4. Prove value

Before charging, Suite needs one simple pilot report that answers:

- how many drawings were touched
- how much tracked drawing time happened
- how many issues were found
- how many were corrected
- how many packages/transmittals were issued
- how much time or rework was saved

## Before Selling To Small Teams Repeatedly

### 1. Add real team/commercial structure

- organizations
- workspaces
- memberships
- roles
- seats
- feature entitlements

### 2. Add customer admin surfaces

- user and role management
- workstation registration
- collector/plugin health
- feature visibility by plan
- support and diagnostics export

### 3. Add reusable templates

- watchdog rule templates
- title block profiles
- standards packs
- transmittal templates
- sample/demo project packs

### 4. Make updates safe

- predictable runtime update path
- predictable AutoCAD plugin update path
- rollback path if an update breaks a workstation
- version compatibility checks between components

### 5. Add privacy and retention controls

Customers will ask:

- what is being tracked
- where it is stored
- how long it is kept
- who can see it
- how to export/delete it

Watchdog especially needs clear answers here.

## Before Bigger Contracts Or Subscription Scale

### 1. Split commercial packaging cleanly

- Production Control
- Production Control + Watchdog
- Production Control + Watchdog + AutoDraft
- Agents only after the rest is stable

### 2. Add billing and entitlement operations

- plan assignment
- renewal state
- subscription/billing status
- grace period behavior
- feature gating by plan

### 3. Add enterprise controls later, not first

- SSO
- org-wide audit exports
- admin delegation
- deployment policy controls
- customer-facing compliance answers

## What Not To Sell First

- not "all-in-one engineering workspace"
- not generic AI agents
- not general construction PM
- not autonomous CAD edits without review

## What Watchdog Needs Before It Can Carry Revenue

- cleaner event vocabulary
- better per-drawing and per-project rollups
- less temp/autosave noise
- clearer manager/operator views
- exportable activity summaries

## What AutoDraft Needs Before It Can Carry Revenue

- narrower, more stable workflows
- strong rule/model version visibility
- dependable receipt-to-project linkage
- clearer throughput and quality metrics
- very strong review and approval UX

## What Agents Need Before They Can Carry Revenue

- explicit tool boundaries
- stronger review inbox and approval flow
- output attachment to real projects/drawings
- better run recovery and audit trail
- less "interesting demo" energy and more "reliable operator assistant" energy

## Short Version

Before monetization, Suite needs to become:

1. easier to install
2. easier to trust
3. easier to support
4. easier to explain
5. easier to measure

That work matters more than adding more features right now.
