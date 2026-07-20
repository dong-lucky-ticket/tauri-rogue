// 发布版本在 Windows 上隐藏额外的控制台窗口，请勿删除。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 桌面端入口委托给库中的统一启动函数。
    my_roguelike_lib::run()
}
