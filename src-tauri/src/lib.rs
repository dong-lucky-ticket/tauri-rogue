// combat 负责门户条件、敌人寻路、敌人意图和伤害结算。
mod combat;
// commands 暴露 Tauri 命令并持有当前游戏会话。
mod commands;
// map 负责可复现的房间、走廊和可行走网格生成。
mod map;
// state 定义 Rust 与前端共享的序列化数据结构。
mod state;

// 创建 Tauri 应用、注册共享状态和前端可调用的命令。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Builder 负责组装 Tauri 应用；manage 将单例游戏会话注入所有命令。
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(commands::GameSession::default()))
        // opener 插件提供桌面端打开外部资源的能力，当前由模板初始化。
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // 创建或重置第一关。
            commands::new_dungeon,
            // 提交一次玩家移动或攻击动作。
            commands::player_action,
            // 推进一个敌人回合阶段。
            commands::advance_turn_phase,
            // 进入已经激活门户连接的下一关。
            commands::next_level
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
