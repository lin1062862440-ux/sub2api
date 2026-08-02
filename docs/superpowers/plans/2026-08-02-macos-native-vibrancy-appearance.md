# macOS Native Vibrancy Usage Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a macOS-only `苹果原生风` appearance with a native Vibrancy orb, capsule, landscape floating detail window, and landscape menu-bar popover while preserving the existing three themes.

**Architecture:** Extend the persisted appearance contract with `native`, render the existing data through an appearance-specific landscape Vue layout, and let Rust own appearance-dependent window geometry and the `window-vibrancy` lifecycle. Existing theme geometry and CSS remain the fallback branch; switching appearance always clears and reapplies native material deterministically.

**Tech Stack:** Vue 3, TypeScript, Vitest, Tauri 2, Rust, `window-vibrancy` 0.6, AppKit `NSVisualEffectMaterial::Popover`.

---

## File Map

- `clients/desktop/src/features/usage-display/core/storage.ts`: add and validate the `native` appearance value.
- `clients/desktop/src/features/usage-display/core/storage.spec.ts`: prove persistence and normalization.
- `clients/desktop/src/features/usage-display/external/macos/shared/appearance.ts`: expose the fourth macOS appearance.
- `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.vue`: render a four-choice responsive chooser and native thumbnail.
- `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts`: prove the new choice and emission contract.
- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`: render native orb and capsule previews without changing the internal settings shell.
- `clients/desktop/src/features/usage-display/external/macos/shared/ExternalUsageDetailCard.vue`: mark the native landscape variant and expose its primary compact subscription metric.
- `clients/desktop/src/features/usage-display/external/macos/shared/BalanceOverview.vue`: keep denominator-free balance semantics in the landscape layout.
- `clients/desktop/src/features/usage-display/external/macos/shared/ExternalSubscriptionOverview.vue`: preserve all configured quota rows in the landscape grid.
- `clients/desktop/src/features/usage-display/external/macos/shared/quota-float-themes.css`: add isolated native tokens and landscape geometry.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css`: add exact native orb and capsule geometry without modifying old-theme rules.
- `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`: verify native compact states and transition behavior.
- `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`: verify native landscape selection.
- `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts`: use the exported four-value appearance contract in dialog mocks.
- `clients/desktop/src-tauri/src/usage_display/mod.rs`: validate `native`, size the native popover, and clear material when disabling.
- `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`: apply or clear popover Vibrancy when menu-bar mode is configured.
- `clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs`: own appearance-specific sizes, active appearance state, material radius, expansion, and collapse.

### Task 1: Extend The Appearance Contract

**Files:**
- Modify: `clients/desktop/src/features/usage-display/core/storage.ts`
- Modify: `clients/desktop/src/features/usage-display/core/storage.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/appearance.ts`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.vue`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts`

- [ ] **Step 1: Write failing storage and chooser tests**

Add a storage case that loads and saves `appearance: 'native'`, then update the chooser expectation to four choices and assert `苹果原生风` emits `native`:

```ts
it('preserves the macOS native appearance', async () => {
  mocks.get.mockResolvedValue({
    enabled: true,
    source: 'balance',
    subscriptionId: null,
    surface: 'floating-window',
    appearance: 'native',
    floatingStyle: 'bar',
  })

  await expect(loadUsageDisplayConfig(42)).resolves.toMatchObject({ appearance: 'native' })
})
```

```ts
expect(choices).toHaveLength(4)
expect(wrapper.text()).toContain('苹果原生风')
await wrapper.get('[data-testid="usage-appearance-native"]').trigger('click')
expect(wrapper.emitted('update:modelValue')).toContainEqual(['native'])
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
cd clients/desktop
pnpm exec vitest run src/features/usage-display/core/storage.spec.ts src/features/usage-display/internal/settings/UsageAppearanceChooser.spec.ts
```

Expected: failure because `native` is not normalized and the fourth chooser button does not exist.

- [ ] **Step 3: Implement the contract and chooser**

Extend the type and both validation paths:

```ts
export type UsageDisplayAppearance = 'sky' | 'meadow' | 'sunset' | 'native'

function normalizeAppearance(value: unknown): UsageDisplayAppearance {
  if (value === 'sky' || value === 'default') return 'sky'
  if (value === 'meadow' || value === 'dark') return 'meadow'
  if (value === 'sunset' || value === 'blur') return 'sunset'
  if (value === 'native') return 'native'
  return 'sky'
}
```

Use `normalizeAppearance(value.appearance) === value.appearance` in `isValidConfig`, add `{ id: 'native', label: '苹果原生风' }` to `usageAppearances`, change the chooser grid to four tracks, and add a neutral translucent native thumbnail with no gradient.

- [ ] **Step 4: Run focused tests and verify they pass**

Run the Task 1 command again. Expected: all selected tests pass.

### Task 2: Add The Native Landscape Content Variant

**Files:**
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/ExternalUsageDetailCard.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/BalanceOverview.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/ExternalSubscriptionOverview.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/shared/quota-float-themes.css`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`

- [ ] **Step 1: Write failing landscape assertions**

Add native cases that assert the shared card is marked as landscape, balance has no quota track, and subscription rows remain ordered:

```ts
expect(wrapper.get('[data-testid="external-usage-detail-card"]').classes()).toContain('native-landscape')
expect(wrapper.find('[data-testid="balance-overview"] .quota-track').exists()).toBe(false)
expect(wrapper.findAll('[data-testid="usage-quota-row"]')).toHaveLength(2)
```

In the menu-bar test, set `appearance: 'native'` and assert the same `native-landscape` class.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
cd clients/desktop
pnpm exec vitest run src/features/usage-display/external/macos/floating-window/FloatingUsageCard.spec.ts src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts
```

Expected: failure because the native landscape marker and layout do not exist.

- [ ] **Step 3: Implement the landscape branch**

Bind a dedicated class without changing other appearances:

```vue
<section
  class="external-usage-detail-card"
  :class="{ 'native-landscape': appearance === 'native' }"
  :data-appearance="appearance"
>
```

Add `[data-appearance='native']` tokens with a neutral readable fallback and no themed gradient or `backdrop-filter`. Under `.native-landscape`, use a 468 by 276 shell, a horizontal header, a two- or three-column quota grid, compact 7-pixel progress tracks, and bottom-right expiration. Keep `.balance-overview` as a dominant available balance plus a three-column consumption grid with no progress element.

- [ ] **Step 4: Run focused tests and verify they pass**

Run the Task 2 command again. Expected: all selected tests pass and existing appearance assertions remain green.

### Task 3: Add Native Compact Orb, Capsule, And Internal Previews

**Files:**
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/macos-floating-window.css`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.vue`
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplaySettingsForm.spec.ts`

- [ ] **Step 1: Write failing native compact-state tests**

Add parameterized balance and subscription cases with `appearance = 'native'`. Assert the orb and bar retain the existing compact values, and add structural assertions for native preview hooks:

```ts
expect(wrapper.get('[data-testid="floating-usage-orb"]').attributes('data-appearance')).toBe('native')
expect(wrapper.get('[data-testid="floating-usage-bar"]').text()).toContain('剩余额度')
expect(settings.get('[data-testid="usage-floating-bar-preview"]').attributes('data-appearance')).toBe('native')
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
cd clients/desktop
pnpm exec vitest run src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts src/features/usage-display/internal/settings/UsageDisplaySettingsForm.spec.ts
```

Expected: native type or preview-style assertions fail.

- [ ] **Step 3: Implement isolated native compact styles**

Add rules that override only native elements:

```css
.floating-usage-orb[data-appearance='native'],
.floating-usage-bar[data-appearance='native'] {
  background: rgba(246, 248, 250, 0.28);
  border: 0;
  box-shadow: none;
  color: rgba(25, 31, 38, 0.86);
}

.floating-usage-bar[data-appearance='native'] {
  width: 196px;
  height: 44px;
  border-radius: 22px;
}
```

Keep the native orb at 68 by 68 with a circular radius. Add matching neutral preview overrides inside the internal settings component; do not import external CSS into the settings dialog.

- [ ] **Step 4: Run focused tests and verify they pass**

Run the Task 3 command again. Expected: all selected tests pass.

### Task 4: Implement Appearance-Specific Native Window Geometry And Vibrancy

**Files:**
- Modify: `clients/desktop/src-tauri/src/usage_display/mod.rs`
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/floating_window.rs`

- [ ] **Step 1: Write failing Rust unit tests**

Add pure appearance and geometry assertions:

```rust
#[test]
fn native_floating_sizes_match_visible_surfaces() {
    assert_eq!(collapsed_logical_size(FloatingStyle::Orb, Appearance::Native), (68.0, 68.0));
    assert_eq!(collapsed_logical_size(FloatingStyle::Bar, Appearance::Native), (196.0, 44.0));
    assert_eq!(expanded_logical_size(Appearance::Native), (468.0, 276.0));
}

#[test]
fn themed_floating_sizes_keep_shadow_gutters() {
    assert_eq!(collapsed_logical_size(FloatingStyle::Orb, Appearance::Sky), (88.0, 88.0));
    assert_eq!(collapsed_logical_size(FloatingStyle::Bar, Appearance::Sky), (176.0, 52.0));
    assert_eq!(expanded_logical_size(Appearance::Sky), (352.0, 352.0));
}
```

Add validation assertions that `native` parses and invalid strings fail. Add a pure material-action test that maps `native` to apply and all old themes to clear.

- [ ] **Step 2: Run Rust tests and verify they fail**

Run:

```bash
cd clients/desktop/src-tauri
cargo test usage_display --lib
```

Expected: compilation failure because `Appearance`, appearance-dependent geometry, and material action are not implemented.

- [ ] **Step 3: Add typed appearance and material helpers**

Introduce one Rust enum in `usage_display/mod.rs`:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Appearance {
    Sky,
    Meadow,
    Sunset,
    Native,
}

impl Appearance {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "sky" => Ok(Self::Sky),
            "meadow" => Ok(Self::Meadow),
            "sunset" => Ok(Self::Sunset),
            "native" => Ok(Self::Native),
            _ => Err("未知的用量展示样式".to_string()),
        }
    }
}
```

Pass `Appearance` to both macOS surface configurators. In a focused helper, always call `clear_vibrancy` first; for `Native`, call:

```rust
window_vibrancy::apply_vibrancy(
    window,
    window_vibrancy::NSVisualEffectMaterial::Popover,
    Some(window_vibrancy::NSVisualEffectState::Active),
    Some(radius),
)
```

Treat application failure as non-fatal so the CSS fallback remains visible.

- [ ] **Step 4: Implement appearance-specific sizing and transition order**

Store `Appearance` in `FloatingWindowState`. Use exact logical sizes:

```rust
const fn collapsed_logical_size(style: FloatingStyle, appearance: Appearance) -> (f64, f64) {
    match (style, appearance) {
        (FloatingStyle::Orb, Appearance::Native) => (68.0, 68.0),
        (FloatingStyle::Bar, Appearance::Native) => (196.0, 44.0),
        (FloatingStyle::Orb, _) => (88.0, 88.0),
        (FloatingStyle::Bar, _) => (176.0, 52.0),
    }
}

const fn expanded_logical_size(appearance: Appearance) -> (f64, f64) {
    match appearance {
        Appearance::Native => (468.0, 276.0),
        _ => (352.0, 352.0),
    }
}
```

On configure, expand, and collapse, resize before rendering the next Vue state and reapply radius 34 for the native orb, radius 22 for the native bar, or radius 23 for the native landscape window. For old appearances, clear Vibrancy and preserve the current sizes. Set the menu-bar popover to 468 by 276 only for native and restore 352 by 352 for other appearances.

- [ ] **Step 5: Run Rust tests and verify they pass**

Run the Task 4 command again. Expected: all usage-display Rust tests pass.

### Task 5: Complete Integration Coverage And Build Verification

**Files:**
- Modify: `clients/desktop/src/features/usage-display/external/macos/floating-window/MacOSFloatingWindow.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/external/macos/menu-bar/MacOSMenuBarPopover.spec.ts`
- Modify: `clients/desktop/src/features/usage-display/internal/settings/UsageDisplayDialog.spec.ts`
- Verify: all files listed above.

- [ ] **Step 1: Remove stale three-value test unions**

Replace local test-only unions such as:

```ts
appearance: 'sky' as 'sky' | 'meadow' | 'sunset'
```

with the exported `UsageDisplayAppearance` type or include `native`. Do not weaken assertions with `as never` when the production type is available.

- [ ] **Step 2: Run the focused usage-display frontend suite**

Run:

```bash
cd clients/desktop
pnpm exec vitest run src/features/usage-display
```

Expected: all usage-display tests pass.

- [ ] **Step 3: Run Rust formatting and tests**

Run:

```bash
cd clients/desktop/src-tauri
cargo fmt --check
cargo test usage_display --lib
```

Expected: formatting check and all usage-display tests pass.

- [ ] **Step 4: Run frontend build checks**

Run:

```bash
cd clients/desktop
pnpm exec vite build
pnpm build
```

Expected: direct Vite build passes. If `pnpm build` fails only in unrelated dirty admin modules, capture the exact errors and verify that no error points to a usage-display file.

- [ ] **Step 5: Launch and inspect the native macOS dev client**

Run:

```bash
cd clients/desktop
pnpm tauri dev
```

Verify on the real client:

- native orb is circular and 68 by 68;
- native bar is a 196 by 44 system capsule;
- balance and subscription compact values both fit;
- floating expansion is a 468 by 276 landscape card;
- menu-bar click opens a 468 by 276 landscape popover;
- switching back to sky, meadow, or sunset removes Vibrancy and restores square geometry;
- rapid source, subscription, appearance, and floating-form switches do not produce black corners, transparent disappearance, or clipped content.

- [ ] **Step 6: Review the final diff and commit only feature files**

Run:

```bash
git diff --check
git status --short
git diff -- clients/desktop/src/features/usage-display clients/desktop/src-tauri/src/usage_display
```

Stage only the files in this plan. Do not stage `.superpowers/`, backend/admin work, icons, or unrelated layout changes. Commit with:

```bash
git commit -m "feat(desktop): add native macOS usage appearance"
```
