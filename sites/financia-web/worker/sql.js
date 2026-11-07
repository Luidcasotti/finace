// One SQLite statement creates every missing month atomically. The unique key also
// preserves edited/deleted occurrences when a month is opened again.
export const recurringSQL = `
WITH RECURSIVE months(id,user_id,kind,title,category,amount,start_date,end_month,m) AS (
  SELECT id,user_id,kind,title,category,amount,start_date,end_month,substr(start_date,1,7)||'-01'
  FROM recurring WHERE user_id=? AND substr(start_date,1,7)<=?
    AND (end_month IS NULL OR end_month>=substr(start_date,1,7))
  UNION ALL
  SELECT id,user_id,kind,title,category,amount,start_date,end_month,date(m,'+1 month')
  FROM months WHERE substr(date(m,'+1 month'),1,7)<=?
    AND (end_month IS NULL OR substr(date(m,'+1 month'),1,7)<=end_month)
)
INSERT OR IGNORE INTO entries(id,user_id,kind,title,category,amount,due_date,recurring_id,occurrence_month)
SELECT lower(hex(randomblob(16))),user_id,kind,title,category,amount,
  date(m,'+'||(min(CAST(substr(start_date,9,2) AS INTEGER),CAST(strftime('%d',date(m,'+1 month','-1 day')) AS INTEGER))-1)||' days'),id,substr(m,1,7)
FROM months`;

// The balance check lives INSIDE the INSERT. Concurrent requests cannot both
// spend the same money after reading an earlier balance. Every affected date is
// checked, including withdrawals made after a backdated movement.
export const transferSQL = `
WITH affected(day) AS (
  SELECT ? UNION SELECT ?
  UNION SELECT settled_on FROM entries WHERE user_id=? AND deleted=0 AND settled_on>=?
  UNION SELECT date FROM transfers WHERE user_id=? AND date>=?
)
INSERT INTO transfers(id,user_id,reserve_id,amount,date,note)
SELECT ?,?,?,?,?,?
WHERE NOT EXISTS (
  SELECT 1 FROM affected WHERE
  CASE WHEN ?='withdraw' THEN
    COALESCE((SELECT SUM(amount) FROM transfers WHERE user_id=? AND reserve_id=? AND date<=affected.day),0) < ?
  ELSE
    COALESCE((SELECT SUM(CASE WHEN kind='income' THEN amount ELSE -amount END) FROM entries WHERE user_id=? AND deleted=0 AND settled_on<=affected.day),0)
    - COALESCE((SELECT SUM(amount) FROM transfers WHERE user_id=? AND date<=affected.day),0) < ?
  END
)`;
