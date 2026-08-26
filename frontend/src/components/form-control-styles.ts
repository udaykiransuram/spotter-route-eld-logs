/** Shared MUI field styling for the trip form and location autocomplete. */
export const formFieldSx = {
  minWidth: 0,
  "& .MuiInputBase-root": {
    minHeight: "44px",
    borderRadius: "var(--radius-control)",
    backgroundColor: "#ffffff",
    fontFamily: "var(--font-ui)",
    fontSize: "13.5px",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--border-dark)",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--teal-700)",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--blue)",
    borderWidth: "1px",
    boxShadow: "0 0 0 3px rgba(36, 91, 131, 0.16)",
  },
  "& .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--coral-strong)",
  },
  "& .MuiInputBase-input": {
    boxSizing: "border-box",
    height: "42px",
    border: "0 !important",
    boxShadow: "none !important",
    outline: "none !important",
  },
  "& .MuiInputLabel-root": {
    color: "var(--ink)",
    fontFamily: "var(--font-ui)",
    fontSize: "13px",
    fontWeight: 700,
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "var(--blue)",
  },
  "& .MuiFormHelperText-root": {
    margin: "5px 0 0",
    color: "var(--muted)",
    fontFamily: "var(--font-ui)",
    fontSize: "11px",
    lineHeight: 1.4,
  },
  "& .MuiFormHelperText-root.Mui-error": {
    color: "var(--coral-strong)",
  },
} as const;

export const locationFieldSx = {
  ...formFieldSx,
  "& .MuiAutocomplete-endAdornment": {
    right: "8px",
  },
} as const;
