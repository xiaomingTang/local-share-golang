import {
  IconButton,
  Tooltip,
  type IconButtonProps,
  type SvgIconProps,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

type FileActionIconButtonProps = Omit<IconButtonProps, "children"> & {
  label: string;
  icon: React.ReactNode;
  tone?: "outlined" | "filled";
};

export function DownloadFileIcon(props: SvgIconProps) {
  return <DownloadIcon {...props} />;
}

export function PreviewFileIcon(props: SvgIconProps) {
  return <VisibilityOutlinedIcon {...props} />;
}

export function FileActionIconButton(props: FileActionIconButtonProps) {
  const { label, icon, tone = "outlined", sx, disabled, ...rest } = props;

  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          {...rest}
          {...(disabled === undefined ? {} : { disabled })}
          size="small"
          aria-label={label}
          sx={[
            {
              width: 32,
              height: 32,
              borderRadius: 1.5,
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color:
                tone === "filled"
                  ? "rgba(255, 255, 255, 0.96)"
                  : "rgba(255, 255, 255, 0.82)",
              backgroundColor:
                tone === "filled"
                  ? "rgba(37, 99, 235, 0.9)"
                  : "rgba(255, 255, 255, 0.04)",
              transition: "background-color 0.16s ease, border-color 0.16s ease",
              "&:hover": {
                backgroundColor:
                  tone === "filled"
                    ? "rgba(59, 130, 246, 0.96)"
                    : "rgba(255, 255, 255, 0.1)",
                borderColor:
                  tone === "filled"
                    ? "rgba(96, 165, 250, 0.88)"
                    : "rgba(255, 255, 255, 0.28)",
              },
              "&.Mui-disabled": {
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "rgba(255, 255, 255, 0.28)",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
              },
              "& .MuiSvgIcon-root": {
                fontSize: 18,
              },
            },
            ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
          ]}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}