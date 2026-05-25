export async function computeFeeDetail(
  pool,
  checkedInAt,
  endedAt = null,
  extraFreeMinutes = 0
) {

  const query = `
    SELECT
      MAX(CASE WHEN key_name='free_minutes'
      THEN value_int END) AS free_minutes,

      MAX(CASE WHEN key_name='rate_per_30min'
      THEN value_decimal END) AS rate_per_30min,

      MAX(CASE WHEN key_name='billing_block_min'
      THEN value_int END) AS billing_block_min,

      MAX(CASE WHEN key_name='daily_max'
      THEN value_decimal END) AS daily_max

    FROM Settings
  `;

  const { rows } =
    await pool.query(query);

  const settings = rows[0] || {};

  const baseFreeMin =
    Number(settings.free_minutes ?? 0);

  const totalFreeMin =
    baseFreeMin +
    Number(extraFreeMinutes || 0);

  const blockMin =
    Number(settings.billing_block_min ?? 1);

  const ratePerBlock =
    Number(settings.rate_per_30min ?? 5);

  const dailyMax =
    Number(settings.daily_max ?? 100);

  const start =
    new Date(checkedInAt);

  const end =
    endedAt
      ? new Date(endedAt)
      : new Date();

  let minutes =
    Math.ceil(
      (end - start) / 60000
    );

  const freeRemainingMinutes =
    Math.max(
      0,
      totalFreeMin - minutes
    );

  if (minutes <= totalFreeMin) {

    return {
      fee: 0,
      free_remaining_minutes:
        freeRemainingMinutes,

      total_free_minutes:
        totalFreeMin
    };

  }

  minutes -= totalFreeMin;

  const blocks =
    Math.ceil(
      minutes / blockMin
    );

  let fee =
    blocks *
    ratePerBlock;

  fee =
    Math.min(
      fee,
      dailyMax
    );

  return {
    fee,
    free_remaining_minutes: 0,
    total_free_minutes:
      totalFreeMin
  };

}


export async function computeFee(
  pool,
  checkedInAt,
  endedAt = null,
  extraFreeMinutes = 0
) {

  const result =
    await computeFeeDetail(
      pool,
      checkedInAt,
      endedAt,
      extraFreeMinutes
    );

  return result.fee;

}