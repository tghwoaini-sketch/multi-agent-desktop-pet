#!/bin/zsh
set -e
script_dir="${0:A:h}"
app_source="${script_dir}/XiaobuTaskHandoff.app"
app_target="${HOME}/Applications/XiaobuTaskHandoff.app"
mkdir -p "${HOME}/Applications"
/usr/bin/ditto "${app_source}" "${app_target}"

# Build the native URL-event receiver for this Mac. A shell executable inside
# an .app bundle cannot reliably receive application(_:open:) events.
swift_source="${script_dir}/XiaobuTaskHandoff.swift"
if [[ -f "${swift_source}" && -x "/usr/bin/swiftc" ]]; then
  /usr/bin/swiftc -parse-as-library -framework AppKit -framework Foundation \
    "${swift_source}" -o "${app_target}/Contents/MacOS/XiaobuTaskHandoff"
  /usr/bin/codesign --force --sign - "${app_target}"
fi

lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "${lsregister}" ]]; then
  "${lsregister}" -f "${app_target}"
else
  /usr/bin/open -g "${app_target}"
fi
echo "已安装 xiaobu-task:// 桌面任务跳转处理器。"
