<img width="1896" height="950" alt="Screenshot 2026-06-30 150258" src="https://github.com/user-attachments/assets/60c6ea88-e159-4424-808e-9d29a7118fe1" />
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
// System places a single message into a message broker/queue instantly
function notify_all_async(student_ids, message_content) {
    const job_payload = {
        targets: student_ids,
        message: message_content,
        timestamp: new Date()
    };
    
    // Instantaneous operation - non-blocking
    MessageQueue.publish("broadcast_notifications", job_payload);
    return { success: true, message: "Broadcast job successfully queued." };
}

// Independent background worker handles processing and retries safely
function process_queue_worker(job_payload) {
    for (const student_id of job_payload.targets) {
        // 1. Process Database entry
        try {
            save_to_db(student_id, job_payload.message);
        } catch (db_error) {
            Log("backend", "error", "db_worker", "Database insert failed for student: " + student_id);
        }

        // 2. Process real-time WebSockets/SSE push
        push_to_app(student_id, job_payload.message);

        // 3. Process Email asynchronously with independent error recovery
        MessageQueue.publish("send_individual_email", { student_id, message: job_payload.message });
    }
}

# Stage 6

## Priority Inbox Algorithm Implementation

/**
 * Sorts and returns the top 'n' unread notifications based on type weight and recency.
 * @param {Array} notifications - Array of notification objects fetched from the API
 * @param {number} n - Number of top notifications to return
 * @returns {Array} Ranked priority notifications
 */
function getPriorityInbox(notifications, n = 10) {
    // 1. Define type weights as specified by criteria
    const WEIGHTS = {
        'Placement': 300000000000, // Scaled multiplier to balance time differences
        'Result':    200000000000,
        'Event':     100000000000
    };

    // 2. Filter unread items and compute scores
    const scoredNotifications = notifications
        .map(notif => {
            const typeWeight = WEIGHTS[notif.type] || 0;
            const timeParsed = new Date(notif.Timestamp).getTime();
            
            // Priority score combines intrinsic type weight and recency
            const priorityScore = typeWeight + timeParsed;

            return { ...notif, priorityScore };
        });

    // 3. Sort descending by score and slice the top 'n' items
    return scoredNotifications
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, n)
        .map(({ priorityScore, ...originalNotification }) => originalNotification); // Clean up score metadata
}

// Example Usage matching the Test Server API Output structure:
const sampleApiData = [
    { "ID": "1", "type": "Event", "Message": "tech-fest", "Timestamp": "2026-04-22 17:50:06" },
    { "ID": "2", "type": "Placement", "Message": "Advanced Micro Devices hiring", "Timestamp": "2026-04-22 17:49:42" },
    { "ID": "3", "type": "Result", "Message": "project-review", "Timestamp": "2026-04-22 17:50:18" }
];

console.log(getPriorityInbox(sampleApiData, 2));




# Stage 7

## Application Screenshots

# Stage 7

## Application Screenshots

### 🖥️ Desktop View
Here is the notification feed rendering on a desktop layout:

![Desktop Notification View](notification-app-fe/screenshots/desktop-view)
<img width="1907" height="989" alt="Screenshot 2026-06-30 150240" src="https://github.com/user-attachments/assets/5605cd93-7bee-4381-ab3f-9ad0b753851d" />
<img width="1896" height="950" alt="Screenshot 2026-06-30 150258" src="https://github.com/user-attachments/assets/2041e654-90b5-42e2-bb77-ed35ecfb8fac" />
<img width="933" height="783" alt="Screenshot 2026-06-30 145926" src="https://github.com/user-attachments/assets/7f9e5c51-aed4-46a4-80ec-0d27d612c548" />


### 📱 Mobile View
Here is the responsive layout displaying the feed on mobile devices:

<img width="941" height="874" alt="Screenshot 2026-06-30 151101" src="https://github.com/user-attachments/assets/fe057b4e-5ccc-446c-8a36-c2c8aaa95e6b" />
