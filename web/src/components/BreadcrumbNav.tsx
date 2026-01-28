import { Breadcrumbs, Link, Typography } from "@mui/material";

export type BreadcrumbItem = { label: string; path: string };

export type BreadcrumbNavProps = {
  crumbs: BreadcrumbItem[];
  onNavigate: (path: string) => void;
};

export function BreadcrumbNav({ crumbs, onNavigate }: BreadcrumbNavProps) {
  return (
    <div className="border-b border-white/10 px-4 py-3">
      <Breadcrumbs aria-label="breadcrumb" maxItems={4}>
        {crumbs.map((c, idx) => {
          const isLast = idx === crumbs.length - 1;
          if (isLast) {
            return (
              <Typography key={c.path} color="text.primary">
                {c.label}
              </Typography>
            );
          }

          return (
            <Link
              key={c.path}
              underline="hover"
              color="inherit"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onNavigate(c.path);
              }}
            >
              {c.label}
            </Link>
          );
        })}
      </Breadcrumbs>
    </div>
  );
}
