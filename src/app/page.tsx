import { Card } from "@/components/ui/Card";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">לוח בקרה</h1>
        <p className="mt-1 text-sm text-muted">
          זהו שלד תצוגה בלבד. הנתונים יגיעו בהמשך מ-Google Sheets.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="המשמרת הבאה שלי">
          <p className="text-sm text-muted">
            אין עדיין חיבור למקור הנתונים — כאן תוצג המשמרת הקרובה שלך.
          </p>
        </Card>

        <Card title="מי איתי היום">
          <p className="text-sm text-muted">
            כאן יוצגו האנשים שמשובצים איתך לאותה משמרת.
          </p>
        </Card>

        <Card title="התנגשויות">
          <p className="text-sm text-muted">
            כאן יוצגו התנגשויות שזוהו בין שיבוצים.
          </p>
        </Card>

        <Card title="תזכורות">
          <p className="text-sm text-muted">
            תזכורות שנגזרות מהלו״ז שלך יופיעו כאן.
          </p>
        </Card>

        <Card title="מול מנהל">
          <p className="text-sm text-muted">
            השוואה בין הלו״ז שלך לגרסת המנהל תוצג כאן.
          </p>
        </Card>

        <Card title="סטטוס סנכרון">
          <p className="text-sm text-muted">טרם הוגדר חיבור ל-Google Sheets.</p>
        </Card>
      </div>
    </div>
  );
}
