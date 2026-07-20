"use client";

import { useEffect } from "react";
import { ensureSelfMediaTask, SELF_MEDIA_TASK_ID } from "../../lib/task-model";

export default function SelfMediaTaskRedirect() {
  useEffect(() => {
    ensureSelfMediaTask();
    window.location.replace(`/task/run?id=${encodeURIComponent(SELF_MEDIA_TASK_ID)}`);
  }, []);

  return <main className="runner-empty"><span>卷</span><h1>正在打开统一任务工作台</h1><p>你的自媒体进度会自动保留。</p></main>;
}
