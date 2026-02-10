import { useEffect, useState } from "react";

interface DelayProps {
  ms: number;
  children: React.ReactNode;
}

export function Delay({ ms, children }: DelayProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);

  return <>{show ? children : null}</>;
}
