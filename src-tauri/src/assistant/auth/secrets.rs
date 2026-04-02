use keyring::Entry;

const SERVICE_NAME: &str = "com.juacker.clai.providers";
const MCP_SERVICE_NAME: &str = "com.juacker.clai.mcp";

fn entry_for(service_name: &str, secret_ref: &str) -> Result<Entry, keyring::Error> {
    Entry::new(service_name, secret_ref)
}

pub struct ProviderSecretStorage;

impl ProviderSecretStorage {
    fn entry(secret_ref: &str) -> Result<Entry, keyring::Error> {
        entry_for(SERVICE_NAME, secret_ref)
    }

    pub fn set_secret(secret_ref: &str, secret: &str) -> Result<(), keyring::Error> {
        let entry = Self::entry(secret_ref)?;
        entry.set_password(secret)
    }

    #[allow(dead_code)]
    pub fn get_secret(secret_ref: &str) -> Result<Option<String>, keyring::Error> {
        let entry = Self::entry(secret_ref)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn clear_secret(secret_ref: &str) -> Result<(), keyring::Error> {
        let entry = Self::entry(secret_ref)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error),
        }
    }
}

pub struct McpSecretStorage;

impl McpSecretStorage {
    fn entry(secret_ref: &str) -> Result<Entry, keyring::Error> {
        entry_for(MCP_SERVICE_NAME, secret_ref)
    }

    pub fn set_secret(secret_ref: &str, secret: &str) -> Result<(), keyring::Error> {
        let entry = Self::entry(secret_ref)?;
        entry.set_password(secret)
    }

    pub fn get_secret(secret_ref: &str) -> Result<Option<String>, keyring::Error> {
        let entry = Self::entry(secret_ref)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn clear_secret(secret_ref: &str) -> Result<(), keyring::Error> {
        let entry = Self::entry(secret_ref)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error),
        }
    }
}
