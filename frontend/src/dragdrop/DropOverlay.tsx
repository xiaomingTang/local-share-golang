import "./DropOverlay.css";

import clsx from "clsx";

export function DropOverlay({ active }: { active: boolean }) {
  return (
    <div
      className={clsx("drop-overlay wails-drop-target", {
        "is-active": active,
      })}
      aria-hidden={!active}
    >
      <div className="drop-overlay__panel">
        <div className="drop-overlay__title">拖拽文件夹到这里开始共享</div>
        <div className="drop-overlay__sub">支持拖到窗口任意位置</div>
      </div>
    </div>
  );
}
