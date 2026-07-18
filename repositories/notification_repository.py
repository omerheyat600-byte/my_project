from database import transaction
from repositories.base_repository import BaseRepository

class NotificationRepository(BaseRepository):
    table = "notification_log"
    id_column = "id"

    def log(self, student_id, parent_phone, message, status, error=None, related_to=None, related_id=None):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO notification_log
                    (student_id, parent_phone, message, status, error, related_to, related_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (student_id, parent_phone, message, status, error, related_to, related_id))
            return cursor.lastrowid

    # ---------- History / reads ----------

    def _filtered(self, status="", related_to="", q=""):
        """Build the shared WHERE clause + params used by find_all/count_all."""
        sql = " WHERE 1=1"
        params = []
        if status:
            sql += " AND status=?"
            params.append(status)
        if related_to:
            sql += " AND related_to=?"
            params.append(related_to)
        if q:
            sql += " AND (student_id LIKE ? OR parent_phone LIKE ? OR message LIKE ?)"
            like = f"%{q}%"
            params.extend([like, like, like])
        return sql, params

    def find_all(self, status="", related_to="", q="", limit=25, offset=0):
        where_sql, params = self._filtered(status, related_to, q)
        sql = f"SELECT * FROM notification_log{where_sql} ORDER BY sent_at DESC LIMIT ? OFFSET ?"
        rows = self._fetchall(sql, params + [limit, offset])
        return [dict(r) for r in rows]

    def count_all(self, status="", related_to="", q=""):
        where_sql, params = self._filtered(status, related_to, q)
        row = self._fetchone(f"SELECT COUNT(*) c FROM notification_log{where_sql}", params)
        return row["c"] if row else 0

    def get_stats(self):
        row = self._fetchone("""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent_count,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count,
                SUM(CASE WHEN DATE(sent_at)=CURDATE() THEN 1 ELSE 0 END) AS today_count
            FROM notification_log
        """)
        if not row:
            return {"total": 0, "sent_count": 0, "failed_count": 0, "today_count": 0}
        return {
            "total": row["total"] or 0,
            "sent_count": row["sent_count"] or 0,
            "failed_count": row["failed_count"] or 0,
            "today_count": row["today_count"] or 0,
        }

    def find_by_student(self, student_id, limit=25):
        rows = self._fetchall("""
            SELECT * FROM notification_log
            WHERE student_id = ?
            ORDER BY sent_at DESC
            LIMIT ?
        """, (student_id, limit))
        return [dict(r) for r in rows]

    def find_student_contact(self, student_id):
        row = self._fetchone(
            "SELECT id, name, parent_phone, grade FROM students WHERE id=?",
            (student_id,)
        )
        return dict(row) if row else None
