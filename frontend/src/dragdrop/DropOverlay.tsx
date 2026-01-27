import clsx from "clsx";

export function DropOverlay({ active }: { active: boolean }) {
  return (
    <div
      className={clsx(
        "fixed inset-0 z-9999 justify-center items-center flex flex-col",
        "bg-black/35 backdrop-blur-sm pointer-events-none transition-all",
        active ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!active}
    >
      <div className="text-lg font-semibold tracking-[0.5px]">
        拖拽文件夹到这里开始共享
      </div>
      <div className="mt-2 text-xs opacity-75">支持拖到窗口任意位置</div>
    </div>
  );
}
