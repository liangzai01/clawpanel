// ClawInstaller 入口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    claw_installer_lib::run()
}
