# Desktop Menu-Bar Quota Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the macOS subscription status-item bullet with a preserved-color quota ring while keeping balance display on the adaptive LinAI template icon.

**Architecture:** Keep all behavior in the existing native macOS menu-bar module. Parse the current tray title into either a balance or subscription presentation, generate the subscription ring as a pure RGBA raster for deterministic tests, and atomically switch the Tauri tray icon together with its template flag so source changes cannot flicker or retain stale styling.

**Tech Stack:** Rust, Tauri 2 tray API, AppKit status-item bridge, Cargo unit tests.

---

### Task 1: Specify The Ring Raster And Presentation

**Files:**
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`
- Test: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`

- [ ] **Step 1: Replace the old bullet expectations with failing ring presentation tests**

Update the compact metric test to require subscription text without `●` or `○` and an inspectable ring presentation:

```rust
#[test]
fn usage_display_builds_balance_and_subscription_ring_presentations() {
    let balance = tray_metric_presentation("$128.60");
    assert_eq!(balance.text, "$128.60");
    assert_eq!(balance.icon, TrayMetricIcon::TemplateMark);

    let subscription = tray_metric_presentation("73%");
    assert_eq!(subscription.text, "73%");
    assert_eq!(subscription.icon, TrayMetricIcon::QuotaRing {
        percent: 73,
        color: quota_metric_color(73),
    });
}
```

Add raster assertions covering all three progress states:

```rust
#[test]
fn quota_ring_raster_distinguishes_empty_partial_and_full_progress() {
    let empty = quota_ring_rgba(0, quota_metric_color(0));
    let partial = quota_ring_rgba(45, quota_metric_color(45));
    let full = quota_ring_rgba(100, quota_metric_color(100));

    assert_eq!(empty.len(), RING_ICON_PIXELS * RING_ICON_PIXELS * 4);
    assert_eq!(pixel_rgb_at(&empty, 18, 3), (255, 255, 255));
    assert_eq!(pixel_rgb_at(&partial, 32, 18), quota_metric_color(45));
    assert_eq!(pixel_rgb_at(&partial, 3, 18), (255, 255, 255));
    assert_eq!(pixel_rgb_at(&full, 3, 18), quota_metric_color(100));
    assert_eq!(pixel_at(&full, 18, 18)[3], 0);
}
```

- [ ] **Step 2: Run the targeted tests and verify RED**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display_builds_balance_and_subscription_ring_presentations -- --nocapture
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml quota_ring_raster_distinguishes_empty_partial_and_full_progress -- --nocapture
```

Expected: compilation/test failure because `TrayMetricIcon`, `quota_ring_rgba`, and pixel probe helpers do not exist and current subscription text still contains a bullet.

- [ ] **Step 3: Implement the minimal pure presentation and raster functions**

Use a 36-pixel backing bitmap displayed by tray-icon at 18 logical pixels. Render a transparent center, a translucent white annular track, and an anti-aliased clockwise arc starting at twelve o'clock:

```rust
#[derive(Debug, PartialEq, Eq)]
enum TrayMetricIcon {
    TemplateMark,
    QuotaRing { percent: u8, color: (u8, u8, u8) },
}

#[derive(Debug, PartialEq, Eq)]
struct TrayMetricPresentation {
    text: String,
    icon: TrayMetricIcon,
}

fn tray_metric_presentation(title: &str) -> TrayMetricPresentation {
    let trimmed = title.trim();
    let percentage = trimmed
        .strip_suffix('%')
        .and_then(|value| value.parse::<u8>().ok())
        .map(|value| value.min(100));
    match percentage {
        Some(percent) => TrayMetricPresentation {
            text: format!("{percent}%"),
            icon: TrayMetricIcon::QuotaRing {
                percent,
                color: quota_metric_color(percent),
            },
        },
        None => TrayMetricPresentation {
            text: trimmed.to_string(),
            icon: TrayMetricIcon::TemplateMark,
        },
    }
}

const RING_ICON_PIXELS: usize = 36;
const RING_SUPERSAMPLE: usize = 4;
const RING_TRACK_RGBA: [u8; 4] = [255, 255, 255, 118];

#[cfg(test)]
fn pixel_at(rgba: &[u8], x: usize, y: usize) -> [u8; 4] {
    let offset = (y * RING_ICON_PIXELS + x) * 4;
    rgba[offset..offset + 4].try_into().expect("valid ring pixel")
}

#[cfg(test)]
fn pixel_rgb_at(rgba: &[u8], x: usize, y: usize) -> (u8, u8, u8) {
    let pixel = pixel_at(rgba, x, y);
    (pixel[0], pixel[1], pixel[2])
}

fn quota_ring_rgba(percent: u8, color: (u8, u8, u8)) -> Vec<u8> {
    let percent = percent.min(100);
    let mut rgba = vec![0; RING_ICON_PIXELS * RING_ICON_PIXELS * 4];
    let center = RING_ICON_PIXELS as f64 / 2.0;
    let progress_angle = std::f64::consts::TAU * percent as f64 / 100.0;
    let sample_count = (RING_SUPERSAMPLE * RING_SUPERSAMPLE) as f64;

    for y in 0..RING_ICON_PIXELS {
        for x in 0..RING_ICON_PIXELS {
            let mut track_samples = 0_u8;
            let mut arc_samples = 0_u8;
            for sample_y in 0..RING_SUPERSAMPLE {
                for sample_x in 0..RING_SUPERSAMPLE {
                    let px = x as f64 + (sample_x as f64 + 0.5) / RING_SUPERSAMPLE as f64;
                    let py = y as f64 + (sample_y as f64 + 0.5) / RING_SUPERSAMPLE as f64;
                    let dx = px - center;
                    let dy = py - center;
                    let radius = dx.hypot(dy);
                    if !(11.5..=15.5).contains(&radius) {
                        continue;
                    }
                    track_samples += 1;
                    let mut angle = dy.atan2(dx) + std::f64::consts::FRAC_PI_2;
                    if angle < 0.0 {
                        angle += std::f64::consts::TAU;
                    }
                    if percent == 100 || (percent > 0 && angle <= progress_angle) {
                        arc_samples += 1;
                    }
                }
            }

            let offset = (y * RING_ICON_PIXELS + x) * 4;
            if track_samples > 0 {
                rgba[offset..offset + 4].copy_from_slice(&[
                    RING_TRACK_RGBA[0],
                    RING_TRACK_RGBA[1],
                    RING_TRACK_RGBA[2],
                    (RING_TRACK_RGBA[3] as f64 * track_samples as f64 / sample_count).round() as u8,
                ]);
            }
            if arc_samples > 0 {
                rgba[offset..offset + 4].copy_from_slice(&[
                    color.0,
                    color.1,
                    color.2,
                    (255.0 * arc_samples as f64 / sample_count).round() as u8,
                ]);
            }
        }
    }
    rgba
}
```

Update `tray_metric_presentation` so a percentage becomes `QuotaRing` and its visible title contains only the percentage. Non-percentage balance values remain `TemplateMark`.

- [ ] **Step 4: Run the targeted tests and verify GREEN**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display::macos::menu_bar::tests -- --nocapture
```

Expected: all menu-bar unit tests pass, including empty, partial, and full ring rasterization.

- [ ] **Step 5: Commit the pure ring behavior**

```bash
git add clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs
git commit -m "feat(desktop): render subscription quota ring"
```

### Task 2: Apply The Correct Native Icon Mode

**Files:**
- Modify: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`
- Test: `clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs`

- [ ] **Step 1: Add a failing icon-mode contract test**

Extract an inspectable native icon update description and test both source modes:

```rust
#[test]
fn native_icon_update_switches_template_mode_by_usage_source() {
    let balance_presentation = tray_metric_presentation("$128.60");
    let balance = native_icon_update(&balance_presentation.icon);
    assert!(balance.is_template);
    assert_eq!(balance.title_color, NativeTitleColor::Secondary);

    let subscription_presentation = tray_metric_presentation("45%");
    let subscription = native_icon_update(&subscription_presentation.icon);
    assert!(!subscription.is_template);
    assert_eq!(subscription.title_color, NativeTitleColor::Adaptive);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml native_icon_update_switches_template_mode_by_usage_source -- --nocapture
```

Expected: compilation failure because `native_icon_update` and its icon-mode contract do not exist.

- [ ] **Step 3: Atomically switch tray image and template status**

Add the pure icon-mode contract:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NativeTitleColor {
    Secondary,
    Adaptive,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct NativeIconUpdate {
    is_template: bool,
    title_color: NativeTitleColor,
}

fn native_icon_update(icon: &TrayMetricIcon) -> NativeIconUpdate {
    match icon {
        TrayMetricIcon::TemplateMark => NativeIconUpdate {
            is_template: true,
            title_color: NativeTitleColor::Secondary,
        },
        TrayMetricIcon::QuotaRing { .. } => NativeIconUpdate {
            is_template: false,
            title_color: NativeTitleColor::Adaptive,
        },
    }
}
```

Extract the existing app mark conversion so it can be restored after subscription mode:

```rust
#[cfg(target_os = "macos")]
fn template_app_icon(app: &tauri::AppHandle) -> Result<tauri::image::Image<'static>, String> {
    let app_icon = app
        .default_window_icon()
        .ok_or_else(|| "应用图标不可用".to_string())?;
    Ok(tauri::image::Image::new_owned(
        tray_template_rgba(app_icon.rgba()),
        app_icon.width(),
        app_icon.height(),
    ))
}
```

Change `apply_native_metric` to accept the app handle, derive the presentation, and call `set_icon_with_as_template` once per update:

```rust
match presentation.icon {
    TrayMetricIcon::TemplateMark => {
        let icon = template_app_icon(app)?;
        tray.set_icon_with_as_template(Some(icon), true)?;
    }
    TrayMetricIcon::QuotaRing { percent, color } => {
        let icon = tauri::image::Image::new_owned(
            quota_ring_rgba(percent, color),
            RING_ICON_PIXELS as u32,
            RING_ICON_PIXELS as u32,
        );
        tray.set_icon_with_as_template(Some(icon), false)?;
    }
}
```

Set the native title to the presentation text. Use `NSColor::secondaryLabelColor()` for balance and `NSColor::labelColor()` for subscription so the percentage remains adaptive. Update `build`, `configure`, and `set_title` to pass the app handle. Keep the stable `autosaveName`, click handling, and popover positioning unchanged.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml usage_display::macos::menu_bar::tests -- --nocapture
cargo test --manifest-path clients/desktop/src-tauri/Cargo.toml
cargo fmt --manifest-path clients/desktop/src-tauri/Cargo.toml -- --check
pnpm --dir clients/desktop test:run
pnpm --dir clients/desktop build
git diff --check
```

Expected: all Rust and Vue tests pass, the desktop production build succeeds, and formatting/diff checks report no errors.

- [ ] **Step 5: Verify the native menu-bar result**

Launch desktop dev mode, select subscription usage, and inspect 0%, a middle value, and 100% where available. Confirm the ring remains colored/non-template, the track is light rather than black, the percentage sits to its right, the popover still opens on click, and switching back to balance restores the LinAI template mark.

- [ ] **Step 6: Commit and push**

```bash
git add clients/desktop/src-tauri/src/usage_display/macos/menu_bar.rs
git commit -m "fix(desktop): preserve menu bar quota ring colors"
git push origin main
git push gitee main
```
