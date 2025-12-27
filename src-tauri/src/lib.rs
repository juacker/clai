// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod chat;

use chat::ChatStorage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ChatStorage::new())
        .invoke_handler(tauri::generate_handler![
            chat::list_chats,
            chat::get_chat,
            chat::create_chat,
            chat::delete_chat,
            chat::update_chat_title,
            chat::send_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
