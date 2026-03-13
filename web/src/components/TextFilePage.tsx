import {
  Alert,
  Button,
  Collapse,
  Link,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
  Slider,
  Slide,
  Stack,
  TextField,
  Typography,
  useScrollTrigger,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import useSWR from "swr";
import { TypedStorage, useStorage } from "common/storage";
import type { DirectoryItem } from "src/types";
import { fetchPreview } from "src/utils/api";
import { DownloadFileIcon, FileActionIconButton } from "./FileActionIconButton";

type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  firstLineIndent: 0 | 2 | 4;
  trimMode: "none" | "trim-start" | "trim-end" | "trim-both";
};

const TEXT_READER_SETTINGS_KEY =
  "localshare.web.textReaderSettings.v1" as const;

const readerSettingsStorage = new TypedStorage<{
  [TEXT_READER_SETTINGS_KEY]: ReaderSettings;
}>();

const defaultReaderSettings: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.85,
  firstLineIndent: 0,
  trimMode: "none",
};

type TextFilePageProps = {
  rootName: string;
  currentPath: string;
  item: DirectoryItem;
  onNavigate: (path: string) => void;
  onDownload: () => void;
};

type HighlightResult = {
  nodes: React.ReactNode[];
  nextMatchIndex: number;
};

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeParagraph(text: string, trimMode: ReaderSettings["trimMode"]) {
  if (trimMode === "trim-start") return text.trimStart();
  if (trimMode === "trim-end") return text.trimEnd();
  if (trimMode === "trim-both") return text.trim();
  return text;
}

function highlightParagraph(
  text: string,
  query: string,
  activeMatchIndex: number,
  startMatchIndex: number,
): HighlightResult {
  if (!query) {
    return { nodes: [text], nextMatchIndex: startMatchIndex };
  }

  const nodes: React.ReactNode[] = [];
  const haystack = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  let searchFrom = 0;
  let nextMatchIndex = startMatchIndex;

  while (searchFrom < text.length) {
    const foundAt = haystack.indexOf(needle, searchFrom);
    if (foundAt < 0) {
      nodes.push(text.slice(searchFrom));
      break;
    }

    if (foundAt > searchFrom) {
      nodes.push(text.slice(searchFrom, foundAt));
    }

    const matchedText = text.slice(foundAt, foundAt + query.length);
    const isActive = nextMatchIndex === activeMatchIndex;
    nodes.push(
      <mark
        key={`${startMatchIndex}-${foundAt}`}
        data-search-match={nextMatchIndex}
        className={
          isActive
            ? "bg-amber-300 text-slate-950"
            : "bg-amber-100/80 text-slate-950"
        }
      >
        {matchedText}
      </mark>,
    );

    nextMatchIndex += 1;
    searchFrom = foundAt + query.length;
  }

  return { nodes, nextMatchIndex };
}

export function TextFilePage(props: TextFilePageProps) {
  const { currentPath, item, onDownload, onNavigate } = props;
  const hideHeaderTrigger = useScrollTrigger({ threshold: 8 });

  const { data, error, isValidating } = useSWR(
    ["preview", currentPath],
    async ([, filePath]) => fetchPreview(filePath),
  );
  const [readerSettings, setReaderSettings] = useStorage(
    readerSettingsStorage,
    TEXT_READER_SETTINGS_KEY,
    defaultReaderSettings,
  );
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchPending, startSearchTransition] = useTransition();
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isStickyPinned, setIsStickyPinned] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const navigatedQueryRef = useRef("");
  const text = data?.text ?? "";
  const fontSize = readerSettings?.fontSize ?? defaultReaderSettings.fontSize;
  const lineHeight =
    readerSettings?.lineHeight ?? defaultReaderSettings.lineHeight;
  const firstLineIndent =
    readerSettings?.firstLineIndent ?? defaultReaderSettings.firstLineIndent;
  const trimMode = readerSettings?.trimMode ?? defaultReaderSettings.trimMode;
  const paragraphs = useMemo(() => {
    const normalized = text.replace(/\r\n/g, "\n");
    const blocks = normalized.split(/\n/).filter(Boolean);
    const source = blocks.length > 0 ? blocks : [normalized];
    return source.map((paragraph) => normalizeParagraph(paragraph, trimMode));
  }, [text, trimMode]);

  const highlightedParagraphs = useMemo(() => {
    let nextMatchIndex = 0;
    const result = paragraphs.map((paragraph, index) => {
      const highlighted = highlightParagraph(
        paragraph,
        searchQuery,
        activeMatchIndex,
        nextMatchIndex,
      );
      nextMatchIndex = highlighted.nextMatchIndex;
      return (
        <p
          key={`${index}-${paragraph.slice(0, 16)}`}
          className="text-justify"
          style={{
            textIndent: paragraph.length > 0 ? `${firstLineIndent}em` : 0,
            margin: 0,
          }}
        >
          {highlighted.nodes}
        </p>
      );
    });

    return { nodes: result, matchCount: nextMatchIndex };
  }, [activeMatchIndex, firstLineIndent, paragraphs, searchQuery]);

  useEffect(() => {
    navigatedQueryRef.current = "";
    setActiveMatchIndex(-1);
  }, [currentPath]);

  useEffect(() => {
    if (
      query.trim() !== searchQuery ||
      !searchQuery ||
      highlightedParagraphs.matchCount === 0 ||
      activeMatchIndex < 0 ||
      navigatedQueryRef.current !== searchQuery
    ) {
      return;
    }
    if (activeMatchIndex >= highlightedParagraphs.matchCount) {
      navigatedQueryRef.current = "";
      setActiveMatchIndex(-1);
      return;
    }

    const el = articleRef.current?.querySelector(
      `[data-search-match="${activeMatchIndex}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeMatchIndex, highlightedParagraphs.matchCount, query, searchQuery]);

  useEffect(() => {
    function updateStickyPinned() {
      const rect = headerRef.current?.getBoundingClientRect();
      setIsStickyPinned((rect?.top ?? 1) <= 0);
    }

    updateStickyPinned();
    window.addEventListener("scroll", updateStickyPinned, { passive: true });
    window.addEventListener("resize", updateStickyPinned);
    return () => {
      window.removeEventListener("scroll", updateStickyPinned);
      window.removeEventListener("resize", updateStickyPinned);
    };
  }, []);

  function updateFontSize(_: Event, value: number | number[]) {
    const next = Array.isArray(value) ? value[0] : value;
    setReaderSettings((prev) => ({
      ...(prev ?? defaultReaderSettings),
      fontSize: clampValue(next, 15, 30),
    }));
  }

  function updateLineHeight(_: Event, value: number | number[]) {
    const next = Array.isArray(value) ? value[0] : value;
    setReaderSettings((prev) => ({
      ...(prev ?? defaultReaderSettings),
      lineHeight: clampValue(next, 1.4, 2.6),
    }));
  }

  function updateFirstLineIndent(value: ReaderSettings["firstLineIndent"]) {
    setReaderSettings((prev) => ({
      ...(prev ?? defaultReaderSettings),
      firstLineIndent: value,
    }));
  }

  function updateTrimMode(value: ReaderSettings["trimMode"]) {
    setReaderSettings((prev) => ({
      ...(prev ?? defaultReaderSettings),
      trimMode: value,
    }));
  }

  function handleQueryChange(nextQuery: string) {
    navigatedQueryRef.current = "";
    setActiveMatchIndex(-1);
    setQuery(nextQuery);
    startSearchTransition(() => {
      setSearchQuery(nextQuery.trim());
    });
  }

  function jumpMatch(step: number) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    if (normalizedQuery !== searchQuery) {
      navigatedQueryRef.current = normalizedQuery;
      setActiveMatchIndex(step >= 0 ? 0 : -1);
      startSearchTransition(() => {
        setSearchQuery(normalizedQuery);
      });
      return;
    }

    if (highlightedParagraphs.matchCount === 0) return;
    navigatedQueryRef.current = searchQuery;
    setActiveMatchIndex((prev) => {
      if (prev < 0) {
        return step >= 0 ? 0 : highlightedParagraphs.matchCount - 1;
      }
      const next = prev + step;
      if (next < 0) return highlightedParagraphs.matchCount - 1;
      if (next >= highlightedParagraphs.matchCount) return 0;
      return next;
    });
  }
  const currentMatchNumber = activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0;
  const parentPath = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }, [currentPath]);

  function closePanelFromContentArea() {
    if (!panelOpen) return;
    setPanelOpen(false);
  }

  const isHeaderVisible = panelOpen || !hideHeaderTrigger;

  return (
    <div className="mx-auto w-full max-w-5xl sm:px-4 pb-12 pt-3">
      <Slide appear={false} direction="down" in={isHeaderVisible}>
        <div
          ref={headerRef}
          className={[
            "sticky top-0 z-30 overflow-hidden border border-white/10 bg-[rgba(14,21,31,0.88)] shadow-[0_14px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[border-radius] duration-150",
            isStickyPinned ? "rounded-b-2xl rounded-t-none" : "rounded-2xl",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                component="button"
                type="button"
                color="inherit"
                underline="none"
                aria-label="返回父级"
                onClick={() => onNavigate(parentPath)}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  color: "rgba(255,255,255,0.82)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  flexShrink: 0,
                  "&:hover": {
                    backgroundColor: "rgba(255,255,255,0.1)",
                    borderColor: "rgba(255,255,255,0.28)",
                  },
                }}
              >
                <ArrowBackIcon fontSize="small" />
              </Link>
              <Typography
                variant="h6"
                className="min-w-0 flex-1"
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.name}
              </Typography>
            </div>
            <div className="flex items-center gap-2">
              <FileActionIconButton
                label="下载"
                icon={<DownloadFileIcon />}
                tone="filled"
                onClick={onDownload}
              />
              <FileActionIconButton
                label={panelOpen ? "收起设置" : "展开设置"}
                icon={
                  panelOpen ? (
                    <KeyboardArrowUpRoundedIcon />
                  ) : (
                    <KeyboardArrowDownRoundedIcon />
                  )
                }
                onClick={() => setPanelOpen((prev) => !prev)}
              />
            </div>
          </div>

          <Collapse in={panelOpen} timeout={180} unmountOnExit>
            <div className="border-t border-white/10 px-4 py-3 md:px-5">
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.5}
                  alignItems={{ xs: "stretch", md: "center" }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    label="搜索"
                    placeholder="输入关键字"
                    value={query}
                    onChange={(event) => handleQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        !event.nativeEvent.isComposing &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        jumpMatch(1);
                      }
                    }}
                    slotProps={{
                      input: {
                        endAdornment: query ? (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              edge="end"
                              aria-label="清空搜索"
                              onClick={() => handleQueryChange("")}
                            >
                              <CloseRoundedIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ) : undefined,
                      },
                    }}
                  />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ minWidth: 42, whiteSpace: "nowrap" }}
                    >
                      {isSearchPending
                        ? "搜索中"
                        : `${currentMatchNumber} / ${highlightedParagraphs.matchCount}`}
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={highlightedParagraphs.matchCount === 0}
                      onClick={() => jumpMatch(-1)}
                    >
                      上一处
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={highlightedParagraphs.matchCount === 0}
                      onClick={() => jumpMatch(1)}
                    >
                      下一处
                    </Button>
                  </Stack>
                </Stack>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ minWidth: 84, whiteSpace: "nowrap" }}
                      >
                        {`字体大小 ${fontSize}px`}
                      </Typography>
                      <Slider
                        size="small"
                        value={fontSize}
                        min={15}
                        max={30}
                        step={1}
                        onChange={updateFontSize}
                      />
                    </Stack>
                  </div>
                  <div>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ minWidth: 84, whiteSpace: "nowrap" }}
                      >
                        {`行距 ${lineHeight.toFixed(2)}`}
                      </Typography>
                      <Slider
                        size="small"
                        value={lineHeight}
                        min={1.4}
                        max={2.6}
                        step={0.05}
                        onChange={updateLineHeight}
                      />
                    </Stack>
                  </div>
                  <div>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ minWidth: 84, whiteSpace: "nowrap" }}
                      >
                        首行缩进
                      </Typography>
                      <Select
                        size="small"
                        value={firstLineIndent}
                        onChange={(event) =>
                          updateFirstLineIndent(
                            Number(event.target.value) as ReaderSettings["firstLineIndent"],
                          )
                        }
                        sx={{ minWidth: 108 }}
                      >
                        <MenuItem value={0}>0</MenuItem>
                        <MenuItem value={2}>2</MenuItem>
                        <MenuItem value={4}>4</MenuItem>
                      </Select>
                    </Stack>
                  </div>
                  <div>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ minWidth: 84, whiteSpace: "nowrap" }}
                      >
                        空格处理
                      </Typography>
                      <Select
                        size="small"
                        value={trimMode}
                        onChange={(event) =>
                          updateTrimMode(event.target.value as ReaderSettings["trimMode"])
                        }
                        sx={{ minWidth: 168 }}
                      >
                        <MenuItem value="none">不移除</MenuItem>
                        <MenuItem value="trim-start">移除段前空格</MenuItem>
                        <MenuItem value="trim-end">移除段后空格</MenuItem>
                        <MenuItem value="trim-both">移除段落前后空格</MenuItem>
                      </Select>
                    </Stack>
                  </div>
                </div>
              </Stack>
            </div>
          </Collapse>
        </div>
      </Slide>

      <div
        className="pt-5 md:pt-6"
        onMouseDown={closePanelFromContentArea}
        onTouchStart={closePanelFromContentArea}
      >
        {isValidating && (
          <div className="py-8">
            <LinearProgress />
          </div>
        )}
        {!isValidating && error instanceof Error && (
          <Alert severity="error">{error.message}</Alert>
        )}
        {!isValidating && !error && (
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,248,235,0.96),rgba(247,239,224,0.92))] p-5 text-slate-900 shadow-[0_24px_80px_rgba(0,0,0,0.18)] md:p-8">
            <article
              ref={articleRef}
              className="mx-auto max-w-3xl space-y-6"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight,
                fontFamily:
                  '"Iowan Old Style", "Noto Serif SC", "Source Han Serif SC", Georgia, serif',
              }}
            >
              {highlightedParagraphs.nodes}
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
