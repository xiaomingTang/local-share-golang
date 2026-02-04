import ButtonBase from "@mui/material/ButtonBase";

import GithubCornerSvg from "src/assets/github-corner.svg?react";
import { openUrlInBrowser } from "src/utils";

const GITHUB_REPO_URL =
  "https://github.com/xiaomingTang/local-share-golang/releases";

export function GithubBadge() {
  return (
    <ButtonBase
      title="查看项目"
      focusRipple
      aria-label="查看项目"
      sx={{ position: "absolute", right: 0, top: 0 }}
      onClick={() => openUrlInBrowser(GITHUB_REPO_URL)}
    >
      <GithubCornerSvg
        className="fill-white/75 text-[#1b2636]"
        aria-hidden="true"
      />
    </ButtonBase>
  );
}
