# Notification System Design

## Stage 1

### Overview
The notification platform allows students to receive real-time updates regarding Placements, Events, and Results. The core actions supported are: fetching notifications (all, paginated, filtered by type), fetching only unread notifications, marking notifications as read, and receiving real-time push updates when a new notification is created.

### REST API Endpoints

#### 1. Get All Notifications
`GET /api/notifications`

Query Parameters:
- `page` (number, optional, default=1)
- `limit` (number, optional, default=20)
- `type` (string, optional — one of `Event`, `Result`, `Placement`)
- `isRead` (boolean, optional — filter by read/unread)

Headers:
## Stage 2

### Database Choice
We choose **PostgreSQL** (relational/SQL) for persistent storage. Notifications have a fixed, well-defined schema (studentId, type, message, timestamp, read status), strong consistency is required (a notification must never be lost or duplicated), and we need efficient filtering/sorting by studentId, type, and timestamp — all of which relational databases handle well with proper indexing. NoSQL would be considered only if notification structure became highly variable per type, which is not the case here.

### Schema

```sql
CREATE TABLE students (
    student_id BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id BIGINT NOT NULL REFERENCES students(student_id),
    notification_type notification_type NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_student_unread 
    ON notifications (student_id, is_read, created_at DESC);

CREATE INDEX idx_notifications_type_created 
    ON notifications (notification_type, created_at DESC);
```

### Problems as Data Volume Increases
As notifications grow into millions of rows: (1) queries filtering by `student_id` + `is_read` will slow down without proper composite indexing; (2) `ORDER BY created_at` on large unindexed result sets becomes expensive; (3) table bloat affects vacuum/maintenance performance in Postgres; (4) a single table holding all historical notifications forever grows unbounded.

### Solutions
Use composite indexes matching actual query patterns (as above). Partition the `notifications` table by `created_at` (monthly/quarterly range partitioning) so old data can be archived or queried separately without scanning the whole table. Periodically archive notifications older than e.g. 6 months into a cold-storage/archive table. Use connection pooling (PgBouncer) to handle high concurrent read load.

### Sample Queries (matching Stage 1 APIs)

Get paginated notifications for a student:
```sql
SELECT * FROM notifications
WHERE student_id = 1042
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

Get unread count:
```sql
SELECT COUNT(*) FROM notifications
WHERE student_id = 1042 AND is_read = false;
```

Mark as read:
```sql
UPDATE notifications SET is_read = true WHERE id = '<uuid>';
```

Create notification:
```sql
INSERT INTO notifications (student_id, notification_type, message)
VALUES (1042, 'Result', 'mid-sem');
```

---

## Stage 3

### Is the original query accurate? Why is it slow?
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```
The query is logically correct but performs poorly at scale (50,000 students, 5,000,000 notifications) because, without a composite index on `(studentID, isRead, createdAt)`, the database must scan a large portion of the table (or use a single-column index and then sort separately), causing high I/O and CPU cost. `SELECT *` also pulls unnecessary columns, increasing I/O.

### Computation Cost
Without proper indexing, this becomes a sequential/filtered scan across millions of rows per request — O(n) per query, which is unacceptable for a frequently-called API at this scale.

### Is "index every column" good advice?
No. Indexing every column is not effective and often harmful: each index adds write overhead (every INSERT/UPDATE must update all indexes), consumes additional disk space, and most single-column indexes won't be used efficiently for combined WHERE + ORDER BY queries. The correct approach is targeted **composite indexes** matching actual query patterns (e.g., `(student_id, is_read, created_at)`), not blanket indexing.

### Query: Students who got a placement notification in the last 7 days
```sql
SELECT DISTINCT student_id
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```
This benefits from the `idx_notifications_type_created` index defined in Stage 2.

---

## Stage 4

### Problem
Notifications are fetched on every page load for every student, overwhelming the DB.

### Solutions & Tradeoffs

**1. Caching (Redis)**
Cache each student's recent/unread notifications in Redis with a short TTL (e.g., 30–60 seconds), invalidated/updated when a new notification is created for that student.
- Tradeoff: Adds infrastructure complexity and a small risk of stale data within the TTL window, but massively reduces DB load for repeated reads.

**2. Real-time push instead of polling (WebSockets, from Stage 1)**
Instead of fetching on every page load, push new notifications to connected clients and let the frontend maintain state in memory. The DB is only hit once on initial load, not on every render/page visit.
- Tradeoff: Requires maintaining persistent WebSocket connections and a pub/sub system (e.g., Redis Pub/Sub) for scaling across multiple backend instances, but eliminates repeated polling entirely.

**3. Pagination + lazy loading**
Only fetch the first 20 notifications initially (as designed in Stage 1's `limit`/`page` params); fetch more only on scroll/explicit action.
- Tradeoff: Slightly more complex frontend logic, but drastically reduces payload size and DB query cost per request.

**4. CDN/Edge caching for read-heavy, less personalized data** is not very applicable here since data is per-student, but a combination of Redis caching + WebSocket push + pagination together gives the best balance of freshness and scalability.

---

## Stage 5

### Shortcomings of the pseudocode