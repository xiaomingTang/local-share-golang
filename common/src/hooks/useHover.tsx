import { useMemo, useState } from "react";

export function useHover() {
  const [hovered, setHovered] = useState(false);

  const eventHandlers = useMemo(
    () => ({
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    }),
    [],
  );

  return [hovered, eventHandlers] as const;
}
