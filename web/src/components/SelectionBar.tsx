import { Button, Checkbox, Paper, Typography } from "@mui/material";
import clsx from "clsx";

export type SelectionBarProps = {
  totalInFolder: number;
  selectedInFolder: number;
  selectedTotal: number;
  onSelectAll: (checked: boolean) => void;
  onDownloadSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
};

export function SelectionBar(props: SelectionBarProps) {
  const {
    totalInFolder,
    selectedInFolder,
    selectedTotal,
    onSelectAll,
    onDownloadSelected,
    onDeleteSelected,
    onClearSelection,
  } = props;

  const allChecked = totalInFolder > 0 && selectedInFolder === totalInFolder;
  const indeterminate =
    selectedInFolder > 0 && selectedInFolder < totalInFolder;
  const disabled = totalInFolder === 0;

  return (
    <Paper
      className={clsx(
        "mb-3 px-4 py-3 relative",
        selectedTotal > 0 && "sticky top-2 z-10",
      )}
      elevation={0}
      sx={{
        borderRadius: 2,
        backgroundColor: "rgba(255, 255, 255, 0.15)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className={clsx(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allChecked}
            indeterminate={indeterminate}
            disabled={disabled}
            onChange={(e) => onSelectAll(e.target.checked)}
            size="small"
          />
          <Typography variant="body2">已选 {selectedTotal} 项</Typography>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="contained"
            size="small"
            disabled={selectedTotal === 0}
            onClick={onDownloadSelected}
          >
            下载选中
          </Button>
          <Button
            variant="contained"
            color="error"
            size="small"
            disabled={selectedTotal === 0}
            onClick={onDeleteSelected}
          >
            删除选中
          </Button>
          <Button
            variant="outlined"
            size="small"
            disabled={selectedTotal === 0}
            onClick={onClearSelection}
          >
            取消
          </Button>
        </div>
      </div>
    </Paper>
  );
}
