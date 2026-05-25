export async function computeFee(
  pool,
  checkedInAt,
  endedAt = null,
  discountMinutes = 0
) {
  const query = `
    SELECT
      MAX(CASE WHEN key_name = 'free_minutes' THEN value_int END) AS free_minutes,
      MAX(CASE WHEN key_name = 'rate_per_30min' THEN value_decimal END) AS rate_per_30min,
      MAX(CASE WHEN key_name = 'billing_block_min' THEN value_int END) AS billing_block_min,
      MAX(CASE WHEN key_name = 'daily_max' THEN value_decimal END) AS daily_max
    FROM Settings
    WHERE key_name IN (
      'free_minutes',
      'rate_per_30min',
      'billing_block_min',
      'daily_max'
    )
  `;

  const { rows } = await pool.query(query);
  const settings = rows[0] || {};

  const freeMin = Number(settings.free_minutes ?? 0);
  const blockMin = Number(settings.billing_block_min ?? 1);
  const ratePerBlock = Number(settings.rate_per_30min ?? 5);
  const dailyMax =
    settings.daily_max != null
      ? Number(settings.daily_max)
      : 100;

  const start = new Date(checkedInAt);
  const end = endedAt ? new Date(endedAt) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date input");
  }

  let minutes = Math.ceil((end - start) / 60000);

  minutes = Math.max(0, minutes - Number(discountMinutes || 0));

  if (minutes <= freeMin) {
    return 0;
  }

  minutes -= freeMin;

  const blocks = Math.ceil(minutes / blockMin);
  const fee = blocks * ratePerBlock;

  if (dailyMax != null) {
    return Math.max(0, Math.min(fee, dailyMax));
  }

  return Math.max(0, fee);
}