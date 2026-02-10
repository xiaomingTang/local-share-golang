import { Divider, Grid } from "@mui/material";
import { mutate } from "swr";
import toast from "react-hot-toast";

import { GithubBadge } from "./sections/GithubBadge";
import { UpdateSection } from "./sections/UpdateSection";
import { DropOverlay } from "./dragdrop/DropOverlay";
import { useEventsOn } from "./hooks/useEventsOn";
import { ShareControlSection } from "./sections/ShareControlSection";
import { ShareInfoSection } from "./sections/ShareInfoSection";
import { ShareQrSection } from "./sections/ShareQrSection";
import {
  SettingOfAccessPass,
  SettingOfContextMenu,
  SettingOfCustomPort,
  SettingOfPermissions,
} from "./sections/SettingsSection";

export default function App() {
  useEventsOn("serverInfoChanged", () => mutate("GetServerInfo"));
  useEventsOn("toastError", (msg: unknown) => {
    const text = typeof msg === "string" ? msg : String(msg ?? "");
    if (text) {
      toast.error(text);
    }
  });

  return (
    <>
      <div className="max-w-215 mx-auto relative p-4">
        <div className="bg-white/5 rounded-md border border-white/10 p-4">
          <ShareControlSection />

          <ShareInfoSection />

          <ShareQrSection />
        </div>

        <Grid
          container
          spacing={1.5}
          sx={{
            mt: 4,
            p: 4,
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: 2,
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <Grid size={6}>
            <SettingOfContextMenu />
          </Grid>
          <Grid size={6}>
            <SettingOfAccessPass />
          </Grid>
          <Grid size={6}>
            <SettingOfCustomPort />
          </Grid>
          <Grid size={6}>
            <SettingOfPermissions />
          </Grid>
          <Grid size={12} sx={{ py: 1.5 }}>
            <Divider />
          </Grid>
          <Grid size={6}>
            <UpdateSection />
          </Grid>
        </Grid>

        <GithubBadge />

        <DropOverlay />
      </div>
    </>
  );
}
