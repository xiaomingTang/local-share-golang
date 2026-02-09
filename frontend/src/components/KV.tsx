import { Box, Stack, SxProps, Theme } from "@mui/material";

interface RowProps {
  k?: React.ReactNode;
  v?: React.ReactNode;
  hidden?: boolean;
  sx?: SxProps<Theme>;
}

export function KV({ k, v, hidden, sx }: RowProps) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        userSelect: hidden ? "none" : "auto",
        transition: "opacity 0.3s",
        alignItems: "center",
        ...sx,
      }}
    >
      <Box
        sx={{
          minWidth: "6em",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          color: "#A9ADB3",
        }}
      >
        {k}
      </Box>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        {v}
      </Box>
    </Stack>
  );
}
