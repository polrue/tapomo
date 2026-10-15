//! Supporter codes ("código de mecenas", 0.7.0). A code is signed with Pol's ed25519 key
//! (packaging/supporter/make-code.mjs) and checked here offline. It only unlocks cosmetic thanks:
//! the «Mecenas» skin and badge. Nothing in Tapomo is ever locked behind it.

use ring::signature::{UnparsedPublicKey, ED25519};
use rusqlite::Connection;

use crate::db;

/// Public half of the signing key (packaging/supporter/public.hex).
const PUBLIC_KEY: [u8; 32] = hex32("19158f464c54faabde02552ba8c4af1e05fad8032f34de968d476ad90f4545de");

const fn hex32(s: &str) -> [u8; 32] {
    let b = s.as_bytes();
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        out[i] = (nib(b[2 * i]) << 4) | nib(b[2 * i + 1]);
        i += 1;
    }
    out
}

const fn nib(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        _ => panic!("bad hex"),
    }
}

fn base64url(s: &str) -> Option<Vec<u8>> {
    let mut bits = 0u32;
    let mut n = 0;
    let mut out = Vec::new();
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return None,
        };
        bits = (bits << 6) | u32::from(v);
        n += 6;
        if n >= 8 {
            n -= 8;
            out.push((bits >> n) as u8);
        }
    }
    Some(out)
}

/// The supporter number in a valid code, or `None`.
pub fn verify(code: &str) -> Option<u32> {
    let body = code.trim().strip_prefix("TAPOMO-")?;
    let raw = base64url(body)?;
    if raw.len() != 7 + 64 || raw[0] != 1 {
        return None;
    }
    let (payload, sig) = raw.split_at(7);
    UnparsedPublicKey::new(&ED25519, PUBLIC_KEY).verify(payload, sig).ok()?;
    Some(u32::from_be_bytes([payload[1], payload[2], payload[3], payload[4]]))
}

/// Stores a valid code. Returns the supporter number, or `None` (and stores nothing) if invalid.
pub fn redeem(conn: &Connection, code: &str) -> rusqlite::Result<Option<u32>> {
    let Some(n) = verify(code) else { return Ok(None) };
    db::set_raw(conn, "supporter_code", code.trim())?;
    Ok(Some(n))
}

pub fn is_supporter(conn: &Connection) -> rusqlite::Result<bool> {
    Ok(db::get_raw(conn, "supporter_code")?.is_some_and(|c| verify(&c).is_some()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Made with make-code.mjs 1 and the real key.
    const GOOD: &str = "TAPOMO-AQAAAAEKMiAXMoZ-My6vwDA4t7UKGHlCndm5FOSXEg-3q0vFXFEnzGr3iziznCrOkBzs3TWFekMyadjBjnsj_HgdkIwbwg8";

    #[test]
    fn real_codes_pass_and_anything_else_fails() {
        assert_eq!(verify(GOOD), Some(1));
        assert_eq!(verify(&format!("  {GOOD}\n")), Some(1));
        assert_eq!(verify("TAPOMO-hello"), None);
        assert_eq!(verify(""), None);
        // One flipped character breaks the signature.
        let mut bad = GOOD.to_string();
        let last = bad.pop().unwrap();
        bad.push(if last == 'A' { 'B' } else { 'A' });
        assert_eq!(verify(&bad), None);
    }

    #[test]
    fn redeeming_stores_only_valid_codes() {
        let path = std::env::temp_dir().join(format!("tapomo-supporter-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let c = db::open(&path).unwrap();
        assert!(!is_supporter(&c).unwrap());
        assert_eq!(redeem(&c, "TAPOMO-nope").unwrap(), None);
        assert!(!is_supporter(&c).unwrap());
        assert_eq!(redeem(&c, GOOD).unwrap(), Some(1));
        assert!(is_supporter(&c).unwrap());
    }
}
