import { Button, styled } from "@mui/material";

export const TextButton = styled(Button)(({ theme }) => ({
  variant: "text",
  size: "small",
  minWidth: 0,
  padding: 0,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  color: "inherit",
  font: "inherit",
}));
