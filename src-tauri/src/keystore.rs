//! Optional database encryption (0.6.1): SQLCipher with a random 256-bit key, kept next to the database
//! in `tapomo.key` and protected with Windows DPAPI (only the same Windows user can unprotect it).
//!
//! Turning it on exports the plain database into an encrypted copy, which replaces the original on the
//! next start (Tapomo restarts itself). SQLCipher reads unencrypted databases too, so nothing changes
//! for people who leave it off.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

pub fn key_path(db: &Path) -> PathBuf {
    db.with_extension("key")
}

fn pending_db(db: &Path) -> PathBuf {
    db.with_extension("enc.db")
}

fn pending_key(db: &Path) -> PathBuf {
    db.with_extension("key.pending")
}

fn hex(key: &[u8]) -> String {
    key.iter().map(|b| format!("{b:02x}")).collect()
}

/// The `PRAGMA key` value for a raw key (no key derivation: the key is already random).
fn key_literal(key: &[u8]) -> String {
    format!("\"x'{}'\"", hex(key))
}

/// 32 random bytes from the OS.
pub fn random_key() -> io::Result<[u8; 32]> {
    let mut k = [0u8; 32];
    getrandom::getrandom(&mut k).map_err(|e| io::Error::other(e.to_string()))?;
    Ok(k)
}

#[cfg(windows)]
mod dpapi {
    use std::io;

    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB};

    fn run(data: &[u8], protect: bool) -> io::Result<Vec<u8>> {
        let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
        let mut out = CRYPT_INTEGER_BLOB::default();
        // SAFETY: input points at `data` for the duration of the call; the output buffer is
        // allocated by Windows and released with LocalFree below.
        unsafe {
            if protect {
                CryptProtectData(&input, windows::core::w!("Tapomo"), None, None, None, 0, &mut out)
            } else {
                CryptUnprotectData(&input, None, None, None, None, 0, &mut out)
            }
            .map_err(|e| io::Error::other(e.to_string()))?;
            let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
            let _ = LocalFree(HLOCAL(out.pbData as *mut core::ffi::c_void));
            Ok(bytes)
        }
    }

    pub fn protect(data: &[u8]) -> io::Result<Vec<u8>> {
        run(data, true)
    }

    pub fn unprotect(data: &[u8]) -> io::Result<Vec<u8>> {
        run(data, false)
    }
}

/// Outside Windows (development and tests only) the key file is not protected.
#[cfg(not(windows))]
mod dpapi {
    pub fn protect(data: &[u8]) -> std::io::Result<Vec<u8>> {
        Ok(data.to_vec())
    }
    pub fn unprotect(data: &[u8]) -> std::io::Result<Vec<u8>> {
        Ok(data.to_vec())
    }
}

/// The key of an encrypted database, if it is encrypted.
pub fn load(db: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(key_path(db)) {
        Ok(blob) => dpapi::unprotect(&blob).map(Some),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Unlocks a freshly opened connection, before anything else touches it.
pub fn unlock(conn: &Connection, key: &[u8]) -> rusqlite::Result<()> {
    conn.execute_batch(&format!("PRAGMA key = {};", key_literal(key)))
}

pub fn is_encrypted(db: &Path) -> bool {
    key_path(db).exists()
}

/// Writes an encrypted copy of the open (plain) database and a pending key. Both replace the
/// originals on the next start (see [`finish_pending`]).
pub fn prepare(conn: &Connection, db: &Path) -> io::Result<()> {
    let key = random_key()?;
    let out = pending_db(db);
    // Leftovers of an earlier attempt must never pair with this copy.
    let _ = fs::remove_file(&out);
    let _ = fs::remove_file(pending_key(db));
    let result = (|| -> rusqlite::Result<()> {
        // sqlcipher_export copies tables and data but not the schema version, which migrate() relies on.
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        conn.execute(&format!("ATTACH DATABASE ?1 AS enc KEY {}", key_literal(&key)), [out.to_string_lossy()])?;
        let exported = conn
            .query_row("SELECT sqlcipher_export('enc')", [], |_| Ok(()))
            .and_then(|()| conn.execute_batch(&format!("PRAGMA enc.user_version = {version};")));
        conn.execute_batch("DETACH DATABASE enc;")?;
        exported?;
        // The copy must open with the key, at the right version, before we commit to it.
        let check = Connection::open(&out)?;
        unlock(&check, &key)?;
        let copied: i64 = check.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        check.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get::<_, i64>(0))?;
        if copied != version {
            return Err(rusqlite::Error::InvalidQuery);
        }
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&out);
        return Err(io::Error::other(e));
    }
    fs::write(pending_key(db), dpapi::protect(&key)?)
}

/// On start, before opening: swap in a pending encrypted copy. Returns true if it did.
pub fn finish_pending(db: &Path) -> io::Result<bool> {
    let (enc, key) = (pending_db(db), pending_key(db));
    // A previous swap stopped between the two renames (power cut): the encrypted database is
    // already in place and only the key is left to move.
    if !enc.exists() && key.exists() {
        fs::rename(&key, key_path(db))?;
        return Ok(true);
    }
    if !(enc.exists() && key.exists()) {
        // An abandoned export without its key (or the reverse) is useless: clean it up.
        let _ = fs::remove_file(&enc);
        return Ok(false);
    }
    for ext in ["db-wal", "db-shm"] {
        let _ = fs::remove_file(db.with_extension(ext));
    }
    fs::rename(&enc, db)?;
    fs::rename(&key, key_path(db))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_then_reopen_with_the_key_only() {
        let dir = std::env::temp_dir().join(format!("tapomo-ks-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("tapomo.db");
        {
            let conn = crate::db::open(&db).unwrap();
            crate::db::set_raw(&conn, "marker", "hello").unwrap();
            assert!(!is_encrypted(&db));
            prepare(&conn, &db).unwrap();
        }
        assert!(finish_pending(&db).unwrap());
        assert!(is_encrypted(&db));
        // Without the key the file is unreadable…
        let raw = Connection::open(&db).unwrap();
        assert!(raw.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get::<_, i64>(0)).is_err());
        // …and through db::open (which unlocks it) the data is all there.
        let conn = crate::db::open(&db).unwrap();
        assert_eq!(crate::db::get_raw(&conn, "marker").unwrap().as_deref(), Some("hello"));
        let bytes = fs::read(&db).unwrap();
        assert!(!bytes.windows(5).any(|w| w == b"hello"), "plain text must not appear in the file");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_swap_interrupted_between_renames_is_finished() {
        let dir = std::env::temp_dir().join(format!("tapomo-ks2-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("tapomo.db");
        {
            let conn = crate::db::open(&db).unwrap();
            crate::db::set_raw(&conn, "marker", "x").unwrap();
            prepare(&conn, &db).unwrap();
        }
        // Simulate the crash: the database was renamed, the key was not.
        fs::rename(pending_db(&db), &db).unwrap();
        assert!(finish_pending(&db).unwrap());
        let conn = crate::db::open(&db).unwrap();
        assert_eq!(crate::db::get_raw(&conn, "marker").unwrap().as_deref(), Some("x"));
        let _ = fs::remove_dir_all(&dir);
    }
}
