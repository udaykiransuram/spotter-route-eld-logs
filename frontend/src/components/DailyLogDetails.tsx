import type { DailyLogRemark, TripMetadata } from "../types";

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const metadataFieldDefinitions = [
  ["driver_name", "Driver"],
  ["carrier_name", "Carrier"],
  ["main_office_address", "Main office"],
  ["home_terminal_address", "Home terminal"],
  ["vehicle_number", "Vehicle identifiers"],
  ["shipping_document_number", "Shipping details"],
] as const satisfies ReadonlyArray<readonly [keyof TripMetadata, string]>;

function metadataEntries(metadata?: TripMetadata) {
  return metadataFieldDefinitions.flatMap(([key, label]) => {
    const value = metadata?.[key]?.trim();
    return value ? [{ key, label, value }] : [];
  });
}

export function formatLongLogDate(date: string) {
  return longDateFormatter.format(new Date(`${date}T12:00:00`));
}

export function remarkDisplayTime(remark: DailyLogRemark) {
  const abbreviation = remark.timezone_abbreviation?.trim();
  return abbreviation ? `${remark.time} ${abbreviation}` : remark.time;
}

export function LogMetadataDetails({ metadata }: { metadata?: TripMetadata }) {
  const entries = metadataEntries(metadata);
  if (entries.length === 0) return null;

  return (
    <section className="log-metadata-details" aria-labelledby="log-metadata-title">
      <h2 id="log-metadata-title">Driver, carrier &amp; document details</h2>
      <dl>
        {entries.map(({ key, label, value }) => (
          <div key={key}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </section>
  );
}
