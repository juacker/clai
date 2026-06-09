//! OS-backed local execution sandboxing.

pub mod profile;
pub mod runner;

#[cfg(target_os = "linux")]
mod linux_bwrap;
#[cfg(any(target_os = "macos", all(test, target_family = "unix")))]
mod macos_seatbelt;
#[cfg(not(any(target_os = "linux", target_os = "macos")))]
mod unsupported;

pub use profile::{
    SandboxEnv, SandboxNetworkMode, SandboxPathAccess, SandboxPathGrant, SandboxProfile,
    SandboxSessionBusMode,
};
pub use runner::{run_command, SandboxCommand, SandboxCommandOutput};
