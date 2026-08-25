import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { memo, useEffect, useId, useState } from "react";
import { ApiError, suggestLocations } from "../api/client";
import type { LocationValue } from "../types";
import { locationFieldSx } from "./form-control-styles";

interface LocationAutocompleteProps {
  label: string;
  name: string;
  value: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
  error?: string;
  placeholder?: string;
}

const keepProviderOrder = (availableOptions: LocationValue[]) => availableOptions;

export const LocationAutocomplete = memo(function LocationAutocomplete({
  label,
  name,
  value,
  onChange,
  error,
  placeholder = "City, state, or address",
}: LocationAutocompleteProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<LocationValue[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (value?.label === query || trimmed.length < 3) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      setOpen(true);
      try {
        const suggestions = await suggestLocations(trimmed, controller.signal);
        setOptions(suggestions);
        setMessage(suggestions.length === 0 ? "No matching locations found." : "");
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setOptions([]);
          setOpen(true);
          setMessage(
            requestError instanceof ApiError
              ? requestError.message
              : "Location search is unavailable. Try again in a moment.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, value?.label]);

  const resetSearch = () => {
    setQuery("");
    setOptions([]);
    setOpen(false);
    setLoading(false);
    setMessage("");
    onChange(null);
  };

  const hasPopupContent = loading || options.length > 0 || Boolean(message);

  return (
    <Autocomplete<LocationValue, false, false, false>
      id={inputId}
      className={`field ${error ? "field--error" : ""}`}
      autoHighlight
      clearOnBlur={false}
      clearIcon={<X size={15} aria-hidden="true" />}
      clearText={`Clear ${label.toLowerCase()}`}
      filterOptions={keepProviderOrder}
      forcePopupIcon
      fullWidth
      getOptionKey={(option) => option.id ?? `${option.label}-${option.lat}-${option.lon}`}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, selectedValue) => (
        option.id && selectedValue.id
          ? option.id === selectedValue.id
          : option.label === selectedValue.label && option.lat === selectedValue.lat && option.lon === selectedValue.lon
      )}
      loading={loading}
      loadingText="Searching locations…"
      noOptionsText={message || "Type at least 3 characters to search."}
      onChange={(_event, nextValue, reason) => {
        if (reason === "clear" || !nextValue) {
          resetSearch();
          return;
        }
        setQuery(nextValue.label);
        setOptions([]);
        setOpen(false);
        setMessage("");
        onChange(nextValue);
      }}
      onClose={() => setOpen(false)}
      onInputChange={(_event, nextQuery, reason) => {
        if (reason === "clear") {
          resetSearch();
          return;
        }
        if (reason !== "input") {
          if (reason === "selectOption" || reason === "reset") setQuery(nextQuery);
          return;
        }

        setQuery(nextQuery);
        onChange(null);
        setMessage("");
        if (nextQuery.trim().length < 3) {
          setOptions([]);
          setLoading(false);
          setOpen(false);
        } else {
          setOpen(true);
        }
      }}
      onOpen={() => {
        if (hasPopupContent) setOpen(true);
      }}
      open={open && hasPopupContent}
      openText={`Open ${label.toLowerCase()} suggestions`}
      options={options}
      popupIcon={<ChevronDown size={15} aria-hidden="true" />}
      renderInput={(params) => (
        <TextField
          {...params}
          className="combobox-wrap"
          error={Boolean(error)}
          helperText={error}
          label={label}
          placeholder={placeholder}
          size="small"
          sx={locationFieldSx}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={17} aria-hidden="true" />
                </InputAdornment>
              ),
              endAdornment: (
                <>
                  {loading ? <CircularProgress aria-label="Searching locations" color="inherit" size={16} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
            inputLabel: {
              ...params.slotProps.inputLabel,
              shrink: true,
            },
            htmlInput: {
              ...params.slotProps.htmlInput,
              name,
              autoComplete: "off",
              "aria-describedby": error ? errorId : undefined,
            },
            formHelperText: {
              id: errorId,
              role: error ? "alert" : undefined,
            },
          }}
        />
      )}
      renderOption={(optionProps, option) => {
        const { key, className, ...restOptionProps } = optionProps;
        const secondaryLabel = [option.city, option.state, option.country].filter(Boolean).join(", ");
        return (
          <li
            {...restOptionProps}
            className={`${className ?? ""} location-option`}
            key={key}
          >
            <MapPin size={17} aria-hidden="true" />
            <span>
              <strong>{option.label}</strong>
              {secondaryLabel ? <small>{secondaryLabel}</small> : null}
            </span>
            {value && (
              value.id && option.id
                ? value.id === option.id
                : value.label === option.label && value.lat === option.lat && value.lon === option.lon
            ) ? <Check size={16} aria-hidden="true" /> : null}
          </li>
        );
      }}
      slotProps={{
        listbox: {
          "aria-label": `${label} suggestions`,
          sx: {
            maxHeight: "280px",
            padding: "5px",
            "& .location-option": {
              display: "grid",
              gridTemplateColumns: "20px minmax(0, 1fr) 18px",
            },
          },
        },
        paper: {
          className: "location-menu",
          elevation: 8,
          style: {
            position: "static",
            maxHeight: "none",
            overflow: "hidden",
            padding: 0,
          },
        },
      }}
      value={value}
    />
  );
});
