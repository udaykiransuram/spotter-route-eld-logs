import type { DutyStatus } from "../types";

export const LOG_GRAPH_LEFT = 64;
export const LOG_GRAPH_WIDTH = 390;

export const LOG_LANE_Y: Record<DutyStatus, number> = {
  off_duty: 192,
  sleeper_berth: 209.5,
  driving: 226.5,
  on_duty: 244,
};

const graphTop = 184;
const graphBottom = 253;
const rowBoundaries = [184, 201, 218, 235, 253] as const;
const hourLines = Array.from({ length: 25 }, (_, hour) => ({
  hour,
  x: LOG_GRAPH_LEFT + (LOG_GRAPH_WIDTH / 24) * hour,
}));
const quarterHourLines = Array.from({ length: 95 }, (_, index) => index + 1)
  .filter((quarter) => quarter % 4 !== 0)
  .map((quarter) => ({
    isHalfHour: quarter % 4 === 2,
    quarter,
    x: LOG_GRAPH_LEFT + (LOG_GRAPH_WIDTH / 96) * quarter,
  }));
const morningHours = Array.from({ length: 11 }, (_, index) => index + 1);
const afternoonHours = Array.from({ length: 11 }, (_, index) => index + 1);

function quarterTickPath(x: number, isHalfHour: boolean) {
  const tickHeight = isHalfHour ? 9 : 5.5;
  return [
    `M ${x} ${rowBoundaries[0]} V ${rowBoundaries[0] + tickHeight}`,
    `M ${x} ${rowBoundaries[1]} V ${rowBoundaries[1] + tickHeight}`,
    `M ${x} ${rowBoundaries[3] - tickHeight} V ${rowBoundaries[3]}`,
    `M ${x} ${rowBoundaries[4] - tickHeight} V ${rowBoundaries[4]}`,
  ].join(" ");
}

/**
 * Static, code-native recreation of the supplied 513 x 518 paper log.
 * Keeping it in the same coordinate system lets the generated values and
 * duty trace remain aligned while making every printed rule and label sharp.
 */
export function DailyLogTemplate() {
  return (
    <g
      className="daily-log-template"
      data-testid="daily-log-vector-template"
      aria-hidden="true"
      fill="#080d12"
      fontFamily="Arial, Helvetica, sans-serif"
    >
      <rect x="0" y="0" width="513" height="518" fill="#ffffff" />

      <g className="daily-log-template__header">
        <text x="21" y="16" fontSize="15" fontWeight="700">Drivers Daily Log</text>
        <text x="88" y="29" textAnchor="middle" fontSize="5.5" fontWeight="700">[24 hours]</text>

        <g fill="none" stroke="#080d12" strokeWidth="0.8">
          <line x1="169" y1="19" x2="205" y2="19" />
          <line x1="209" y1="19" x2="249" y2="19" />
          <line x1="254" y1="19" x2="289" y2="19" />
        </g>
        <text x="207" y="19" textAnchor="middle" fontSize="10">/</text>
        <text x="251.5" y="19" textAnchor="middle" fontSize="10">/</text>
        <text x="187" y="29" textAnchor="middle" fontSize="5.2">(month)</text>
        <text x="229" y="29" textAnchor="middle" fontSize="5.2">(day)</text>
        <text x="271.5" y="29" textAnchor="middle" fontSize="5.2">(year)</text>

        <text x="298" y="15" fontSize="5.3" fontWeight="700">Original - File at home terminal.</text>
        <text x="298" y="25" fontSize="5.3" fontWeight="700">
          Duplicate - Driver retains in his/her possession for 8 days.
        </text>

        <text x="63" y="43.5" fontSize="6.5" fontWeight="700">From:</text>
        <text x="258" y="43.5" fontSize="6.5" fontWeight="700">To:</text>
        <g fill="none" stroke="#080d12" strokeWidth="0.8">
          <line x1="63" y1="47" x2="241" y2="47" />
          <line x1="258" y1="47" x2="437" y2="47" />
        </g>
      </g>

      <g className="daily-log-template__details" fill="none" stroke="#080d12" strokeWidth="0.8">
        <rect x="52" y="65" width="85" height="22" />
        <rect x="140" y="65" width="78" height="22" />
        <rect x="52" y="99" width="166" height="21" />
        <line x1="228" y1="79" x2="466" y2="79" />
        <line x1="228" y1="99" x2="466" y2="99" />
        <line x1="228" y1="120" x2="466" y2="120" />
      </g>
      <g className="daily-log-template__detail-labels" fontSize="5.1" fontWeight="700" textAnchor="middle">
        <text x="94.5" y="94">Total Miles Driving Today</text>
        <text x="179" y="94">Total Mileage Today</text>
        <text x="135" y="128.5">
          <tspan x="135" dy="0">Truck/Tractor and Trailer Numbers or</tspan>
          <tspan x="135" dy="7">License Plate(s)/State (show each unit)</tspan>
        </text>
        <text x="347" y="87">Name of Carrier or Carriers</text>
        <text x="347" y="107">Main Office Address</text>
        <text x="347" y="128">Home Terminal Address</text>
      </g>

      <g className="daily-log-template__graph-header">
        <rect x="56" y="154" width="437" height="29" fill="#080d12" />
        <g fill="#ffffff" fontSize="5.2" fontWeight="700" textAnchor="middle">
          <text x="61" y="168.5" textAnchor="start">
            <tspan x="58" dy="0">Mid-</tspan>
            <tspan x="58" dy="8">night</tspan>
          </text>
          {morningHours.map((hour) => (
            <text key={`morning-${hour}`} x={LOG_GRAPH_LEFT + (LOG_GRAPH_WIDTH / 24) * hour} y="177">
              {hour}
            </text>
          ))}
          <text x={LOG_GRAPH_LEFT + LOG_GRAPH_WIDTH / 2} y="177">Noon</text>
          {afternoonHours.map((hour) => (
            <text key={`afternoon-${hour}`} x={LOG_GRAPH_LEFT + (LOG_GRAPH_WIDTH / 24) * (hour + 12)} y="177">
              {hour}
            </text>
          ))}
          <text x="459" y="168.5" textAnchor="start">
            <tspan x="456" dy="0">Mid-</tspan>
            <tspan x="456" dy="8">night</tspan>
          </text>
          <text x="482" y="168.5">
            <tspan x="482" dy="0">Total</tspan>
            <tspan x="482" dy="8">Hours</tspan>
          </text>
        </g>
      </g>

      <g className="daily-log-template__status-labels" fontSize="5.8" fontWeight="700">
        <text data-status-row="off_duty" data-label="1. Off Duty" x="21" y="193">1. Off Duty</text>
        <text data-status-row="sleeper_berth" data-label="2. Sleeper Berth" x="21" y="207">
          <tspan x="21" dy="0">2. Sleeper</tspan>
          <tspan x="21" dy="8">Berth</tspan>
        </text>
        <text data-status-row="driving" data-label="3. Driving" x="21" y="225">3. Driving</text>
        <text data-status-row="on_duty" data-label="4. On Duty (not driving)" x="21" y="241">
          <tspan x="21" dy="0">4. On Duty</tspan>
          <tspan x="21" dy="8">(not driving)</tspan>
        </text>
      </g>

      <g className="daily-log-template__grid" fill="none" stroke="#080d12">
        {rowBoundaries.map((y) => (
          <line
            key={`row-${y}`}
            data-grid-line="row-boundary"
            x1={LOG_GRAPH_LEFT}
            y1={y}
            x2={LOG_GRAPH_LEFT + LOG_GRAPH_WIDTH}
            y2={y}
            strokeWidth="0.8"
          />
        ))}
        {hourLines.map(({ hour, x }) => (
          <line
            key={`hour-${hour}`}
            data-grid-line="hour"
            x1={x}
            y1={graphTop}
            x2={x}
            y2={graphBottom}
            strokeWidth={hour === 0 || hour === 24 ? 0.9 : 0.65}
          />
        ))}
        {quarterHourLines.map(({ isHalfHour, quarter, x }) => (
          <path
            key={`quarter-${quarter}`}
            data-grid-line="quarter-hour"
            d={quarterTickPath(x, isHalfHour)}
            strokeWidth="0.55"
          />
        ))}
      </g>

      <g className="daily-log-template__totals" fill="none" stroke="#080d12" strokeWidth="0.75">
        <line x1="468" y1="201" x2="493" y2="201" />
        <line x1="468" y1="218" x2="493" y2="218" />
        <line x1="468" y1="235" x2="493" y2="235" />
        <line x1="468" y1="253" x2="493" y2="253" />
        <line x1="468" y1="282" x2="492" y2="282" />
        <line x1="468" y1="284" x2="492" y2="284" />
      </g>

      <g className="daily-log-template__remarks">
        <text x="24" y="278" fontSize="8" fontWeight="700">Remarks</text>
        <path d="M 20.5 284 V 419 H 185 M 320 419 H 457" fill="none" stroke="#080d12" strokeWidth="1.8" />

        <g fontSize="5.5" fontWeight="700">
          <text x="24" y="327">Shipping</text>
          <text x="24" y="336">Documents:</text>
          <line x1="24" y1="354" x2="89" y2="354" stroke="#080d12" strokeWidth="0.7" />
          <text x="24" y="365">DVL or Manifest No.</text>
          <text x="24" y="374">or</text>
          <line x1="24" y1="381" x2="96" y2="381" stroke="#080d12" strokeWidth="0.7" />
          <text x="24" y="395">Shipper &amp; Commodity</text>
        </g>

        <g fontSize="5.2" fontWeight="700" textAnchor="middle">
          <text x="254" y="402">
            Enter name of place you reported and where released from work and when and where each change of duty occurred.
          </text>
          <text x="254" y="412">Use time standard of home terminal.</text>
        </g>
      </g>

      <g className="daily-log-template__recap" fontSize="5.5" fontWeight="700">
        <text x="24" y="431">Recap:</text>
        <text x="24" y="440">Complete at</text>
        <text x="24" y="451">end of day</text>

        <line x1="70" y1="453" x2="104" y2="453" stroke="#080d12" strokeWidth="0.7" />
        <text x="72" y="466">On duty</text>
        <text x="72" y="475">hours</text>
        <text x="72" y="484">today,</text>
        <text x="72" y="493">Total lines</text>
        <text x="72" y="502">3 &amp; 4</text>

        <text x="112" y="431">70 Hour/</text>
        <text x="112" y="440">8 Day</text>
        <text x="112" y="451">Drivers</text>

        <text x="149" y="449">A.</text>
        <line x1="148" y1="453" x2="183" y2="453" stroke="#080d12" strokeWidth="0.7" />
        <g data-recap-column="70-a" fontSize="5">
          <text x="148" y="465">A. Total</text>
          <text x="148" y="474">hours on</text>
          <text x="148" y="483">duty last 7</text>
          <text x="148" y="492" textLength="33" lengthAdjust="spacingAndGlyphs">days including</text>
          <text x="148" y="501">today.</text>
        </g>

        <text x="188" y="449">B.</text>
        <line x1="187" y1="453" x2="222" y2="453" stroke="#080d12" strokeWidth="0.7" />
        <g data-recap-column="70-b" fontSize="5">
          <text x="187" y="465">B. Total</text>
          <text x="187" y="474">hours</text>
          <text x="187" y="483">available</text>
          <text x="187" y="492">tomorrow</text>
          <text x="187" y="501">70 hr.</text>
          <text x="187" y="510">minus A*</text>
        </g>

        <text x="227" y="449">C.</text>
        <line x1="226" y1="453" x2="265" y2="453" stroke="#080d12" strokeWidth="0.7" />
        <g data-recap-column="70-c" fontSize="5">
          <text x="226" y="465">C. Total</text>
          <text x="226" y="474">hours on</text>
          <text x="226" y="483">duty last 5</text>
          <text x="226" y="492" textLength="33" lengthAdjust="spacingAndGlyphs">days including</text>
          <text x="226" y="501">today.</text>
        </g>

        <text x="267" y="431">60 Hour/ 7</text>
        <text x="267" y="440">Day Drivers</text>

        <text x="307" y="449">A.</text>
        <line x1="306" y1="453" x2="341" y2="453" stroke="#080d12" strokeWidth="0.7" />
        <g data-recap-column="60-a" fontSize="5">
          <text x="306" y="465">A. Total</text>
          <text x="306" y="474">hours on</text>
          <text x="306" y="483">duty last 6</text>
          <text x="306" y="492" textLength="33" lengthAdjust="spacingAndGlyphs">days including</text>
          <text x="306" y="501">today.</text>
        </g>

        <text x="346" y="449">B.</text>
        <line x1="345" y1="453" x2="380" y2="453" stroke="#080d12" strokeWidth="0.7" />
        <g data-recap-column="60-b" fontSize="5">
          <text x="345" y="465">B. Total</text>
          <text x="345" y="474">hours</text>
          <text x="345" y="483">available</text>
          <text x="345" y="492">tomorrow</text>
          <text x="345" y="501">60 hr.</text>
          <text x="345" y="510">minus A*</text>
        </g>

        <text x="385" y="449">C.</text>
        <line x1="384" y1="453" x2="423" y2="453" stroke="#080d12" strokeWidth="0.7" />
        <g data-recap-column="60-c" fontSize="5">
          <text x="384" y="465">C. Total</text>
          <text x="384" y="474">hours on</text>
          <text x="384" y="483">duty last 7</text>
          <text x="384" y="492" textLength="33" lengthAdjust="spacingAndGlyphs">days including</text>
          <text x="384" y="501">today.</text>
        </g>

        <text x="430" y="431">*If you took</text>
        <text x="430" y="440">34</text>
        <text x="430" y="449">consecutive</text>
        <text x="430" y="458">hours off</text>
        <text x="430" y="467">duty you</text>
        <text x="430" y="476">have 60/70</text>
        <text x="430" y="485">hours</text>
        <text x="430" y="494">available</text>
      </g>

      <line x1="26" y1="516" x2="459" y2="516" stroke="#080d12" strokeWidth="1.8" />
    </g>
  );
}
