import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#173b5b",
      dark: "#173b5b",
      light: "#e8f1f8",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#0d1e2d",
    },
    error: {
      main: "#ad3045",
    },
    warning: {
      main: "#b45309",
    },
    info: {
      main: "#173b5b",
    },
    success: {
      main: "#173b5b",
    },
    text: {
      primary: "#0d1e2d",
      secondary: "#475569",
    },
    divider: "#d7e0e8",
    background: {
      default: "#f5f7fa",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    button: {
      fontWeight: 700,
      textTransform: "none",
    },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 10,
          fontSize: 13.5,
          lineHeight: 1.2,
          transition: "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        fullWidth: true,
        size: "small",
        variant: "outlined",
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: "#ffffff",
          fontSize: 13.5,
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#94a6b7",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#173b5b",
            borderWidth: 2,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: 13.5,
          fontWeight: 650,
          "&.Mui-focused": {
            color: "#173b5b",
          },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          marginLeft: 0,
          marginRight: 0,
          fontSize: 11,
          lineHeight: 1.4,
        },
      },
    },
    MuiAccordion: {
      defaultProps: {
        disableGutters: true,
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          "&::before": {
            display: "none",
          },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 48,
          paddingLeft: 0,
          paddingRight: 0,
        },
        content: {
          margin: "12px 0",
          fontSize: 12.5,
          fontWeight: 700,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
          textTransform: "none",
          fontSize: 13,
          fontWeight: 700,
        },
      },
    },
  },
});
