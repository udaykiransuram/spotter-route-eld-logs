import type { DailyLogRemark } from "../types";

const LEGACY_TRIP_COMPLETE_EVENT_ID = "trip-complete";

export function visibleLogRemarks(remarks: readonly DailyLogRemark[]) {
  return remarks.filter((remark) => remark.event_id !== LEGACY_TRIP_COMPLETE_EVENT_ID);
}
