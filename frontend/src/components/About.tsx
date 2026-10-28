export default function About() {
  return (
    <div className="card prose">
      <h3 style={{ marginTop: 0 }}>What this tool answers</h3>
      <p>A UK day-ahead power buyer must decide, <b>before gate closure on D−1</b>, how much thermal power to buy for delivery day D. Wind is weather-dependent, so the decision rests on a forecast. WindWatch shows <b>(1)</b> the latest wind forecast available at that moment and <b>(2)</b> how wrong such forecasts have historically been.</p>
      <h3>Data (Elexon Insights / BMRS only)</h3>
      <ul>
        <li><code>FUELHH</code> with <code>fuelType = WIND</code> — actual national wind generation, half-hourly (<code>startTime</code>, <code>generation</code>).</li>
        <li><code>WINDFOR</code> — national wind forecasts (<code>startTime</code>, <code>publishTime</code>, <code>generation</code>); many runs per target time.</li>
        <li>Scope: purchase decisions made in <b>January 2026</b> → delivery days 2 Jan – 1 Feb 2026.</li>
      </ul>
      <h3>Method</h3>
      <ul>
        <li><b>Decision-time forecast:</b> for each target half-hour, take the forecast with the greatest <code>publishTime</code> ≤ gate closure (default 09:20 UK on D−1, editable). Forecasts issued afterwards are excluded to avoid hindsight bias.</li>
        <li><b>Error</b> = forecast − actual. Positive error means wind was over-forecast and thermal was under-bought (shortfall exposure).</li>
        <li><b>Metrics:</b> MAE, RMSE, bias, WMAPE (Σ|e| / Σ actual), P90/P95 absolute error, worst-case over/under-forecast.</li>
        <li><b>Lead-time analysis</b> uses every published run, bucketed into 3-hour lead-time bins.</li>
        <li><b>Uncertainty band:</b> empirical P10–P90 of (actual − forecast) from decision-time errors on <i>previous</i> delivery days only (no look-ahead; falls back to other days for the first days of the month). The suggested buffer is −P10, i.e. the wind shortfall not exceeded in 90% of periods.</li>
        <li>All times are handled in UTC internally and displayed in <code>Europe/London</code>; delivery days follow UK local midnight.</li>
      </ul>
      <h3>Assumptions &amp; limits</h3>
      <ul>
        <li>The 09:20 gate closure is an assumption; change it in the header to test sensitivity.</li>
        <li>Demand and prices are out of scope (per brief), so the app shows the wind input to the procurement decision, not the final MWh to buy.</li>
        <li>The error band is an empirical, unconditional estimate over one month; it is indicative, not a guarantee.</li>
      </ul>
    </div>
  );
}
