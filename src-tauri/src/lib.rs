mod combat;
mod commands;
mod map;
mod state;

// 创建 Tauri 应用、注册共享状态和前端可调用的命令。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(commands::GameSession::default()))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::new_dungeon,
            commands::player_action,
            commands::advance_turn_phase,
            commands::next_level
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
