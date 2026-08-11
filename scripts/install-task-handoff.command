#!/bin/zsh
set -e
script_dir="${0:A:h}"
app_source="${script_dir}/XiaobuTaskHandoff.app"
app_target="${HOME}/Applications/XiaobuTaskHandoff.app"
mkdir -p "${HOME}/Applications"
/usr/bin/ditto "${app_source}" "${app_target}"
lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "${lsregister}" ]]; then
  "${lsregister}" -f "${app_target}"
else
  /usr/bin/open -g "${app_target}"
fi
echo "已安装 xiaobu-task:// 桌面任务跳转处理器。"
