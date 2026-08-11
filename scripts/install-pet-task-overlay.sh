#!/bin/zsh
# Install/rebuild the visual-only task overlay in a launchd-readable location.
set -eu

project_root="${0:A:h:h}"
support_dir="$HOME/.local/share/xiaobu-pet-task-overlay"
launch_agent="$HOME/Library/LaunchAgents/com.xiaobu.pet-task-overlay.plist"
uid="$(id -u)"

mkdir -p "$support_dir"
/bin/cp "$project_root/macos/PetTaskOverlay/main.swift" "$support_dir/main.swift"
/usr/bin/xcrun swiftc -framework AppKit "$support_dir/main.swift" -o "$support_dir/PetTaskOverlay"
/bin/cp "$project_root/scripts/start-pet-task-overlay.sh" "$HOME/xiaobu-pet-task-overlay.sh"
/bin/chmod 755 "$HOME/xiaobu-pet-task-overlay.sh" "$support_dir/PetTaskOverlay"
/bin/cp "$project_root/scripts/com.xiaobu.pet-task-overlay.plist" "$launch_agent"

# launchd runs these installed entrypoints, so keep them synchronized with the
# repository when the overlay mode flag changes.
/bin/cp "$project_root/scripts/xiaobu-taskboard-bridge.sh" "$HOME/xiaobu-taskboard-bridge.sh"
/bin/cp "$project_root/scripts/xiaobu-workbuddy-bridge.sh" "$HOME/xiaobu-workbuddy-bridge.sh"
/bin/chmod 755 "$HOME/xiaobu-taskboard-bridge.sh" "$HOME/xiaobu-workbuddy-bridge.sh"

/bin/launchctl bootout "gui/$uid" "$launch_agent" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$uid" "$launch_agent"
/bin/launchctl kickstart -k "gui/$uid/com.xiaobu.taskboard"
/bin/launchctl kickstart -k "gui/$uid/com.xiaobu.workbuddy-pet"

echo "Pet task overlay installed."
