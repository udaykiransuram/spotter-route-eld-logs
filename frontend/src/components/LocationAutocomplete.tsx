import { Check, ChevronDown, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { suggestLocations } from "../api/client";
import type { LocationValue } from "../types";

interface LocationAutocompleteProps {
  label: string;
  name: string;
  value: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
  error?: string;
  placeholder?: string;
}

export function LocationAutocomplete({
  label,
  name,
  value,
  onChange,
  error,
  placeholder = "City, state, or address",
}: LocationAutocompleteProps) {
  const inputId = useId();
  const listboxId = `${inputId}-options`;
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<LocationValue[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (value?.label === query || trimmed.length < 3) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      try {
        const suggestions = await suggestLocations(trimmed, controller.signal);
        setOptions(suggestions);
        setOpen(true);
        setActiveIndex(suggestions.length > 0 ? 0 : -1);
        setMessage(suggestions.length === 0 ? "No matching US locations found." : "");
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setOptions([]);
          setOpen(true);
          setMessage("Location search is unavailable. Try again in a moment.");
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

  const selectOption = (option: LocationValue) => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    setQuery(option.label);
    onChange(option);
    setOptions([]);
    setOpen(false);
    setMessage("");
    setActiveIndex(-1);
  };

  const clear = () => {
    setQuery("");
    setOptions([]);
    setOpen(false);
    onChange(null);
  };

  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className="combobox-wrap">
        <Search className="field-icon" size={17} aria-hidden="true" />
        <input
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            if (options.length > 0 || message) setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            onChange(null);
            if (nextQuery.trim().length < 3) {
              setOptions([]);
              setLoading(false);
              setMessage("");
              setActiveIndex(-1);
              setOpen(false);
            } else {
              setOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && options.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => (index + 1) % options.length);
            } else if (event.key === "ArrowUp" && options.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
            } else if (event.key === "Enter" && open && activeIndex >= 0) {
              event.preventDefault();
              selectOption(options[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <span className="combobox-actions">
          {loading ? <LoaderCircle className="spin" size={16} aria-label="Searching locations" /> : null}
          {query ? (
            <button type="button" className="icon-button icon-button--small" onClick={clear} aria-label={`Clear ${label.toLowerCase()}`}>
              <X size={15} />
            </button>
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
        </span>
        {open ? (
          <div className="location-menu" id={listboxId} role="listbox" aria-label={`${label} suggestions`}>
            {options.map((option, index) => (
              <button
                id={`${listboxId}-${index}`}
                key={option.id ?? `${option.label}-${option.lat}-${option.lon}`}
                type="button"
                role="option"
                aria-selected={value?.id === option.id}
                className={`location-option ${index === activeIndex ? "location-option--active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <MapPin size={17} aria-hidden="true" />
                <span>
                  <strong>{option.label}</strong>
                  {option.city || option.state ? (
                    <small>{[option.city, option.state, option.country].filter(Boolean).join(", ")}</small>
                  ) : null}
                </span>
                {value?.id && value.id === option.id ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            ))}
            {message ? <p className="location-menu__message" role="status">{message}</p> : null}
          </div>
        ) : null}
      </div>
      {error ? <p className="field-error" id={`${inputId}-error`} role="alert">{error}</p> : null}
    </div>
  );
}
