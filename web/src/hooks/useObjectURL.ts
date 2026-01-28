import { useEffect, useState } from "react";

export function useObjectURL(blob: Blob | null): string | null {
  const [objectURL, setObjectURL] = useState<string | null>(null);

  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setObjectURL(url);

      return () => {
        try {
          // In some browsers, revoking an object URL that has already been revoked
          // can throw an error, so we wrap this in a try-catch block.
          URL.revokeObjectURL(url);
        } catch (e) {
          // Ignore the error
        }
        setObjectURL(null);
      };
    } else {
      setObjectURL(null);
    }
  }, [blob]);

  return objectURL;
}
