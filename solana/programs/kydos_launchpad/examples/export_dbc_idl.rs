//! Uses Anchor's compiler-backed IDL builder without installing anchor-cli.
//! Run with --features idl-build. Writes build artifacts, never the browser IDL.
#[cfg(feature="idl-build")]
fn main() -> Result<(),Box<dyn std::error::Error>> {
    // IdlBuilder 0.1.4's toolchain override uses a literal +{toolchain} argument.
    // The workspace rust-toolchain.toml remains authoritative for its subprocess.
    std::env::remove_var("RUSTUP_TOOLCHAIN");
    let program=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let output=program.join("../../target/idl/kydos_launchpad.json");
    let idl=anchor_lang::idl::build::IdlBuilder::new().program_path(program)
        .cargo_args(vec!["--locked".into()]).build()?;
    std::fs::create_dir_all(output.parent().unwrap())?;
    std::fs::write(output,serde_json::to_string_pretty(&idl)?+"\n")?;
    Ok(())
}
#[cfg(not(feature="idl-build"))]
fn main() {panic!("IDL export requires --features idl-build");}
