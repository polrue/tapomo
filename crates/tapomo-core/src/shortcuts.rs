//! Shortcut counter, phase A (0.3.6): Ctrl/Alt/Win + key combinations reduced on the spot to one of
//! five kinds. Which key it was is dropped right here, inside the keyboard hook: only the kind and
//! a daily count are ever kept. AltGr (Ctrl+Alt) and Shift+letter are typing, not shortcuts.

/// What kind of shortcut was used.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ShortcutKind {
    /// Ctrl+C, Ctrl+V, Ctrl+X (and Ctrl+Insert / Shift+Insert are not counted: they have no Ctrl/Alt/Win+letter shape).
    Clipboard,
    /// Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z.
    Undo,
    /// Ctrl+S.
    Save,
    /// Alt+Tab, Alt+F4 and any Win+key.
    Windows,
    /// Every other Ctrl/Alt/Win combination. Which one is never recorded.
    Other,
}

impl ShortcutKind {
    pub const ALL: [ShortcutKind; 5] = [Self::Clipboard, Self::Undo, Self::Save, Self::Windows, Self::Other];

    /// Stable id, stored in the database and used as the i18n key suffix.
    pub fn id(self) -> &'static str {
        match self {
            Self::Clipboard => "clipboard",
            Self::Undo => "undo",
            Self::Save => "save",
            Self::Windows => "windows",
            Self::Other => "other",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|k| k.id() == id)
    }
}

const VK_BACK: u32 = 0x08;
const VK_TAB: u32 = 0x09;
const VK_SHIFT: u32 = 0x10;
const VK_CONTROL: u32 = 0x11;
const VK_MENU: u32 = 0x12;
const VK_F4: u32 = 0x73;
const VK_LWIN: u32 = 0x5B;
const VK_RWIN: u32 = 0x5C;
const VK_APPS: u32 = 0x5D;
/// Left/right Shift, Ctrl and Alt.
const VK_SIDED_MODIFIERS: std::ops::RangeInclusive<u32> = 0xA0..=0xA5;

/// The kind of a key-down with these modifiers held, or `None` if it is not a shortcut.
/// `vk` is a Windows virtual-key code; layouts that move letters (AZERTY, QWERTZ) keep their codes.
pub fn classify(vk: u32, ctrl: bool, alt: bool, win: bool, shift: bool) -> Option<ShortcutKind> {
    let is_modifier = matches!(vk, VK_SHIFT | VK_CONTROL | VK_MENU | VK_LWIN | VK_RWIN | VK_APPS) || VK_SIDED_MODIFIERS.contains(&vk);
    // AltGr arrives as Ctrl+Alt: it types @ # € [ ] on many layouts.
    let alt_gr = ctrl && alt && !win;
    if is_modifier || alt_gr || !(ctrl || alt || win) {
        return None;
    }
    // Ctrl+Backspace deletes a word: it is measured as typing.
    if ctrl && !alt && !win && vk == VK_BACK {
        return None;
    }
    if win {
        return Some(ShortcutKind::Windows);
    }
    if alt && !ctrl && (vk == VK_TAB || vk == VK_F4) {
        return Some(ShortcutKind::Windows);
    }
    if ctrl && !alt {
        let kind = match (vk, shift) {
            (0x43 | 0x56 | 0x58, false) => Some(ShortcutKind::Clipboard), // C V X
            (0x5A, _) | (0x59, false) => Some(ShortcutKind::Undo),         // Z (Shift+Z = redo) Y
            (0x53, false) => Some(ShortcutKind::Save),                     // S
            _ => None,
        };
        if let Some(k) = kind {
            return Some(k);
        }
    }
    Some(ShortcutKind::Other)
}

/// XP for the shortcuts of one day: 1 per 10, at most [`XP_CAP`].
pub const XP_CAP: u32 = 10;

pub fn shortcut_xp(count: u64) -> u32 {
    (count / 10).min(u64::from(XP_CAP)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use ShortcutKind::*;

    const C: u32 = 0x43;
    const V: u32 = 0x56;
    const Z: u32 = 0x5A;
    const S: u32 = 0x53;
    const N: u32 = 0x4E;
    const E: u32 = 0x45;

    #[test]
    fn the_five_kinds() {
        assert_eq!(classify(C, true, false, false, false), Some(Clipboard));
        assert_eq!(classify(V, true, false, false, false), Some(Clipboard));
        assert_eq!(classify(Z, true, false, false, false), Some(Undo));
        assert_eq!(classify(Z, true, false, false, true), Some(Undo)); // redo
        assert_eq!(classify(S, true, false, false, false), Some(Save));
        assert_eq!(classify(VK_TAB, false, true, false, false), Some(Windows));
        assert_eq!(classify(VK_F4, false, true, false, false), Some(Windows));
        assert_eq!(classify(E, false, false, true, false), Some(Windows)); // Win+E
        assert_eq!(classify(N, true, false, false, true), Some(Other)); // Ctrl+Shift+N (incognito): just "other"
        assert_eq!(classify(0x54, true, false, false, false), Some(Other)); // Ctrl+T
        assert_eq!(classify(C, true, false, false, true), Some(Other)); // Ctrl+Shift+C is not copy
    }

    #[test]
    fn typing_is_not_a_shortcut() {
        assert_eq!(classify(E, false, false, false, false), None);
        assert_eq!(classify(E, false, false, false, true), None); // Shift+E
        assert_eq!(classify(0x32, true, true, false, false), None); // AltGr+2 = @
        assert_eq!(classify(VK_BACK, true, false, false, false), None); // Ctrl+Backspace
        assert_eq!(classify(VK_CONTROL, true, false, false, false), None); // the modifier itself
        assert_eq!(classify(0xA2, true, false, false, false), None); // left Ctrl
        assert_eq!(classify(VK_LWIN, false, false, true, false), None); // Win alone
    }

    #[test]
    fn ids_round_trip() {
        for k in ShortcutKind::ALL {
            assert_eq!(ShortcutKind::from_id(k.id()), Some(k));
        }
        assert_eq!(ShortcutKind::from_id("ctrl+c"), None);
    }

    #[test]
    fn xp_is_capped() {
        assert_eq!(shortcut_xp(9), 0);
        assert_eq!(shortcut_xp(57), 5);
        assert_eq!(shortcut_xp(10_000), XP_CAP);
    }
}
