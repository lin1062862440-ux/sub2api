# Desktop External Usage Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver three synchronized pearl themes, selectable orb/bar floating forms, a shared rounded detail card, and compact macOS status-item metrics.

**Architecture:** Persist platform-neutral presentation choices in the usage-display core, centralize palette metadata in the macOS shared layer, and share one detail-card component between the floating and menu-bar hosts. Rust owns native geometry and tray rendering while Vue owns settings and external card content.

**Tech Stack:** Vue 3, TypeScript, Vitest, Tauri 2, Rust, macOS AppKit integration, CSS.

---

### Task 1: Configuration Schema And Theme Metadata

**Files:**
- Modify: `clients/desktop/src/features/usage-display/core/storage.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/core/storage.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/appearance.ts`
- Modify: store/host tests and types that construct `UsageDisplayConfig`

- [ ] Add failing storage tests asserting default `sky`/`orb`, migration from `default`/`dark`/`blur`, and validation of `sky`/`meadow`/`sunset` with `orb`/`bar`.
- [ ] Run `pnpm test:run src/features/usage-display/core/storage.spec.ts` and confirm failures are caused by missing new fields and identifiers.
- [ ] Add `UsageDisplayAppearance` and `FloatingUsageStyle` unions, independent normalization, and shared appearance metadata.
- [ ] Update existing config fixtures and host payload types, then rerun focused core tests until green.

### Task 2: Settings Controls And Faithful Preview

**Files:**
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.vue`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`

- [ ] Add failing component tests for `清透蓝`, `青柠黄`, `珊瑚红`, selected theme tokens, floating shape controls, and shape-aware preview.
- [ ] Run the two settings specs and confirm the new selectors and labels fail.
- [ ] Render the choices from shared appearance metadata, add the floating style segmented control, and propagate complete config objects.
- [ ] Build a compact theme-aware menu preview and orb/bar preview using shared CSS variables; rerun settings specs.

### Task 3: Shared Detail Card

**Files:**
- Create: `clients/desktop/src/features/usage-display/external/macos/shared/ExternalUsageDetailCard.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/UsageQuotaCard.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/quota-float-themes.css`

- [ ] Add failing tests that both hosts render the same detail-card test id, the three-line header, no external action icons, the primary progress track, quota row tracks, and lower-right expiry.
- [ ] Run the three focused specs and confirm structural failures.
- [ ] Extract one shared detail component using the established balance and quota presentation helpers; keep drag behavior as an optional host callback.
- [ ] Replace both host compositions with the shared card and centralize all palette/layout rules in `quota-float-themes.css`.
- [ ] Rerun the focused specs and remove obsolete duplicated card styles/components only after green.

### Task 4: Floating Orb And Bar Native Geometry

**Files:**
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.vue`
- Create: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageBar.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageOrb.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css`
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs`
- Modify: `clients/desktop/src-tauri/src/usage_display/mod.rs`

- [ ] Add failing Vue tests for conditional orb/bar rendering and source changes without an empty surface.
- [ ] Add failing Rust tests for orb `88x88`, bar `176x52`, expanded `352x352`, and lower-right geometry preservation.
- [ ] Pass `floatingStyle` through the host command and resize the native window when configuration changes.
- [ ] Implement the horizontal bar and refine orb typography, edge, change animation, drag and click behavior.
- [ ] Run focused Vue and Rust tests until green.

### Task 5: Compact macOS Status Metric

**Files:**
- Modify: `clients/desktop/src/features/usage-display/core/format.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/core/format.ts`
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`
- Modify: `clients/desktop/src-tauri/Cargo.toml` only if direct AppKit bindings are required

- [ ] Add failing formatter tests asserting balance excludes `余额` and subscription excludes group name and `用量`.
- [ ] Add failing Rust tests for parsing the compact metric, green-to-red interpolation, and hollow zero state.
- [ ] Emit a structured compact tray title from TypeScript and render the metric through the macOS status item without stale text.
- [ ] Assign a stable native status-item autosave identifier where supported so user placement survives recreation.
- [ ] Run format and Rust tests until green.

### Task 6: Visual And Full Verification

**Files:**
- Modify only files required by concrete visual defects found during this task.

- [ ] Start desktop visual/dev mode and capture real-dimension screenshots for three themes, both collapsed forms, balance, and subscription.
- [ ] Inspect all screenshots for four rounded corners, readable hierarchy, large numeral/small percent, both progress tracks, expiry alignment, and adaptive vertical spacing; fix any defect through a failing component assertion or isolated CSS correction.
- [ ] Run `pnpm test:run`, `pnpm build`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` from `clients/desktop`.
- [ ] Review `git diff --check`, `git status --short`, and the final requirement checklist.
- [ ] Commit only intended source/docs changes; keep `.superpowers/` untracked.
- [ ] Push `main` to `origin` and `gitee`, fetch both, and confirm both divergence counts are `0 0`.

